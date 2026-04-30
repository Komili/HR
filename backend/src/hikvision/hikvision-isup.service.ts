/**
 * ISUP5.0 (EHome) TCP server — двунаправленный канал с Hikvision устройствами.
 *
 * Как работает:
 *  1. Устройство само устанавливает TCP-соединение с сервером (обходит NAT)
 *  2. После handshake сервер может отправлять ISAPI-команды через тот же сокет
 *  3. Устройство выполняет команду и возвращает ответ
 *
 * Настройка на устройстве: Сеть → Доступ к устройству → ISUP → Включить
 *   IP сервера: <наш VPS IP>
 *   Порт: 7660
 *   Идентификатор устройства: произвольный (используем для идентификации)
 */

import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import * as net from 'net';
import * as crypto from 'crypto';

// ─── ISUP5.0 константы ───────────────────────────────────────────────────────

const ISUP_MAGIC   = 0x20;
const ISUP_VER     = 0x05;
const HEADER_SIZE  = 20;

const MSG_REGISTER      = 0x01;
const MSG_REGISTER_ACK  = 0x02;
const MSG_HEARTBEAT     = 0x03;
const MSG_HEARTBEAT_ACK = 0x04;
const MSG_ISAPI_FORWARD = 0x06; // server → device (ISAPI tunnel request)
const MSG_ISAPI_ACK     = 0x07; // device → server (ISAPI tunnel response)

// Фиксированные размеры полей в ISAPI-tunnel payload (ISUP5.0 spec)
const URL_SIZE          = 256;
const METHOD_SIZE       = 8;
const CONTENT_TYPE_SIZE = 64;
const HEADERS_SIZE      = 128;
const ISAPI_PREFIX_SIZE = URL_SIZE + METHOD_SIZE + CONTENT_TYPE_SIZE + HEADERS_SIZE + 4; // +4 for bodyLen

// ─── Типы ────────────────────────────────────────────────────────────────────

interface PendingReq {
  resolve: (body: string) => void;
  reject: (err: Error) => void;
  timer: NodeJS.Timeout;
}

interface IsupSocket {
  socket: net.Socket;
  mac: string;
  deviceId: string;
  seqNum: number;
  pending: Map<number, PendingReq>;
  buf: Buffer;
  connectedAt: Date;
  remoteAddr: string;
  probeHandled?: boolean;
  heartbeatTimer?: NodeJS.Timeout;
  encryptKey?: Buffer; // AES-128-ECB ключ если устройство использует шифрование
}

// ─── Сервис ──────────────────────────────────────────────────────────────────

@Injectable()
export class HikvisionIsupService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('ISUP');
  private server: net.Server | null = null;

  /** Подключённые устройства: MAC (lowercase) → состояние сокета */
  private readonly sockets = new Map<string, IsupSocket>();
  /** Маппинг DeviceID → MAC для поиска по ID устройства */
  private readonly idToMac = new Map<string, string>();

  onModuleInit() {
    const port = parseInt(process.env.ISUP_PORT || '7660');
    this.start(port);
  }

  onModuleDestroy() {
    for (const s of this.sockets.values()) s.socket.destroy();
    this.server?.close();
  }

  // ─── TCP server ────────────────────────────────────────────────────────────

  private start(port: number) {
    this.server = net.createServer(sock => this.onConnection(sock));
    this.server.on('error', e => this.logger.error(`Server error: ${e.message}`));
    this.server.listen(port, '0.0.0.0', () => {
      this.logger.log(`🔌 ISUP сервер слушает :${port} (Hikvision устройства → этот порт)`);
    });
  }

  private onConnection(socket: net.Socket) {
    const addr = `${socket.remoteAddress}:${socket.remotePort}`;
    this.logger.log(`Новое ISUP соединение от ${addr}`);

    const state: IsupSocket = {
      socket, mac: '', deviceId: '', seqNum: 0,
      pending: new Map(), buf: Buffer.alloc(0),
      connectedAt: new Date(), remoteAddr: addr,
    };

    socket.on('data', chunk => {
      if (!state.mac) {
        this.logger.debug(`Первые байты от ${addr}: ${chunk.slice(0, 32).toString('hex')} (len=${chunk.length})`);
      } else {
        // После регистрации — логируем ВСЁ входящее для отладки
        this.logger.debug(`[${state.deviceId}] chunk ${chunk.length}B: ${chunk.slice(0, 32).toString('hex')}`);
      }
      state.buf = Buffer.concat([state.buf, chunk]);
      this.drain(state);
    });

    socket.on('close', () => {
      if (state.heartbeatTimer) clearInterval(state.heartbeatTimer);
      if (state.mac) {
        this.sockets.delete(state.mac);
        if (state.deviceId) this.idToMac.delete(state.deviceId);
        this.logger.log(`🔌 Отключено: ${state.deviceId} (${state.mac})`);
      }
      for (const p of state.pending.values()) {
        clearTimeout(p.timer);
        p.reject(new Error('Соединение разорвано'));
      }
      state.pending.clear();
    });

    socket.on('error', e => this.logger.debug(`Ошибка сокета ${addr}: ${e.message}`));
    socket.setTimeout(120_000, () => socket.destroy()); // 2-min idle timeout
  }

  // ─── Разбор входящих пакетов ───────────────────────────────────────────────

  private drain(state: IsupSocket) {
    // EHome2.0 probe: устройство шлёт [0x10, 0x58] = "заголовок, далее 88 байт".
    // Эхо только если probe пришёл ОТДЕЛЬНО (без регистрации). Если вместе — молчим.
    if (!state.probeHandled && state.buf.length >= 2 && state.buf[0] === 0x10) {
      const probeLen = state.buf[1];
      const probeAlone = state.buf.length === 2; // probe пришёл отдельно от регистрации
      if (probeAlone) {
        this.logger.debug(`Probe [10 ${probeLen.toString(16)}] ОТДЕЛЬНО от ${state.remoteAddr} — эхо`);
        try { state.socket.write(Buffer.from([0x10, probeLen])); } catch {}
      } else {
        this.logger.debug(`Probe [10 ${probeLen.toString(16)}] ВМЕСТЕ с регистрацией от ${state.remoteAddr} — без эхо`);
      }
      state.buf = state.buf.slice(2);
      state.probeHandled = true;
      if (state.buf.length === 0) return;
    }

    // Обрабатываем накопившиеся данные
    while (state.buf.length > 0) {
      const first = state.buf[0];

      // ── ISUP5.0 формат (magic 0x20) ────────────────────────────────────────
      if (first === ISUP_MAGIC) {
        if (state.buf.length < HEADER_SIZE) break;

        const payloadLen = state.buf.readUInt32LE(12);
        if (payloadLen > 1_000_000) { state.buf = Buffer.alloc(0); break; }
        if (state.buf.length < HEADER_SIZE + payloadLen) break;

        const msgType    = state.buf[3];
        const seqNum     = state.buf.readUInt32LE(4);
        const encryptFlag = state.buf[2];
        const payload    = state.buf.slice(HEADER_SIZE, HEADER_SIZE + payloadLen);
        state.buf = state.buf.slice(HEADER_SIZE + payloadLen);

        let msgPayload: Buffer<ArrayBufferLike> = payload;
        if (encryptFlag !== 0x00) {
          const keyBuf = this.getIsupEncKey();
          if (!keyBuf) {
            this.logger.warn(`⚠️  Зашифрованный ISUP5 пакет от ${state.remoteAddr} — добавь ISUP_ENC_KEY в .env`);
            state.socket.destroy();
            return;
          }
          try {
            msgPayload = this.decryptIsup(payload, keyBuf);
            state.encryptKey = keyBuf;
          } catch (e: any) {
            this.logger.warn(`Ошибка дешифровки ISUP от ${state.remoteAddr}: ${e.message}`);
            state.socket.destroy();
            return;
          }
        }
        this.handleMsg(state, msgType, seqNum, msgPayload);
        continue;
      }

      // ── EHome протокол (DS-K серия: Face ID терминалы) ─────────────────────
      // Register (0x01 + 0x01): DS-K всегда шлёт фиксированные 88 байт
      if (first === 0x01 && state.buf.length >= 2 && state.buf[1] === 0x01) {
        if (state.buf.length < 88) break;
        this.handleEHome(state, state.buf.slice(0, 88));
        state.buf = state.buf.slice(88);
        continue;
      }

      // Остальные EHome команды (heartbeat 0x03, и др.):
      // формат — 4-байт заголовок [cmd, sub, lenHi, lenLo] + payload
      if (state.buf.length < 4) break;
      const eLen = state.buf.readUInt16BE(2);
      if (eLen > 65535) { state.buf = state.buf.slice(1); continue; }
      const eTot = 4 + eLen;
      if (state.buf.length < eTot) break;
      this.handleEHome(state, state.buf.slice(0, eTot));
      state.buf = state.buf.slice(eTot);
    }
  }

  private handleMsg(state: IsupSocket, type: number, seq: number, payload: Buffer) {
    switch (type) {
      case MSG_REGISTER:
        this.onRegister(state, seq, payload);
        break;

      case MSG_HEARTBEAT:
        this.send(state.socket, MSG_HEARTBEAT_ACK, seq, Buffer.alloc(0), state.encryptKey);
        break;

      case MSG_ISAPI_ACK:
        this.onIsapiResponse(state, seq, payload);
        break;

      case 0x05: // Data/event from device — ignore, handled by HTTP webhook
        break;

      case 0x1A: // Key Exchange (устройство шлёт при включённом шифровании)
        this.send(state.socket, 0x1B, seq, Buffer.alloc(0), state.encryptKey);
        break;

      default:
        this.logger.debug(`Неизвестный тип 0x${type.toString(16)} от ${state.mac || state.remoteAddr}: ${payload.slice(0,40).toString('hex')}`);
    }
  }

  // ─── Регистрация устройства ────────────────────────────────────────────────

  private onRegister(state: IsupSocket, seq: number, payload: Buffer) {
    let mac = '';
    let deviceId = '';

    try {
      const json = payload.toString('utf8').replace(/\0/g, '').trim();
      const data = JSON.parse(json);
      // Разные версии прошивок используют разные имена полей
      mac      = (data.mac || data.MAC || data?.dInfo?.mac || data?.loginInfo?.mac || '').toLowerCase();
      deviceId = data.devID || data.deviceID || data.DeviceID || data?.dInfo?.devID || '';
    } catch {
      this.logger.warn(`Не удалось разобрать ISUP register payload от ${state.remoteAddr}`);
    }

    state.mac = mac || crypto.randomBytes(6).toString('hex'); // fallback если нет MAC
    state.deviceId = deviceId;

    // Сохраняем сокет
    this.sockets.set(state.mac, state);
    if (deviceId) this.idToMac.set(deviceId, state.mac);

    this.logger.log(`✅ ISUP зарегистрировано: ${deviceId || '?'} MAC=${state.mac} IP=${state.remoteAddr}`);

    // Отправляем подтверждение
    const ack = Buffer.from(JSON.stringify({
      statusCode: 200,
      statusString: 'OK',
      statusDescription: 'Success',
    }), 'utf8');
    this.send(state.socket, MSG_REGISTER_ACK, seq, ack, state.encryptKey);
  }

  // ─── Ответ на ISAPI-команду ────────────────────────────────────────────────

  private onIsapiResponse(state: IsupSocket, seq: number, payload: Buffer) {
    const pending = state.pending.get(seq);
    if (!pending) return;

    state.pending.delete(seq);
    clearTimeout(pending.timer);

    try {
      if (payload.length < 8) {
        pending.reject(new Error('Слишком короткий ответ от устройства'));
        return;
      }
      const statusCode = payload.readUInt32LE(0);
      const bodyLen    = payload.readUInt32LE(4);
      const body       = payload.toString('utf8', 8, 8 + Math.min(bodyLen, payload.length - 8));

      if (statusCode >= 400) {
        pending.reject(new Error(`ISAPI HTTP ${statusCode}: ${body.substring(0, 200)}`));
      } else {
        pending.resolve(body);
      }
    } catch (e) {
      pending.reject(e as Error);
    }
  }

  // ─── Отправка пакета ───────────────────────────────────────────────────────

  private getIsupEncKey(): Buffer | undefined {
    const encKey = process.env.ISUP_ENC_KEY || '';
    if (!encKey) return undefined;
    const keyBuf = Buffer.alloc(16, 0);
    Buffer.from(encKey, 'utf8').copy(keyBuf, 0, 0, 16);
    return keyBuf;
  }

  private decryptIsup(payload: Buffer, keyBuf: Buffer): Buffer {
    if (payload.length === 0) return payload;
    const alignedLen = Math.ceil(payload.length / 16) * 16;
    const padded = Buffer.alloc(alignedLen, 0);
    payload.copy(padded);
    const decipher = crypto.createDecipheriv('aes-128-ecb', keyBuf, null);
    decipher.setAutoPadding(false);
    return Buffer.from(Buffer.concat([decipher.update(padded), decipher.final()]));
  }

  private encryptIsup(payload: Buffer, keyBuf: Buffer): Buffer {
    if (payload.length === 0) return payload;
    const alignedLen = Math.ceil(payload.length / 16) * 16;
    const padded = Buffer.alloc(alignedLen, 0);
    payload.copy(padded);
    const cipher = crypto.createCipheriv('aes-128-ecb', keyBuf, null);
    cipher.setAutoPadding(false);
    return Buffer.from(Buffer.concat([cipher.update(padded), cipher.final()]));
  }

  private send(socket: net.Socket, type: number, seq: number, payload: Buffer, encryptKey?: Buffer) {
    let outPayload = payload;
    let encryptFlag = 0x00;
    if (encryptKey && payload.length > 0) {
      outPayload = this.encryptIsup(payload, encryptKey);
      encryptFlag = 0x02;
    }
    const hdr = Buffer.alloc(HEADER_SIZE);
    hdr[0] = ISUP_MAGIC;
    hdr[1] = ISUP_VER;
    hdr[2] = encryptFlag;
    hdr[3] = type;
    hdr.writeUInt32LE(seq, 4);
    hdr.writeUInt32LE(0, 8);               // sessionId = 0
    hdr.writeUInt32LE(outPayload.length, 12);
    hdr.writeUInt32LE(0, 16);              // reserved
    try { socket.write(Buffer.concat([hdr, outPayload])); } catch {}
  }

  // ─── Публичный API ─────────────────────────────────────────────────────────

  /** Проверить — подключено ли устройство (по MAC, ISUP ID или серийнику) */
  isConnected(identifier: string): boolean {
    const key = identifier.toLowerCase();
    let s = this.sockets.get(key);
    if (!s) {
      const mac = this.idToMac.get(key);
      if (mac) s = this.sockets.get(mac);
    }
    return !!s && !s.socket.destroyed;
  }

  /** Все подключённые устройства */
  getConnectedDevices(): Array<{ mac: string; deviceId: string; connectedAt: Date; remoteAddr: string }> {
    return [...this.sockets.values()].map(s => ({
      mac: s.mac,
      deviceId: s.deviceId,
      connectedAt: s.connectedAt,
      remoteAddr: s.remoteAddr,
    }));
  }

  /**
   * Отправить ISAPI-команду на устройство через ISUP-туннель.
   * Возвращает тело ответа (JSON строка).
   * Кидает ошибку если устройство не подключено или таймаут.
   */
  async sendIsapi(
    mac: string,
    method: 'GET' | 'POST' | 'PUT' | 'DELETE',
    urlPath: string,
    body?: string,
    timeoutMs = 15_000,
  ): Promise<string> {
    const key = mac.toLowerCase();
    let state = this.sockets.get(key);
    if (!state) {
      const resolvedKey = this.idToMac.get(key);
      if (resolvedKey) state = this.sockets.get(resolvedKey);
    }
    if (!state || state.socket.destroyed) {
      throw new Error(`Устройство ${mac} не подключено по ISUP`);
    }

    // Формируем payload для ISAPI-туннеля (ISUP5.0 формат)
    const urlBuf  = Buffer.alloc(URL_SIZE);
    urlBuf.write(urlPath, 0, 'utf8');

    const methodBuf = Buffer.alloc(METHOD_SIZE);
    methodBuf.write(method, 0, 'utf8');

    const ctBuf = Buffer.alloc(CONTENT_TYPE_SIZE);
    ctBuf.write('application/json', 0, 'utf8');

    const hdrBuf  = Buffer.alloc(HEADERS_SIZE); // пустые кастомные заголовки
    const bodyBuf = body ? Buffer.from(body, 'utf8') : Buffer.alloc(0);
    const lenBuf  = Buffer.alloc(4);
    lenBuf.writeUInt32LE(bodyBuf.length, 0);

    const payload = Buffer.concat([urlBuf, methodBuf, ctBuf, hdrBuf, lenBuf, bodyBuf]);
    const seq = ++state.seqNum;

    return new Promise<string>((resolve, reject) => {
      const timer = setTimeout(() => {
        state.pending.delete(seq);
        reject(new Error(`ISAP timeout (${timeoutMs / 1000}s) для ${urlPath}`));
      }, timeoutMs);

      state.pending.set(seq, { resolve, reject, timer });
      this.send(state.socket, MSG_ISAPI_FORWARD, seq, payload, state.encryptKey);
    });
  }

  // ─── EHome протокол (DS-K серия: Face ID терминалы) ───────────────────────

  /**
   * EHome2.0 Register ACK.
   *
   * Пакет регистрации 88 байт:
   *   offset 0-1:   cmd=0x01 sub=0x01
   *   offset 2-3:   devIdLen (BE)
   *   offset 4..:   serial, model, flags, isupId
   *   offset 42-73: 32-байт случайный challenge (меняется каждое подключение)
   *
   * ACK без шифрования: [0x02][0x01][0x00][0x04] + timestamp_BE_4
   * ACK с шифрованием:  [0x02][0x01][0x00][0x20] + AES-128-ECB(ch[0:16], key) + AES-128-ECB(ch[16:32], key)
   */
  private eHomeAckAttempt = 0;

  private aes128ecb(data16: Buffer, keyBuf: Buffer): Buffer {
    return Buffer.from(
      crypto.createCipheriv('aes-128-ecb', keyBuf, null).setAutoPadding(false).update(data16),
    );
  }

  private aes128ecbDec(data16: Buffer, keyBuf: Buffer): Buffer {
    return Buffer.from(
      crypto.createDecipheriv('aes-128-ecb', keyBuf, null).setAutoPadding(false).update(data16),
    );
  }

  private buildEHomeAck(regPacket: Buffer): Buffer {
    const encKey = process.env.ISUP_ENC_KEY || '';
    const ts = Math.floor(Date.now() / 1000);
    const tsBuf = Buffer.alloc(4);
    tsBuf.writeUInt32BE(ts, 0);

    // Без ключа — plain timestamp
    if (!encKey || regPacket.length < 74) {
      this.logger.log('EHome ACK: plain-ts (нет ISUP_ENC_KEY)');
      return Buffer.concat([Buffer.from([0x02, 0x01, 0x00, 0x04]), tsBuf]);
    }

    // Ключ: первые 16 байт (UTF-8), дополнить нулями если короче
    const keyBuf = Buffer.alloc(16, 0);
    Buffer.from(encKey, 'utf8').copy(keyBuf, 0, 0, 16);

    const ch = regPacket.slice(42, 42 + 32); // 32-байт challenge
    const enc32 = Buffer.concat([this.aes128ecb(ch.slice(0, 16), keyBuf), this.aes128ecb(ch.slice(16, 32), keyBuf)]);
    const enc16 = this.aes128ecb(ch.slice(0, 16), keyBuf);
    const dec32 = Buffer.concat([this.aes128ecbDec(ch.slice(0, 16), keyBuf), this.aes128ecbDec(ch.slice(16, 32), keyBuf)]);
    const dec16 = this.aes128ecbDec(ch.slice(0, 16), keyBuf);

    // Производные ключи: MD5 и SHA256 — Hikvision в некоторых прошивках хэширует пароль
    const md5Key  = crypto.createHash('md5').update(encKey, 'utf8').digest();                    // 16 bytes
    const sha16   = crypto.createHash('sha256').update(encKey, 'utf8').digest().slice(0, 16);    // 16 bytes
    // Ключ первые 10 символов + pad (старый формат некоторых DS-K)
    const key10   = Buffer.alloc(16, 0);
    Buffer.from(encKey, 'utf8').copy(key10, 0, 0, 10);

    const HDR = [0x02, 0x01];
    const v = (key: Buffer, ch16: Buffer) => this.aes128ecb(ch16, key);

    const variants: Buffer[] = [
      // ── raw key ────────────────────────────────────────────────────────────
      Buffer.concat([Buffer.from([...HDR, 0x00, 0x10]), this.aes128ecb(ch.slice(0, 16), keyBuf)]),   // 0: enc16, raw key
      Buffer.concat([Buffer.from([...HDR, 0x00, 0x20]), this.aes128ecb(ch.slice(0, 16), keyBuf), this.aes128ecb(ch.slice(16, 32), keyBuf)]), // 1: enc32, raw key
      // ── MD5(key) ──────────────────────────────────────────────────────────
      Buffer.concat([Buffer.from([...HDR, 0x00, 0x10]), v(md5Key, ch.slice(0, 16))]),               // 2: enc16, md5 key
      Buffer.concat([Buffer.from([...HDR, 0x00, 0x20]), v(md5Key, ch.slice(0, 16)), v(md5Key, ch.slice(16, 32))]), // 3: enc32, md5 key
      // ── SHA256(key)[0:16] ─────────────────────────────────────────────────
      Buffer.concat([Buffer.from([...HDR, 0x00, 0x10]), v(sha16, ch.slice(0, 16))]),               // 4: enc16, sha key
      Buffer.concat([Buffer.from([...HDR, 0x00, 0x20]), v(sha16, ch.slice(0, 16)), v(sha16, ch.slice(16, 32))]), // 5: enc32, sha key
      // ── 10-byte key padded ─────────────────────────────────────────────────
      Buffer.concat([Buffer.from([...HDR, 0x00, 0x10]), v(key10, ch.slice(0, 16))]),               // 6: enc16, key10
      // ── decrypt variants with raw key ──────────────────────────────────────
      Buffer.concat([Buffer.from([...HDR, 0x00, 0x10]), this.aes128ecbDec(ch.slice(0, 16), keyBuf)]), // 7: dec16, raw key
      Buffer.concat([Buffer.from([...HDR, 0x00, 0x20]), this.aes128ecbDec(ch.slice(0, 16), keyBuf), this.aes128ecbDec(ch.slice(16, 32), keyBuf)]), // 8: dec32, raw key
    ];

    const attempt = this.eHomeAckAttempt++ % variants.length;
    const ack = variants[attempt];
    this.logger.log(`EHome ACK attempt=${attempt}/${variants.length} ch=${ch.slice(0, 4).toString('hex')}.. ack=${ack.toString('hex')}`);
    return ack;
  }

  private handleEHome(state: IsupSocket, data: Buffer) {
    if (data.length < 2) return;

    const msgType = data[0];
    const subType = data[1];

    this.logger.debug(
      `EHome type=0x${msgType.toString(16).padStart(2, '0')} ` +
      `sub=0x${subType.toString(16).padStart(2, '0')} ` +
      `len=${data.length}: ${data.slice(0, 60).toString('hex')}`,
    );

    switch (msgType) {
      case 0x01: // Register
        this.onEHomeRegister(state, data);
        break;

      case 0x03: // Heartbeat — отвечаем cmd=0x03, sub=0x00, len=0x0000
        try { state.socket.write(Buffer.from([0x03, 0x00, 0x00, 0x00])); } catch {}
        this.logger.debug(`EHome heartbeat от ${state.deviceId || state.remoteAddr}`);
        break;

      default:
        this.logger.debug(`EHome: неизвестный тип 0x${msgType.toString(16)} от ${state.remoteAddr}`);
    }
  }

  private onEHomeRegister(state: IsupSocket, data: Buffer) {
    let offset = 2; // пропускаем type + subtype
    let deviceId = '';
    let model = '';
    let isupId = '';

    try {
      // Device serial: 2 байта big-endian длина + UTF-8 строка
      const devIdLen = data.readUInt16BE(offset); offset += 2;
      deviceId = data.toString('utf8', offset, offset + devIdLen).replace(/\0/g, '').trim();
      offset += devIdLen;

      // Model: 1 байт длина + UTF-8 строка
      if (offset < data.length) {
        const modelLen = data[offset]; offset += 1;
        model = data.toString('utf8', offset, offset + modelLen).replace(/\0/g, '').trim();
        offset += modelLen;
      }

      // 2 неизвестных байта (флаги/версия), затем ISUP Device ID
      if (offset + 3 < data.length) {
        offset += 2; // пропускаем 2 байта флагов
        const isupIdLen = data[offset]; offset += 1;
        if (isupIdLen > 0 && offset + isupIdLen <= data.length) {
          isupId = data.toString('utf8', offset, offset + isupIdLen).replace(/\0/g, '').trim();
          offset += isupIdLen;
        }
      }

      // Логируем остаток для анализа MAC и других полей
      if (offset < data.length) {
        this.logger.debug(`EHome register остаток (${data.length - offset} байт): ${data.slice(offset).toString('hex')}`);
      }
    } catch (e: any) {
      this.logger.warn(`EHome: ошибка парсинга от ${state.remoteAddr}: ${e.message}`);
    }

    // Используем ISUP ID или серийник как ключ сокета
    const key = (isupId || deviceId || crypto.randomBytes(6).toString('hex')).toLowerCase();
    state.mac = key; // поле mac используем как универсальный ключ
    state.deviceId = isupId || deviceId;

    this.sockets.set(key, state);
    if (isupId) this.idToMac.set(isupId, key);
    if (deviceId) this.idToMac.set(deviceId, key);

    this.logger.log(
      `✅ EHome зарегистрировано: serial=${deviceId} model=${model} isupId=${isupId} IP=${state.remoteAddr}`,
    );

    // EHome2.0 Register ACK
    const ack = this.buildEHomeAck(data);
    this.logger.debug(`EHome → device ACK (${ack.length} bytes): ${ack.toString('hex')}`);
    try { state.socket.write(ack); } catch {}
    void offset;

    // Heartbeat каждые 5 секунд — устройство ожидает сигнал от сервера
    state.heartbeatTimer = setInterval(() => {
      if (state.socket.destroyed) { clearInterval(state.heartbeatTimer!); return; }
      try { state.socket.write(Buffer.from([0x03, 0x00, 0x00, 0x00])); } catch {
        clearInterval(state.heartbeatTimer!);
      }
    }, 5_000);
  }
}
