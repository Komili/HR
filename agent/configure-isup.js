/**
 * Скрипт настройки ISUP (EHome) на Hikvision DS-K устройствах.
 * Запускать с локального ПК где работает relay-агент (доступ к 192.168.0.x).
 *
 * Использование:
 *   node configure-isup.js <ip> <login> <password> [server_ip] [server_port] [enc_key]
 *
 * Пример (только посмотреть конфиг):
 *   node configure-isup.js 192.168.0.160 admin qwerty321.
 *
 * Пример (обновить IP + отключить шифрование):
 *   node configure-isup.js 192.168.0.160 admin qwerty321. 185.125.200.112 7660 ""
 *
 * Пример (обновить IP, сохранить ключ):
 *   node configure-isup.js 192.168.0.160 admin qwerty321. 185.125.200.112 7660 qwerty321.
 */

const http = require('http');
const crypto = require('crypto');

const [,, DEVICE_IP, DEVICE_LOGIN, DEVICE_PASSWORD, SERVER_IP, SERVER_PORT, NEW_ENC_KEY] = process.argv;

if (!DEVICE_IP || !DEVICE_LOGIN || !DEVICE_PASSWORD) {
  console.error('Использование: node configure-isup.js <ip> <login> <password> [server_ip] [server_port] [enc_key]');
  process.exit(1);
}

// ─── Digest Auth ──────────────────────────────────────────────────────────────

function digestAuth(wwwAuth, method, path, login, password) {
  const realm = (wwwAuth.match(/realm="([^"]+)"/) || [])[1];
  const nonce = (wwwAuth.match(/nonce="([^"]+)"/) || [])[1];
  const qop   = (wwwAuth.match(/qop="?([^",]+)"?/) || [])[1];
  const nc    = '00000001';
  const cnonce = crypto.randomBytes(8).toString('hex');

  const ha1 = crypto.createHash('md5').update(`${login}:${realm}:${password}`).digest('hex');
  const ha2 = crypto.createHash('md5').update(`${method}:${path}`).digest('hex');
  let response;
  if (qop) {
    response = crypto.createHash('md5')
      .update(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
      .digest('hex');
  } else {
    response = crypto.createHash('md5').update(`${ha1}:${nonce}:${ha2}`).digest('hex');
  }

  let auth = `Digest username="${login}", realm="${realm}", nonce="${nonce}", uri="${path}", response="${response}"`;
  if (qop) auth += `, qop=${qop}, nc=${nc}, cnonce="${cnonce}"`;
  return auth;
}

function request(method, path, body, authHeader) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: DEVICE_IP, port: 80, path, method,
      headers: {
        'Content-Type': 'application/xml',
        'Accept': 'application/xml, */*',
        ...(authHeader ? { Authorization: authHeader } : {}),
        ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
      },
      timeout: 8000,
    };
    const req = http.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
    if (body) req.write(body);
    req.end();
  });
}

async function apiCall(method, path, body) {
  const first = await request(method, path, body, null);
  if (first.status !== 401) return first;
  const wwwAuth = first.headers['www-authenticate'] || '';
  if (!wwwAuth) return first;
  const authHeader = digestAuth(wwwAuth, method, path, DEVICE_LOGIN, DEVICE_PASSWORD);
  return request(method, path, body, authHeader);
}

// ─── Основная логика ──────────────────────────────────────────────────────────

async function main() {
  console.log(`\n═══ Hikvision ISUP/EHome конфигуратор ═══`);
  console.log(`Устройство: ${DEVICE_IP} (логин: ${DEVICE_LOGIN})\n`);

  // Все известные эндпоинты ISUP/EHome на DS-K устройствах
  const endpoints = [
    '/ISAPI/System/Network/EHome',
    '/ISAPI/System/Network/EHome/1',
    '/ISAPI/System/Network/EHomeList',
    '/ISAPI/System/Network/Mobilelink',
    '/ISAPI/System/Network/remoteAccessConf',
  ];

  const found = [];
  for (const ep of endpoints) {
    try {
      const res = await apiCall('GET', ep, null);
      if (res.status === 200) {
        console.log(`✅ GET ${ep} → HTTP 200`);
        console.log(res.body);
        console.log('─'.repeat(60));
        found.push({ ep, xml: res.body });
      } else if (res.status !== 404) {
        console.log(`⚠️  GET ${ep} → HTTP ${res.status}: ${res.body.slice(0, 120)}`);
      }
    } catch (e) {
      // Тихо пропускаем недоступные эндпоинты
    }
  }

  if (found.length === 0) {
    console.log('❌ Ни один ISUP эндпоинт не найден.');
    return;
  }

  if (!SERVER_IP) {
    console.log('\nЧтобы обновить настройки, запустите:');
    console.log(`  node configure-isup.js ${DEVICE_IP} ${DEVICE_LOGIN} ${DEVICE_PASSWORD} 185.125.200.112 7660 qwerty321.`);
    console.log('\n  ВАЖНО: Hikvision DS-K не принимает пустой ключ — всегда указывай ключ шифрования!');
    console.log('  Ключ должен совпадать с ISUP_ENC_KEY в .env на сервере.');
    return;
  }

  const encKey = NEW_ENC_KEY !== undefined ? NEW_ENC_KEY : DEVICE_PASSWORD;

  if (!encKey) {
    console.log('\n⚠️  ВНИМАНИЕ: Пустой ключ шифрования!');
    console.log('  Hikvision DS-K серия требует непустой ключ — PUT скорее всего завершится ошибкой.');
    console.log('  Используй текущий ключ устройства, например:');
    console.log(`  node configure-isup.js ${DEVICE_IP} ${DEVICE_LOGIN} ${DEVICE_PASSWORD} ${SERVER_IP} ${SERVER_PORT || '7660'} qwerty321.`);
    console.log('  Продолжаем попытку...\n');
  }
  const targetPort = SERVER_PORT || '7660';

  // Обновляем каждый найденный эндпоинт
  for (const { ep, xml } of found) {
    console.log(`\n→ Обновляем ${ep} ...`);
    console.log(`  IP: ${SERVER_IP}:${targetPort}, key: "${encKey}"`);

    // Собираем новый XML — сохраняем deviceID из текущего ответа
    const deviceIDMatch = xml.match(/<deviceID>([^<]*)<\/deviceID>/);
    const deviceID = deviceIDMatch ? deviceIDMatch[1] : 'FAVZInside';

    const newXml = `<?xml version="1.0" encoding="UTF-8"?>
<Ehome version="2.0" xmlns="http://www.isapi.org/ver20/XMLSchema">
<enabled>true</enabled>
<addressingFormatType>ipaddress</addressingFormatType>
<ipAddress>${SERVER_IP}</ipAddress>
<portNo>${targetPort}</portNo>
<deviceID>${deviceID}</deviceID>
<key>${encKey}</key>
</Ehome>`;

    console.log('\nОтправляем XML:');
    console.log(newXml);

    const putRes = await apiCall('PUT', ep, newXml);
    console.log(`\nОтвет: HTTP ${putRes.status}`);
    console.log(putRes.body.slice(0, 500));

    if (putRes.status === 200 || putRes.status === 201) {
      console.log(`\n✅ ${ep} обновлён успешно!`);
      console.log('Устройство должно переподключиться через несколько секунд.');
      console.log(`Следите: docker logs hrms_backend -f | findstr ISUP`);
    } else {
      console.log(`\n⚠️  Ошибка обновления ${ep}.`);
    }
  }
}

main().catch(console.error);
