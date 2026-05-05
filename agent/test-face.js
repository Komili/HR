'use strict';
/**
 * Диагностика Face ID загрузки на Hikvision устройство.
 * Запуск: node test-face.js <ip> <password> <employeeId>
 * Пример: node test-face.js 192.168.1.190 qwerty321. 40
 */
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const [,, ip, password, employeeId] = process.argv;
if (!ip || !password || !employeeId) {
  console.log('Usage: node test-face.js <ip> <password> <employeeId>');
  console.log('Example: node test-face.js 192.168.1.190 qwerty321. 40');
  process.exit(1);
}

const PORT = 80;
const LOGIN = 'admin';

function extractDigestParam(header, param) {
  const m = header.match(new RegExp(`${param}="([^"]+)"`));
  return m ? m[1] : '';
}

function buildDigestAuth(wwwAuth, method, uri) {
  const realm  = extractDigestParam(wwwAuth, 'realm');
  const nonce  = extractDigestParam(wwwAuth, 'nonce');
  const qop    = extractDigestParam(wwwAuth, 'qop');
  const ha1 = crypto.createHash('md5').update(`${LOGIN}:${realm}:${password}`).digest('hex');
  const ha2 = crypto.createHash('md5').update(`${method}:${uri}`).digest('hex');
  if (qop === 'auth') {
    const nc = '00000001';
    const cnonce = crypto.randomBytes(8).toString('hex');
    const resp = crypto.createHash('md5').update(`${ha1}:${nonce}:${nc}:${cnonce}:auth:${ha2}`).digest('hex');
    return `Digest username="${LOGIN}", realm="${realm}", nonce="${nonce}", uri="${uri}", qop=auth, nc=${nc}, cnonce="${cnonce}", response="${resp}"`;
  }
  const resp = crypto.createHash('md5').update(`${ha1}:${nonce}:${ha2}`).digest('hex');
  return `Digest username="${LOGIN}", realm="${realm}", nonce="${nonce}", uri="${uri}", response="${resp}"`;
}

function rawRequest(method, urlPath, body, contentType, auth) {
  return new Promise((resolve, reject) => {
    const bodyBuf = typeof body === 'string' ? Buffer.from(body) : (body || Buffer.alloc(0));
    const opts = {
      hostname: ip, port: PORT, path: urlPath, method,
      headers: {
        'Content-Type': contentType || 'application/json',
        'Content-Length': bodyBuf.length,
        ...(auth ? { Authorization: auth } : {}),
      },
      timeout: 15000,
    };
    const req = http.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: data }));
    });
    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
    req.write(bodyBuf);
    req.end();
  });
}

async function request(method, urlPath, body, contentType) {
  const first = await rawRequest(method, urlPath, body, contentType, null);
  if (first.status !== 401) return first;
  const auth = buildDigestAuth(first.headers['www-authenticate'] || '', method, urlPath);
  return rawRequest(method, urlPath, body, contentType, auth);
}

async function main() {
  console.log(`\n=== Hikvision Face Diagnostics ===`);
  console.log(`Device : ${ip}:${PORT}`);
  console.log(`Login  : ${LOGIN} / ${password}`);
  console.log(`EmpID  : ${employeeId}\n`);

  // 0. Проверка доступных библиотек лиц
  console.log('--- Step 0: Face libraries on device ---');
  try {
    const r = await request('GET', '/ISAPI/Intelligent/FDLib?format=json', '', 'application/json');
    console.log(`Status: ${r.status}`);
    console.log('Response:', r.body.substring(0, 600));
  } catch(e) { console.log('FAILED:', e.message); }

  // 0b. Сколько лиц уже загружено
  console.log('\n--- Step 0b: Faces stored (FDID=1, blackFD) ---');
  try {
    const body = JSON.stringify({ searchResultPosition: 0, maxResults: 3, faceLibType: 'blackFD', FDID: '1' });
    const r = await request('POST', '/ISAPI/Intelligent/FDLib/FaceDataRecord/Search?format=json', body, 'application/json');
    console.log(`Status: ${r.status}`);
    console.log('Response:', r.body.substring(0, 400));
  } catch(e) { console.log('FAILED:', e.message); }

  // 0c. Проверка whitelist
  console.log('\n--- Step 0c: Faces stored (FDID=1, whiteList) ---');
  try {
    const body = JSON.stringify({ searchResultPosition: 0, maxResults: 3, faceLibType: 'whiteList', FDID: '1' });
    const r = await request('POST', '/ISAPI/Intelligent/FDLib/FaceDataRecord/Search?format=json', body, 'application/json');
    console.log(`Status: ${r.status}`);
    console.log('Response:', r.body.substring(0, 400));
  } catch(e) { console.log('FAILED:', e.message); }

  // 1. Проверка связи
  console.log('\n--- Step 1: Connection test ---');
  try {
    const r = await request('GET', '/ISAPI/System/deviceInfo?format=json', '', 'application/json');
    console.log(`Status: ${r.status}`);
    if (r.status === 200) {
      try {
        const info = JSON.parse(r.body);
        console.log(`Device: ${info.DeviceInfo?.deviceName || info.DeviceInfo?.model || 'unknown'}`);
      } catch { console.log('Response:', r.body.substring(0, 200)); }
    } else {
      console.log('Response:', r.body.substring(0, 300));
    }
  } catch(e) { console.log('FAILED:', e.message); process.exit(1); }

  // 2. Проверка пользователя
  console.log('\n--- Step 2: Check if user exists ---');
  try {
    const body = JSON.stringify({ UserInfoSearchCond: { searchID: '1', maxResults: 1, EmployeeNoList: [{ employeeNo: String(employeeId) }] } });
    const r = await request('POST', '/ISAPI/AccessControl/UserInfo/Search?format=json', body, 'application/json');
    console.log(`Status: ${r.status}`);
    console.log('Response:', r.body.substring(0, 400));
  } catch(e) { console.log('FAILED:', e.message); }

  // 3. Добавить пользователя (или обновить)
  console.log('\n--- Step 3: Add/update user ---');
  try {
    const body = JSON.stringify({
      UserInfo: {
        employeeNo: String(employeeId), name: `Test_${employeeId}`, userType: 'normal',
        Valid: { enable: true, beginTime: '2020-01-01T00:00:00', endTime: '2037-12-31T23:59:59' },
        doorRight: '1', RightPlan: [{ doorNo: 1, planTemplateNo: '1' }],
      },
    });
    const r = await request('POST', '/ISAPI/AccessControl/UserInfo/Record?format=json', body, 'application/json');
    console.log(`Status: ${r.status}`);
    console.log('Response:', r.body.substring(0, 400));
  } catch(e) { console.log('FAILED:', e.message); }

  // 4. Создаём тестовое фото (маленький JPEG)
  console.log('\n--- Step 4: Find photo ---');
  // Ищем в config.json serverUrl и скачиваем фото
  let photoBuffer = null;
  const configPath = path.join(__dirname, 'config.json');
  if (fs.existsSync(configPath)) {
    const { serverUrl, agentToken } = JSON.parse(fs.readFileSync(configPath, 'utf8').replace(/^﻿/, ''));
    const agentIdFile = path.join(__dirname, 'agent-id.txt');
    const aid = fs.existsSync(agentIdFile) ? fs.readFileSync(agentIdFile, 'utf8').trim() : '';
    console.log(`Downloading photo from ${serverUrl}/api/agent/photo/${employeeId} ...`);
    try {
      const { default: https } = await import('https');
      const httpLib = serverUrl.startsWith('https') ? https : http;
      photoBuffer = await new Promise((resolve, reject) => {
        const url = new URL(`/api/agent/photo/${employeeId}`, serverUrl);
        const opts = {
          hostname: url.hostname, port: url.port || 80, path: url.pathname,
          method: 'GET',
          headers: { 'X-Agent-Token': agentToken, 'X-Agent-Id': aid },
          timeout: 15000,
        };
        const req = httpLib.request(opts, res => {
          if (res.statusCode === 404) { resolve(null); return; }
          const chunks = [];
          res.on('data', c => chunks.push(c));
          res.on('end', () => resolve(Buffer.concat(chunks)));
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });
        req.end();
      });
      if (photoBuffer) console.log(`Photo size: ${photoBuffer.length} bytes (${Math.round(photoBuffer.length/1024)} KB)`);
      else console.log('Photo not found on server');
    } catch(e) { console.log('Photo download failed:', e.message); }
  } else {
    console.log('config.json not found — skipping photo download');
  }

  if (!photoBuffer) {
    console.log('No photo available — skipping face upload tests');
    return;
  }

  // 5. Тест endpoint 1: /AccessControl/FaceDP/Record
  console.log('\n--- Step 5a: Upload face via /AccessControl/FaceDP/Record ---');
  await testFaceUpload('/ISAPI/AccessControl/FaceDP/Record?format=json', photoBuffer, employeeId);

  // 6. Тест endpoint 2: /Intelligent/FDLib/FaceDataRecord
  console.log('\n--- Step 5b: Upload face via /Intelligent/FDLib/FaceDataRecord ---');
  await testFaceUpload('/ISAPI/Intelligent/FDLib/FaceDataRecord?format=json', photoBuffer, employeeId);
}

async function testFaceUpload(endpoint, photoBuffer, employeeId) {
  const boundary = `----Boundary${crypto.randomBytes(4).toString('hex')}`;
  const jsonPart = JSON.stringify({ faceLibType: 'blackFD', FDID: '1', FPID: String(employeeId) });
  const bodyBuf = Buffer.concat([
    Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="FaceDataRecord"\r\nContent-Type: application/json\r\n\r\n${jsonPart}\r\n--${boundary}\r\nContent-Disposition: form-data; name="img"; filename="face.jpg"\r\nContent-Type: image/jpeg\r\n\r\n`),
    photoBuffer,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  try {
    const r = await request('POST', endpoint, bodyBuf, `multipart/form-data; boundary=${boundary}`);
    console.log(`Status: ${r.status}`);
    console.log('Response:', r.body.substring(0, 500));
  } catch(e) { console.log('FAILED:', e.message); }
}

main().catch(e => { console.error('Fatal:', e.message); });
