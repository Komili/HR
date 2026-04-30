/**
 * HRMS Door Access Relay Agent v1.0
 * ===================================
 * Запускается в локальной сети офиса.
 * Опрашивает центральный HRMS сервер и выполняет команды
 * на устройствах Hikvision Face ID через локальный HTTP.
 *
 * Требования: Node.js 18+ (встроенные модули, без npm install)
 */

'use strict';

const http = require('http');
const https = require('https');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

// ─────────────────────────────────────────────────────────────
//  Загрузка конфига
// ─────────────────────────────────────────────────────────────

const CONFIG_PATH = path.join(__dirname, 'config.json');

if (!fs.existsSync(CONFIG_PATH)) {
  console.error('❌ Файл config.json не найден!');
  console.error('   Скопируй config.example.json → config.json и заполни значения.');
  process.exit(1);
}

const CONFIG = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8').replace(/^﻿/, ''));

const {
  serverUrl,
  agentToken,
  companyId,
  pollIntervalMs = 5000,
  hikvisionTimeoutMs = 10000,
  deviceCheckIntervalMs = 30000,
  logFile = 'agent.log',
  logMaxSizeMb = 10,
} = CONFIG;

if (!serverUrl || !agentToken || !companyId) {
  console.error('❌ В config.json не заполнены обязательные поля: serverUrl, agentToken, companyId');
  process.exit(1);
}

// ─────────────────────────────────────────────────────────────
//  Логирование
// ─────────────────────────────────────────────────────────────

const LOG_PATH = logFile ? path.join(__dirname, logFile) : null;

function log(level, msg) {
  const ts = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const line = `[${ts}] [${level}] ${msg}`;
  console.log(line);

  if (LOG_PATH) {
    // Ротация лога если превысил размер
    try {
      const stat = fs.existsSync(LOG_PATH) ? fs.statSync(LOG_PATH) : null;
      if (stat && stat.size > logMaxSizeMb * 1024 * 1024) {
        fs.renameSync(LOG_PATH, LOG_PATH + '.old');
      }
      fs.appendFileSync(LOG_PATH, line + '\n');
    } catch (_) {}
  }
}

const info  = (msg) => log('INFO ', msg);
const warn  = (msg) => log('WARN ', msg);
const error = (msg) => log('ERROR', msg);
const ok    = (msg) => log('OK   ', msg);

// ─────────────────────────────────────────────────────────────
//  HTTP утилиты
// ─────────────────────────────────────────────────────────────

/** JSON-запрос к центральному серверу */
function serverRequest(method, urlPath, body = null) {
  return new Promise((resolve, reject) => {
    const url = new URL(urlPath, serverUrl);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;

    const bodyStr = body ? JSON.stringify(body) : null;
    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname + url.search,
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Agent-Token': agentToken,
        ...(bodyStr ? { 'Content-Length': Buffer.byteLength(bodyStr) } : {}),
      },
      timeout: 15000,
      // Не проверяем self-signed сертификат (для тестовых сред)
      rejectUnauthorized: false,
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', chunk => (data += chunk));
      res.on('end', () => {
        if (res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode}: ${data}`));
          return;
        }
        try { resolve(JSON.parse(data)); } catch { resolve(data); }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout сервера')); });
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

/** Скачать фото сотрудника с сервера → Buffer */
function downloadPhoto(employeeId) {
  return new Promise((resolve, reject) => {
    const url = new URL(`/api/agent/photo/${employeeId}`, serverUrl);
    const isHttps = url.protocol === 'https:';
    const lib = isHttps ? https : http;

    const options = {
      hostname: url.hostname,
      port: url.port || (isHttps ? 443 : 80),
      path: url.pathname,
      method: 'GET',
      headers: { 'X-Agent-Token': agentToken },
      timeout: 30000,
      rejectUnauthorized: false,
    };

    const req = lib.request(options, (res) => {
      if (res.statusCode === 404) { resolve(null); return; }
      if (res.statusCode >= 400) { reject(new Error(`Фото HTTP ${res.statusCode}`)); return; }
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout фото')); });
    req.end();
  });
}

// ─────────────────────────────────────────────────────────────
//  Hikvision ISAPI — Digest Auth
// ─────────────────────────────────────────────────────────────

function extractDigestParam(header, param) {
  const m = header.match(new RegExp(`${param}="([^"]+)"`));
  return m ? m[1] : '';
}

function buildDigestAuth(wwwAuth, method, uri, username, password) {
  const realm  = extractDigestParam(wwwAuth, 'realm');
  const nonce  = extractDigestParam(wwwAuth, 'nonce');
  const qop    = extractDigestParam(wwwAuth, 'qop');

  const ha1 = crypto.createHash('md5').update(`${username}:${realm}:${password}`).digest('hex');
  const ha2 = crypto.createHash('md5').update(`${method}:${uri}`).digest('hex');

  if (qop === 'auth') {
    const nc = '00000001';
    const cnonce = crypto.randomBytes(8).toString('hex');
    const resp = crypto.createHash('md5').update(`${ha1}:${nonce}:${nc}:${cnonce}:auth:${ha2}`).digest('hex');
    return `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", qop=auth, nc=${nc}, cnonce="${cnonce}", response="${resp}"`;
  } else {
    const resp = crypto.createHash('md5').update(`${ha1}:${nonce}:${ha2}`).digest('hex');
    return `Digest username="${username}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${resp}"`;
  }
}

/** Один HTTP запрос к Hikvision (без авторизации) */
function rawHikvisionRequest(device, method, urlPath, body, contentType, authorization) {
  return new Promise((resolve, reject) => {
    const bodyBuf = typeof body === 'string' ? Buffer.from(body) : body;
    const options = {
      hostname: device.ip,
      port: device.port,
      path: urlPath,
      method,
      headers: {
        'Content-Type': contentType,
        'Content-Length': bodyBuf.length,
        ...(authorization ? { Authorization: authorization } : {}),
      },
      timeout: hikvisionTimeoutMs,
    };

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', c => (data += c));
      res.on('end', () => resolve({
        status: res.statusCode,
        headers: res.headers,
        body: data,
      }));
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error(`Timeout ${device.ip}:${device.port}`)); });
    req.write(bodyBuf);
    req.end();
  });
}

/** Запрос с Digest авторизацией (2 шага) */
async function hikvisionRequest(device, door, method, urlPath, body, contentType) {
  const first = await rawHikvisionRequest(device, method, urlPath, body, contentType, null);

  if (first.status !== 401) {
    if (first.status >= 400) throw new Error(`HTTP ${first.status}: ${first.body}`);
    return first.body;
  }

  const authHeader = first.headers['www-authenticate'] || '';
  const digestAuth = buildDigestAuth(authHeader, method, urlPath, door.login, door.password);

  const second = await rawHikvisionRequest(device, method, urlPath, body, contentType, digestAuth);
  if (second.status >= 400) throw new Error(`HTTP ${second.status}: ${second.body}`);
  return second.body;
}

// ─────────────────────────────────────────────────────────────
//  Hikvision операции
// ─────────────────────────────────────────────────────────────

async function hikvisionAddUser(device, door, employee) {
  const employeeNo = String(employee.id);
  const fullName = `${employee.lastName} ${employee.firstName}`.substring(0, 32);

  const body = JSON.stringify({
    UserInfo: {
      employeeNo,
      name: fullName,
      userType: 'normal',
      Valid: {
        enable: true,
        beginTime: '2020-01-01T00:00:00',
        endTime: '2037-12-31T23:59:59',
      },
      doorRight: '1',
      RightPlan: [{ doorNo: 1, planTemplateNo: '1' }],
    },
  });

  await hikvisionRequest(device, door, 'POST',
    '/ISAPI/AccessControl/UserInfo/Record?format=json', body, 'application/json');
}

async function hikvisionDeleteUser(device, door, employee) {
  const body = JSON.stringify({
    UserInfoDelCond: {
      EmployeeNoList: [{ employeeNo: String(employee.id) }],
    },
  });

  await hikvisionRequest(device, door, 'PUT',
    '/ISAPI/AccessControl/UserInfo/Delete?format=json', body, 'application/json');
}

async function hikvisionUploadFace(device, door, employee, photoBuffer) {
  if (!photoBuffer) {
    warn(`  No photo for employee ${employee.id} — face not uploaded`);
    return;
  }

  const employeeNo = String(employee.id);
  const boundary = `----FormBoundary${crypto.randomBytes(8).toString('hex')}`;
  const jsonPart = JSON.stringify({ faceLibType: 'blackFD', FDID: '1', FPID: employeeNo });

  const bodyBuf = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="FaceDataRecord"\r\n` +
      `Content-Type: application/json\r\n\r\n${jsonPart}\r\n` +
      `--${boundary}\r\nContent-Disposition: form-data; name="img"; filename="face.jpg"\r\n` +
      `Content-Type: image/jpeg\r\n\r\n`
    ),
    photoBuffer,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);

  await hikvisionRequest(device, door, 'POST',
    '/ISAPI/Intelligent/FDLib/FaceDataRecord?format=json',
    bodyBuf, `multipart/form-data; boundary=${boundary}`);
}

// ─────────────────────────────────────────────────────────────
//  Мониторинг устройств
// ─────────────────────────────────────────────────────────────

// Состояние каждого устройства: Map<"ip:port", { online: bool, doorName: string, label: string, failedSince: Date|null }>
const deviceStates = new Map();

/** TCP-проверка достижимости — возвращает true/false */
function checkTcpReachable(ip, port, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const net = require('net');
    const socket = new net.Socket();
    let settled = false;

    const done = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    socket.setTimeout(timeoutMs);
    socket.on('connect', () => done(true));
    socket.on('error',   () => done(false));
    socket.on('timeout', () => done(false));
    socket.connect(port, ip);
  });
}

/** Получить список всех дверей компании для мониторинга */
async function fetchDoorList() {
  try {
    return await serverRequest('GET', `/api/agent/doors?companyId=${companyId}`);
  } catch {
    return null;
  }
}

/** Отправить алерт о состоянии устройства на сервер */
async function sendDeviceAlert(ip, port, doorName, label, online) {
  try {
    await serverRequest('POST', '/api/agent/device-alert', {
      companyId, ip, port, doorName, label, online,
    });
  } catch (e) {
    warn(`Failed to send device alert: ${e.message}`);
  }
}

/** Проверить все устройства и отправить алерты при изменении состояния */
async function checkDevices() {
  const doors = await fetchDoorList();
  if (!doors || !Array.isArray(doors)) return;

  for (const door of doors) {
    if (!door.isActive) continue;

    const devices = [
      { ip: door.inDeviceIp,  port: door.inDevicePort,  label: 'IN'  },
      { ip: door.outDeviceIp, port: door.outDevicePort, label: 'OUT' },
    ];

    for (const dev of devices) {
      const key = `${dev.ip}:${dev.port}`;
      const prev = deviceStates.get(key);
      const isOnline = await checkTcpReachable(dev.ip, dev.port, 4000);

      if (!prev) {
        // Первая проверка — просто запоминаем, не шлём алерт
        deviceStates.set(key, { online: isOnline, doorName: door.name, label: dev.label, failedSince: isOnline ? null : new Date() });
        info(`[monitor] ${door.name} [${dev.label}] ${dev.ip}:${dev.port} -> ${isOnline ? 'ONLINE' : 'OFFLINE'}`);
        continue;
      }

      if (prev.online !== isOnline) {
        deviceStates.set(key, { ...prev, online: isOnline, failedSince: isOnline ? null : new Date() });

        if (isOnline) {
          ok(`[monitor] RESTORED: ${door.name} [${dev.label}] ${dev.ip}:${dev.port}`);
        } else {
          error(`[monitor] UNREACHABLE: ${door.name} [${dev.label}] ${dev.ip}:${dev.port}`);
        }

        await sendDeviceAlert(dev.ip, dev.port, door.name, dev.label, isOnline);
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────
//  Выполнение Door-команды (relay-агент, два устройства на дверь)
// ─────────────────────────────────────────────────────────────

async function executeCommand(cmd) {
  const { id, action, door, employee } = cmd;
  const devices = [
    { ip: door.inDeviceIp,  port: door.inDevicePort,  label: 'IN' },
    { ip: door.outDeviceIp, port: door.outDevicePort, label: 'OUT' },
  ];

  info(`[door] cmd #${id} [${action.toUpperCase()}] ${employee.lastName} ${employee.firstName} -> "${door.name}"`);

  if (action === 'grant') {
    let photoBuffer = null;
    if (employee.hasPhoto) {
      try {
        photoBuffer = await downloadPhoto(employee.id);
        info(`  photo downloaded (${photoBuffer ? Math.round(photoBuffer.length/1024) + ' KB' : 'none'})`);
      } catch (e) {
        warn(`  photo download failed: ${e.message}`);
      }
    }
    for (const device of devices) {
      info(`  -> device ${device.label} (${device.ip}:${device.port})`);
      await hikvisionAddUser(device, door, employee);
      await hikvisionUploadFace(device, door, employee, photoBuffer);
      ok(`  [${device.label}] user added`);
    }
  } else if (action === 'revoke') {
    for (const device of devices) {
      info(`  -> device ${device.label} (${device.ip}:${device.port})`);
      try {
        await hikvisionDeleteUser(device, door, employee);
        ok(`  [${device.label}] user removed`);
      } catch (e) {
        warn(`  [${device.label}] ${e.message} (skipping)`);
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────
//  Выполнение HikvisionCommand (одно устройство Face ID)
// ─────────────────────────────────────────────────────────────

async function executeHikCommand(cmd) {
  const { id, action, device: dev, employee } = cmd;
  const device = { ip: dev.lastSeenIp, port: dev.directPort || 80 };
  const creds  = { login: dev.login || 'admin', password: dev.password || '' };

  const label = `${dev.officeName} (${dev.direction === 'IN' ? 'IN' : 'OUT'})`;
  info(`[hik] cmd #${id} [${action.toUpperCase()}] ${employee.lastName} ${employee.firstName} -> "${label}" (${device.ip}:${device.port})`);

  if (action === 'grant') {
    try {
      await hikvisionDeleteUser(device, creds, employee);
    } catch (_) { /* not present — ok */ }

    await hikvisionAddUser(device, creds, employee);
    ok(`  user added on ${device.ip}`);

    if (employee.hasPhoto) {
      try {
        const photoBuffer = await downloadPhoto(employee.id);
        if (photoBuffer) {
          await hikvisionUploadFace(device, creds, employee, photoBuffer);
          ok(`  face uploaded (${Math.round(photoBuffer.length / 1024)} KB)`);
        }
      } catch (e) {
        warn(`  face upload failed: ${e.message} (access granted without face)`);
      }
    }

  } else if (action === 'revoke') {
    try {
      await hikvisionDeleteUser(device, creds, employee);
      ok(`  user removed from ${device.ip}`);
    } catch (e) {
      warn(`  remove failed: ${e.message} (skipping)`);
    }
  }
}

// ─────────────────────────────────────────────────────────────
//  Основной цикл
// ─────────────────────────────────────────────────────────────

let consecutiveErrors = 0;
let running = true;

async function pollOnce() {
  // Heartbeat — сервер видит что агент живой
  serverRequest('POST', '/api/agent/ping', { companyId }).catch(() => {});

  // ── Door команды ──
  let commands;
  try {
    commands = await serverRequest('GET', `/api/agent/commands?companyId=${companyId}`);
    consecutiveErrors = 0;
  } catch (e) {
    consecutiveErrors++;
    if (consecutiveErrors === 1 || consecutiveErrors % 12 === 0) {
      error(`Cannot reach server: ${e.message}`);
    }
    return;
  }

  if (Array.isArray(commands) && commands.length > 0) {
    info(`[door] ${commands.length} command(s) received`);
    for (const cmd of commands) {
      try {
        await executeCommand(cmd);
        await serverRequest('PATCH', `/api/agent/commands/${cmd.id}`, { status: 'done' });
        ok(`[door] cmd #${cmd.id} done`);
      } catch (e) {
        error(`[door] cmd #${cmd.id} failed: ${e.message}`);
        await serverRequest('PATCH', `/api/agent/commands/${cmd.id}`, {
          status: 'failed', error: e.message,
        }).catch(() => {});
      }
    }
  }

  // Face ID commands
  let hikCmds;
  try {
    hikCmds = await serverRequest('GET', `/api/agent/hik-commands?companyId=${companyId}`);
  } catch (e) {
    warn(`hik-commands fetch failed: ${e.message}`);
    return;
  }

  if (Array.isArray(hikCmds) && hikCmds.length > 0) {
    info(`[hik] ${hikCmds.length} command(s) received`);
    for (const cmd of hikCmds) {
      try {
        await executeHikCommand(cmd);
        await serverRequest('PATCH', `/api/agent/hik-commands/${cmd.id}`, { status: 'done' });
        ok(`[hik] cmd #${cmd.id} done`);
      } catch (e) {
        error(`[hik] cmd #${cmd.id} failed: ${e.message}`);
        await serverRequest('PATCH', `/api/agent/hik-commands/${cmd.id}`, {
          status: 'failed', error: e.message,
        }).catch(() => {});
      }
    }
  }
}

async function main() {
  info('==================================================');
  info('  HRMS Relay Agent v1.0');
  info(`  Server    : ${serverUrl}`);
  info(`  Company ID: ${companyId}`);
  info(`  Poll interval  : ${pollIntervalMs / 1000}s`);
  info(`  Device monitor : ${deviceCheckIntervalMs / 1000}s`);
  info('==================================================');

  try {
    const status = await serverRequest('GET', `/api/agent/status?companyId=${companyId}`);
    ok(`Server OK. pending=${status.pending} done=${status.done} failed=${status.failed}`);
  } catch (e) {
    warn(`Server unreachable at startup: ${e.message}. Will keep retrying...`);
  }

  info('Initial device scan...');
  await checkDevices().catch(e => warn(`Device scan error: ${e.message}`));

  const commandLoop = async () => {
    while (running) {
      await pollOnce().catch(e => error(`Poll loop error: ${e.message}`));
      await new Promise(r => setTimeout(r, pollIntervalMs));
    }
  };

  const monitorLoop = async () => {
    await new Promise(r => setTimeout(r, deviceCheckIntervalMs));
    while (running) {
      await checkDevices().catch(e => warn(`Monitor error: ${e.message}`));
      await new Promise(r => setTimeout(r, deviceCheckIntervalMs));
    }
  };

  await Promise.all([commandLoop(), monitorLoop()]);
}

process.on('SIGINT',  () => { info('Stopping (SIGINT)...');  running = false; setTimeout(() => process.exit(0), 1000); });
process.on('SIGTERM', () => { info('Stopping (SIGTERM)...'); running = false; setTimeout(() => process.exit(0), 1000); });

main().catch(e => {
  error(`Fatal error: ${e.message}`);
  process.exit(1);
});
