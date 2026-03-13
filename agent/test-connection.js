/**
 * Тест подключения — запусти перед установкой сервиса
 * Проверяет: сервер, токен, Hikvision устройства
 *
 * Запуск: node test-connection.js
 */

'use strict';

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

const CONFIG_PATH = path.join(__dirname, 'config.json');
if (!fs.existsSync(CONFIG_PATH)) {
  console.error('❌ config.json не найден! Скопируй config.example.json → config.json');
  process.exit(1);
}

const CONFIG = JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));

function req(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const lib = u.protocol === 'https:' ? https : http;
    const opts = {
      hostname: u.hostname,
      port: u.port || (u.protocol === 'https:' ? 443 : 80),
      path: u.pathname + u.search,
      method: 'GET',
      headers,
      timeout: 8000,
      rejectUnauthorized: false,
    };
    const r = lib.request(opts, res => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => resolve({ status: res.statusCode, body: d }));
    });
    r.on('error', reject);
    r.on('timeout', () => { r.destroy(); reject(new Error('Timeout')); });
    r.end();
  });
}

function reqLocal(ip, port) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: ip, port, path: '/', method: 'GET',
      timeout: 5000,
    };
    const r = http.request(opts, res => {
      resolve({ status: res.statusCode });
    });
    r.on('error', e => reject(e));
    r.on('timeout', () => { r.destroy(); reject(new Error('Timeout')); });
    r.end();
  });
}

async function run() {
  console.log('\n🔍 HRMS Relay Agent — Тест подключения\n');
  console.log(`  Сервер:    ${CONFIG.serverUrl}`);
  console.log(`  CompanyId: ${CONFIG.companyId}`);
  console.log('');

  // 1. Проверка сервера
  process.stdout.write('  [1] Сервер HRMS ... ');
  try {
    const r = await req(
      `${CONFIG.serverUrl}/api/agent/status?companyId=${CONFIG.companyId}`,
      { 'X-Agent-Token': CONFIG.agentToken }
    );
    if (r.status === 200) {
      const data = JSON.parse(r.body);
      console.log(`✅ OK  (pending: ${data.pending}, done: ${data.done}, failed: ${data.failed})`);
    } else if (r.status === 401) {
      console.log('❌ НЕВЕРНЫЙ ТОКЕН — проверь agentToken в config.json и AGENT_SECRET_TOKEN в backend/.env');
    } else if (r.status === 403) {
      console.log('❌ FORBIDDEN — возможно AGENT_SECRET_TOKEN не настроен на сервере');
    } else {
      console.log(`❌ HTTP ${r.status}: ${r.body.substring(0, 100)}`);
    }
  } catch (e) {
    console.log(`❌ ОШИБКА: ${e.message}`);
    console.log('     Проверь serverUrl и что сервер доступен из этой сети');
  }

  // 2. Проверка Hikvision устройств через API
  process.stdout.write('  [2] Команды в очереди ... ');
  try {
    const r = await req(
      `${CONFIG.serverUrl}/api/agent/commands?companyId=${CONFIG.companyId}`,
      { 'X-Agent-Token': CONFIG.agentToken }
    );
    if (r.status === 200) {
      const cmds = JSON.parse(r.body);
      console.log(`✅ OK  (${cmds.length} команд)`);

      if (cmds.length > 0) {
        console.log('\n  ⚠️  Есть необработанные команды. Агент выполнит их при запуске.\n');
        cmds.forEach(c => {
          console.log(`     #${c.id} [${c.action}] ${c.employee.lastName} → ${c.door.name}`);
          console.log(`       IN  device: ${c.door.inDeviceIp}:${c.door.inDevicePort}`);
          console.log(`       OUT device: ${c.door.outDeviceIp}:${c.door.outDevicePort}`);
        });

        // Тестируем достижимость устройств
        console.log('\n  [3] Проверка Hikvision устройств:');
        const tested = new Set();
        for (const cmd of cmds) {
          for (const [lbl, ip, port] of [
            ['IN ', cmd.door.inDeviceIp, cmd.door.inDevicePort],
            ['OUT', cmd.door.outDeviceIp, cmd.door.outDevicePort],
          ]) {
            const key = `${ip}:${port}`;
            if (tested.has(key)) continue;
            tested.add(key);
            process.stdout.write(`       ${lbl} ${ip}:${port} ... `);
            try {
              const d = await reqLocal(ip, port);
              // Hikvision обычно возвращает 401 для unauthorized GET / — это нормально
              if (d.status === 401 || d.status === 200) {
                console.log('✅ Устройство отвечает');
              } else {
                console.log(`⚠️  HTTP ${d.status} (нестандартный ответ)`);
              }
            } catch (e) {
              console.log(`❌ НЕДОСТИЖИМО: ${e.message}`);
              console.log('       → Проверь IP и что агент в той же сети что и устройства');
            }
          }
        }
      }
    } else {
      console.log(`❌ HTTP ${r.status}`);
    }
  } catch (e) {
    console.log(`❌ ${e.message}`);
  }

  console.log('\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('  Готово. Если всё ✅ — запускай install.bat для установки сервиса.');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n');
}

run().catch(e => { console.error(e); process.exit(1); });
