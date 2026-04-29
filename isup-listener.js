const net = require('net');
const xml2js = require('xml2js');
const axios = require('axios');
const { randomBytes } = require('crypto');

const config = {
    listenPort: 7001,
    serverApiUrl: 'http://localhost:3001/api/hikvision/event',
};

const parser = new xml2js.Parser({ explicitArray: false });

function createResponsePacket(command, sessionId) {
    const header = Buffer.from([
        0x48, 0x49, 0x4b, 0x49, // Magic word 'HIKI'
        0x01, 0x00,             // Protocol version
        0x00, 0x00,             // Flags
    ]);
    const commandId = Buffer.alloc(4);
    commandId.writeUInt32LE(command, 0);

    const sessionIdBuffer = sessionId || randomBytes(16);
    const reserved = Buffer.alloc(8);

    const totalLength = header.length + commandId.length + sessionIdBuffer.length + reserved.length;
    const lengthBuffer = Buffer.alloc(4);
    lengthBuffer.writeUInt32LE(totalLength, 0);

    const finalPacket = Buffer.concat([header, lengthBuffer, commandId, sessionIdBuffer, reserved]);
    // console.log(`[ISUP-PACKET] Создан ответный пакет: command=${command}, hex=${finalPacket.toString('hex')}`);
    return finalPacket;
}

function startListener() {
    const server = net.createServer((socket) => {
        const remoteIp = socket.remoteAddress.split(':').pop();
        console.log(`[ISUP-LISTENER] >>> Установлено новое TCP соединение от: ${remoteIp}`);

        let deviceSessionId = null;

        socket.on('data', async (data) => {
            console.log(`[ISUP-LISTENER] === Получены данные от ${remoteIp} (hex): ${data.toString('hex')}`);

            const dataString = data.toString('utf-8', 40);
            
            if (dataString.includes('<Register>')) {
                console.log(`[ISUP-LISTENER] Обнаружен пакет регистрации от ${remoteIp}.`);
                deviceSessionId = data.slice(16, 32);
                const response = createResponsePacket(0x02, deviceSessionId);
                socket.write(response);
                console.log(`[ISUP-LISTENER] Отправлен ответ на регистрацию.`);
                return;
            }

            if (data.length >= 16 && data.readUInt32LE(12) === 0x14) {
                 console.log(`[ISUP-LISTENER] Обнаружен Heartbeat от ${remoteIp}.`);
                 const response = createResponsePacket(0x15, deviceSessionId);
                 socket.write(response);
                 console.log(`[ISUP-LISTENER] Отправлен ответ на Heartbeat.`);
                 return;
            }

            const xmlStartIndex = dataString.indexOf('<?xml');
            if (xmlStartIndex !== -1) {
                const xmlData = dataString.substring(xmlStartIndex);
                console.log(`[ISUP-LISTENER] Обнаружен XML с событием:`, xmlData);
                
                try {
                    // Отправляем необработанный текст, т.к. основной сервер умеет его парсить
                    await axios.post(config.serverApiUrl, xmlData, {
                        headers: { 'Content-Type': 'text/plain' }
                    });
                } catch (e) {
                    console.error("[ISUP-LISTENER] Ошибка отправки события на главный API:", e.message);
                }
            }
        });

        socket.on('close', () => {
            console.log(`[ISUP-LISTENER] <<< Соединение с ${remoteIp} закрыто.`);
        });

        socket.on('error', (err) => {
            console.error(`[ISUP-LISTENER] !!! Ошибка сокета для ${remoteIp}:`, err.message);
        });
    });

    server.listen(config.listenPort, () => {
        console.log(`[ISUP-LISTENER] ISUP сервер запущен и слушает порт ${config.listenPort}`);
    });
}

module.exports = { startListener };
