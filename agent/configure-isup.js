/**
 * Скрипт настройки ISUP (EHome) на Hikvision DS-K устройствах.
 * Запускать с локального ПК где работает relay-агент (доступ к 192.168.0.x).
 *
 * Использование:
 *   node configure-isup.js <ip> <login> <password> [server_ip] [server_port]
 *
 * Пример:
 *   node configure-isup.js 192.168.0.160 admin Admin@123 185.177.0.140 7660
 */

const http = require('http');
const crypto = require('crypto');

const [,, DEVICE_IP, DEVICE_LOGIN, DEVICE_PASSWORD, SERVER_IP, SERVER_PORT] = process.argv;

if (!DEVICE_IP || !DEVICE_LOGIN || !DEVICE_PASSWORD) {
  console.error('Использование: node configure-isup.js <ip> <login> <password> [server_ip] [server_port]');
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
    };
    const req = http.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

async function apiCall(method, path, body) {
  // Первый запрос — получаем WWW-Authenticate
  const first = await request(method, path, body, null);
  if (first.status !== 401) {
    return first;
  }
  const wwwAuth = first.headers['www-authenticate'] || '';
  if (!wwwAuth) return first;

  const authHeader = digestAuth(wwwAuth, method, path, DEVICE_LOGIN, DEVICE_PASSWORD);
  return request(method, path, body, authHeader);
}

// ─── Основная логика ──────────────────────────────────────────────────────────

async function main() {
  const endpoints = [
    '/ISAPI/System/Network/EHome',
    '/ISAPI/System/Network/Mobilelink',
    '/ISAPI/AccessControl/RemoteControl/configuration',
  ];

  console.log(`\n═══ Hikvision ISUP/EHome конфигуратор ═══`);
  console.log(`Устройство: ${DEVICE_IP} (логин: ${DEVICE_LOGIN})\n`);

  let found = null;
  for (const ep of endpoints) {
    console.log(`→ Пробуем GET ${ep} ...`);
    const res = await apiCall('GET', ep, null);
    console.log(`  Ответ: HTTP ${res.status}`);
    if (res.status === 200) {
      console.log(`  ✅ Найден! Текущая конфигурация:\n`);
      console.log(res.body);
      found = ep;
      break;
    } else if (res.status !== 404) {
      console.log(`  Тело: ${res.body.slice(0, 200)}`);
    }
  }

  if (!found) {
    console.log('\n❌ Не удалось найти ISUP/EHome конфигурацию.');
    console.log('Попробуйте через веб-интерфейс устройства или SADP.');
    return;
  }

  if (!SERVER_IP) {
    console.log('\nЧтобы обновить настройки, запустите с параметрами server_ip и server_port:');
    console.log(`  node configure-isup.js ${DEVICE_IP} ${DEVICE_LOGIN} ${DEVICE_PASSWORD} 185.177.0.140 7660`);
    return;
  }

  // Определяем правильный XML для отключения шифрования
  let newXml;
  const cur = (await apiCall('GET', found, null)).body;

  if (found === '/ISAPI/System/Network/EHome') {
    // Пробуем разные варианты XML для DS-K серии
    newXml = cur
      .replace(/<serverAddr>[^<]*<\/serverAddr>/, `<serverAddr>${SERVER_IP}</serverAddr>`)
      .replace(/<portNo>[^<]*<\/portNo>/, `<portNo>${SERVER_PORT || 7660}</portNo>`)
      .replace(/<encryptType>[^<]*<\/encryptType>/, '<encryptType>none</encryptType>')
      .replace(/<enable_encrypt>[^<]*<\/enable_encrypt>/, '<enable_encrypt>false</enable_encrypt>')
      .replace(/<secretKey>[^<]*<\/secretKey>/, '<secretKey/>')
      .replace(/<EncryptKey>[^<]*<\/EncryptKey>/, '<EncryptKey/>')
      .replace(/<key>[^<]*<\/key>/, '<key/>');
  } else {
    newXml = cur;
  }

  console.log(`\n→ Отправляем обновлённую конфигурацию на PUT ${found} ...`);
  console.log('Новый XML:\n', newXml);

  const putRes = await apiCall('PUT', found, newXml);
  console.log(`\nОтвет: HTTP ${putRes.status}`);
  console.log(putRes.body.slice(0, 500));

  if (putRes.status === 200 || putRes.status === 201) {
    console.log('\n✅ Конфигурация обновлена! Устройство должно переподключиться к серверу без шифрования.');
    console.log('Следите за логами: docker logs hrms_backend -f | grep ISUP');
  } else {
    console.log('\n⚠️  Не удалось обновить. Попробуйте вручную через веб-интерфейс устройства.');
  }
}

main().catch(console.error);
