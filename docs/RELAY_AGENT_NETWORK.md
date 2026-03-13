# Сетевая архитектура СКУД — Relay Agent

## Общая схема

```
                        ИНТЕРНЕТ
                           │
               ┌───────────┴───────────┐
               │   HRMS СЕРВЕР         │
               │   (Docker, порт 7474) │
               │                       │
               │  БД: DoorCommand      │
               │  ┌─────────────────┐  │
               │  │ pending         │  │
               │  │ processing      │  │
               │  │ done            │  │
               │  │ failed          │  │
               │  └─────────────────┘  │
               └───────────┬───────────┘
                           │ HTTPS исходящий
        ┌──────────────────┼──────────────────┐
        │                  │                  │
        ▼                  ▼                  ▼
  ┌──────────┐       ┌──────────┐       ┌──────────┐
  │  Офис 1  │       │  Офис 2  │       │  Офис 3  │
  │ Душанбе  │       │ Худжанд  │       │ Бохтар   │
  │          │       │          │       │          │
  │  Agent   │       │  Agent   │       │  Agent   │
  │  cId=1   │       │  cId=2   │       │  cId=3   │
  └────┬─────┘       └────┬─────┘       └────┬─────┘
       │ HTTP локал.       │                  │
  ┌────┴────────┐          │                  │
  │ 192.168.1.x │     [аналогично]       [аналогично]
  │             │
  │  Hikvision  │  ← Face ID сканер (снаружи)
  │  IN device  │
  │             │
  │  Hikvision  │  ← Face ID сканер (внутри)
  │  OUT device │
  └─────────────┘
```

---

## Что нужно на каждом объекте

### На компьютере (ПК/ноутбук в офисе)
- Windows 10/11 или Windows Server
- Node.js 18+
- Интернет (исходящий HTTPS к серверу)
- **Находится в той же локальной сети что и Hikvision**

### На роутере офиса
**Ничего не нужно менять.** Агент использует только исходящие соединения.

### На Hikvision устройстве
Только стандартные настройки. Убедись что:
- У устройства есть статический IP (или DHCP reservation)
- Веб-интерфейс доступен: `http://192.168.x.x` → должно открываться
- Логин/пароль настроены

---

## Поток данных при выдаче доступа

```
Кадровик нажимает "Открыть доступ"
    │
    ▼
HRMS создаёт запись в DoorCommand:
    { action: "grant", status: "pending", doorId: X, employeeId: Y }
    │
    │  (моментально — UI показывает галочку)
    │
    ▼
Агент в офисе (каждые 5 сек):
    GET /api/agent/commands?companyId=X
    │
    ├── Получает команду
    ├── Скачивает фото сотрудника с сервера
    ├── Отправляет PUT на Hikvision IN device:
    │     /ISAPI/AccessControl/UserInfo/Record (добавить пользователя)
    │     /ISAPI/Intelligent/FDLib/FaceDataRecord (загрузить лицо)
    ├── То же самое для Hikvision OUT device
    └── PATCH /api/agent/commands/:id { status: "done" }
    │
    ▼
Сотрудник прикладывает лицо → Hikvision открывает дверь
```

---

## Поток данных при входе сотрудника (посещаемость)

```
Сотрудник прикладывает лицо к Hikvision
    │
    ▼
Hikvision отправляет HTTP Event на сервер:
    POST https://сервер.com/api/hikvision/event
    (настраивается в веб-интерфейсе Hikvision)
    │
    ▼
Сервер создаёт AttendanceEvent
```

Для этого нужно:
1. Hikvision → Configuration → Network → Advanced Settings → Integration Protocol
2. HTTP Listening: включить, URL = `https://сервер.com/api/hikvision/event`
3. У Hikvision должен быть **исходящий интернет** (или VPN к серверу)

---

## Сравнение вариантов подключения

| | Relay Agent (реализован) | Port Forwarding | VPN |
|---|---|---|---|
| Сложность настройки | ⭐ Минимальная | ⭐⭐ Средняя | ⭐⭐⭐ Высокая |
| Безопасность | ✅ Высокая | ⚠️ Низкая | ✅ Высокая |
| Устройства в интернете | ❌ Нет | ⚠️ Да | ❌ Нет |
| Требует настройки роутера | ❌ Нет | ✅ Да | ✅ Да |
| Задержка применения | ~5 сек | ~0 сек | ~0 сек |
| Работает через NAT/мобильный интернет | ✅ Да | ❌ Нет | ❌ Нет |

---

## Настройка Hikvision для событий посещаемости

В веб-интерфейсе каждого устройства:

1. **Configuration → Network → Advanced Settings → Integration Protocol**
2. Enable HTTP Listening: `ON`
3. HTTP Listening Host: IP/домен сервера
4. HTTP Listening Port: `7474` (или 443 если HTTPS)
5. HTTP Listening URL: `/api/hikvision/event`

Устройству нужен **исходящий интернет** для отправки событий.
Варианты:
- Прямой интернет через роутер (настроить DNS/default gateway на устройстве)
- Через агент (агент может проксировать — при необходимости можно доработать)

---

## Мониторинг статуса агентов

Просмотр очереди команд в БД:
```sql
-- Висящие команды (агент не обрабатывает)
SELECT dc.id, dc.action, dc.status, dc.error, dc.createdAt,
       d.name as door, d.companyId,
       CONCAT(e.lastName, ' ', e.firstName) as employee
FROM DoorCommand dc
JOIN Door d ON d.id = dc.doorId
JOIN Employee e ON e.id = dc.employeeId
WHERE dc.status != 'done'
ORDER BY dc.createdAt DESC;
```

```sql
-- Сбросить зависшие processing → pending (если агент упал)
UPDATE DoorCommand
SET status = 'pending'
WHERE status = 'processing'
  AND updatedAt < DATE_SUB(NOW(), INTERVAL 10 MINUTE);
```
