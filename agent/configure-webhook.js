/**
 * configure-webhook.js
 * ======================
 * Настраивает Hikvision устройство (DS-K1T342MFX и аналоги) на отправку
 * событий Face ID (AccessControllerEvent) на сервер HRMS.
 *
 * Запускать с ПК в локальной сети (где есть доступ к 192.168.0.x).
 *
 * Использование:
 *   node configure-webhook.js <device_ip> <login> <password> [server_ip] [server_port] [token]
 *
 * Пример (только посмотреть текущий конфиг):
 *   node configure-webhook.js 192.168.0.160 admin qwerty321.
 *
 * Пример (настроить сервер):
 *   node configure-webhook.js 192.168.0.160 admin qwerty321. 185.125.200.112 7272 152ac96436...
 */

'use strict';

const http   = require('http');
const crypto = require('crypto');

const [,, DEVICE_IP, LOGIN, PASSWORD, SERVER_IP, SERVER_PORT, TOKEN] = process.argv;

if (!DEVICE_IP || !LOGIN || !PASSWORD) {
  console.error('Использование: node configure-webhook.js <device_ip> <login> <password> [server_ip] [server_port] [token]');
  process.exit(1);
}

// ─── Digest Auth ──────────────────────────────────────────────────────────────

function digestAuth(wwwAuth, method, urlPath) {
  const realm  = (wwwAuth.match(/realm="([^"]+)"/) || [])[1] || '';
  const nonce  = (wwwAuth.match(/nonce="([^"]+)"/) || [])[1] || '';
  const qop    = (wwwAuth.match(/qop="?([^",]+)"?/) || [])[1] || '';
  const nc     = '00000001';
  const cnonce = crypto.randomBytes(8).toString('hex');

  const ha1 = crypto.createHash('md5').update(`${LOGIN}:${realm}:${PASSWORD}`).digest('hex');
  const ha2 = crypto.createHash('md5').update(`${method}:${urlPath}`).digest('hex');
  const resp = qop
    ? crypto.createHash('md5').update(`${ha1}:${nonce}:${nc}:${cnonce}:${qop}:${ha2}`).digest('hex')
    : crypto.createHash('md5').update(`${ha1}:${nonce}:${ha2}`).digest('hex');

  let auth = `Digest username="${LOGIN}", realm="${realm}", nonce="${nonce}", uri="${urlPath}", response="${resp}"`;
  if (qop) auth += `, qop=${qop}, nc=${nc}, cnonce="${cnonce}"`;
  return auth;
}

function request(method, urlPath, body, authHeader) {
  return new Promise((resolve, reject) => {
    const headers = {
      'Content-Type': 'application/xml',
      Accept: 'application/xml, */*',
      ...(authHeader ? { Authorization: authHeader } : {}),
      ...(body ? { 'Content-Length': Buffer.byteLength(body) } : {}),
    };

    const req = http.request({ hostname: DEVICE_IP, port: 80, path: urlPath, method, headers }, res => {
      let data = '';
      res.on('data', d => (data += d));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function apiCall(method, urlPath, body) {
  // First request — get 401 with WWW-Authenticate
  const r1 = await request(method, urlPath, null);
  if (r1.status === 200 && !body) return r1;

  const wwwAuth = r1.headers['www-authenticate'] || '';
  if (!wwwAuth) {
    if (r1.status < 300) return r1;
    throw new Error(`HTTP ${r1.status}: ${r1.body.slice(0, 200)}`);
  }

  const auth = digestAuth(wwwAuth, method, urlPath);
  const r2 = await request(method, urlPath, body || null, auth);

  if (r2.status === 401) {
    throw new Error('Неверный логин или пароль устройства');
  }
  if (r2.status >= 400) {
    throw new Error(`HTTP ${r2.status}: ${r2.body.slice(0, 300)}`);
  }
  return r2;
}

// ─── Читаем текущий конфиг HTTP-хостов ────────────────────────────────────────

async function readHttpHosts() {
  console.log('\n📡 Читаю текущую конфигурацию HTTP-уведомлений...');
  try {
    const r = await apiCall('GET', '/ISAPI/Event/notification/httpHosts');
    console.log('\nТекущий XML-ответ от устройства:');
    console.log('─'.repeat(60));
    console.log(r.body);
    console.log('─'.repeat(60));
    return r.body;
  } catch (e) {
    console.warn(`⚠️  Не удалось прочитать /ISAPI/Event/notification/httpHosts: ${e.message}`);
    return null;
  }
}

// ─── Записываем конфиг HTTP-хостов ────────────────────────────────────────────

async function writeHttpHosts(ip, port, token) {
  const urlPath = `/api/hikvision/event?token=${token}`;

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<HttpHostNotificationList>
  <HttpHostNotification>
    <id>1</id>
    <url><![CDATA[${urlPath}]]></url>
    <protocolType>HTTP</protocolType>
    <parameterFormatType>JSON</parameterFormatType>
    <addressingFormatType>ipaddress</addressingFormatType>
    <ipAddress>${ip}</ipAddress>
    <portNo>${port}</portNo>
    <httpAuthenticationMethod>none</httpAuthenticationMethod>
  </HttpHostNotification>
</HttpHostNotificationList>`;

  console.log('\n✏️  Записываю конфигурацию HTTP-хоста...');
  console.log(`   Сервер: http://${ip}:${port}${urlPath}`);

  const r = await apiCall('PUT', '/ISAPI/Event/notification/httpHosts', xml);
  if (r.status < 300) {
    console.log('✅ HTTP-хост успешно настроен');
  } else {
    console.warn(`⚠️  Ответ: ${r.status} — ${r.body.slice(0, 200)}`);
  }
}

// ─── Проверяем/настраиваем подписку на события ────────────────────────────────

async function checkEventSubscription() {
  console.log('\n🔔 Проверяю подписку на события...');

  const paths = [
    '/ISAPI/Event/notification/subscribeEvent',
    '/ISAPI/Event/triggers',
    '/ISAPI/AccessControl/ACSEventTrigger',
  ];

  for (const p of paths) {
    try {
      const r = await apiCall('GET', p);
      console.log(`\n[${p}] HTTP ${r.status}:`);
      if (r.body) console.log(r.body.slice(0, 500));
    } catch (e) {
      console.log(`   ${p} — недоступен (${e.message.split('\n')[0]})`);
    }
  }
}

// ─── Тест: пробуем получить последние события ────────────────────────────────

async function checkRecentEvents() {
  console.log('\n🔍 Запрашиваю последние события доступа с устройства...');
  const paths = [
    '/ISAPI/AccessControl/ACSEvent?format=json&maxResults=5',
    '/ISAPI/AccessControl/ACSEvent?maxResults=5',
  ];

  for (const p of paths) {
    try {
      const r = await apiCall('GET', p);
      if (r.status < 300) {
        console.log(`\n[${p}] Последние события:`);
        console.log(r.body.slice(0, 600));
        return;
      }
    } catch (e) {
      // try next path
    }
  }
  console.log('   Не удалось получить историю событий с устройства');
}

// ─── Главная функция ──────────────────────────────────────────────────────────

async function main() {
  console.log('='.repeat(60));
  console.log(' Настройка Webhook для Hikvision Face ID устройства');
  console.log('='.repeat(60));
  console.log(`📟 Устройство: ${DEVICE_IP}`);

  // Всегда читаем текущий конфиг
  await readHttpHosts();

  // Если переданы параметры сервера — обновляем конфиг
  if (SERVER_IP && SERVER_PORT && TOKEN) {
    await writeHttpHosts(SERVER_IP, SERVER_PORT, TOKEN);

    // Читаем заново чтобы убедиться что записалось
    console.log('\n🔄 Перечитываю конфиг после обновления...');
    await readHttpHosts();
  } else {
    console.log('\n💡 Чтобы настроить сервер, передай параметры:');
    console.log('   node configure-webhook.js 192.168.0.160 admin PASS SERVER_IP PORT TOKEN');
    console.log('\n   Пример:');
    console.log('   node configure-webhook.js 192.168.0.160 admin qwerty321. 185.125.200.112 7272 152ac96436...');
  }

  // Проверяем подписку на события
  await checkEventSubscription();

  // Запрашиваем последние события
  await checkRecentEvents();

  console.log('\n='.repeat(60));
  console.log(' Готово. Важные заметки:');
  console.log('='.repeat(60));
  console.log('');
  console.log('⚡ Если heartBeat приходит, но события прохода не приходят:');
  console.log('   1. Зайдите в веб-интерфейс устройства: http://' + DEVICE_IP);
  console.log('   2. Configuration → Event → Basic Event');
  console.log('   3. Или: Configuration → Access Control → Access Control Event');
  console.log('   4. Включите HTTP-уведомление для событий прохода');
  console.log('   5. Убедитесь что в "Linkage Method" выбран HTTP Notification');
  console.log('');
  console.log('📌 URL сервера для ввода в устройстве:');
  if (SERVER_IP && SERVER_PORT && TOKEN) {
    console.log(`   http://${SERVER_IP}:${SERVER_PORT}/api/hikvision/event?token=${TOKEN}`);
  }
}

main().catch(e => {
  console.error('\n❌ Ошибка:', e.message);
  process.exit(1);
});
