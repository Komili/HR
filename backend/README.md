# КАДРЫ — Бэкенд (NestJS)

REST API для мультитенантной HR-системы холдинга.

## Стек

- **NestJS 11** + TypeScript
- **Prisma ORM** + MySQL 8.0
- **Passport.js** (JWT + Local стратегии)
- **bcrypt** для хеширования паролей
- **Multer** для загрузки файлов
- **@nestjs/throttler** — rate limiting

## Запуск (Docker)

```bash
# Из корня проекта
docker compose up -d --build backend

# Просмотр логов
docker compose logs -f backend
```

## Запуск локально

```bash
npm install
cp .env.example .env   # настроить DATABASE_URL
npm run start:dev
```

## База данных

```bash
# Применить схему (без миграций — shadow DB недоступна)
npx prisma db push

# Сгенерировать клиент
npx prisma generate

# Заполнить базовыми данными (роли, компании, суперадмин)
node prisma/seed.js
```

## Структура модулей

| Модуль | Путь | Описание |
|---|---|---|
| Auth | `src/auth/` | JWT-авторизация, Passport, Guards |
| Companies | `src/companies/` | CRUD компаний холдинга |
| Employees | `src/employees/` | CRUD сотрудников с фильтром по компании |
| Departments | `src/departments/` | Отделы (с сортировкой) |
| Positions | `src/positions/` | Должности (уникальны в рамках компании) |
| Position History | `src/position-history/` | История должностей сотрудника |
| Documents | `src/documents/` | Загрузка/скачивание файлов |
| Offices | `src/offices/` | Офисы компаний |
| Attendance | `src/attendance/` | Посещаемость (события IN/OUT, пересчёт) |
| Registration | `src/registration/` | Регистрация через QR-код |
| Checkin | `src/checkin/` | QR-чекин + мобильный чекин по телефону |
| Doors | `src/doors/` | Управление дверями (старый relay-агент) |
| Agent | `src/agent/` | API для relay-агента Hikvision |
| Hikvision | `src/hikvision/` | Webhook от устройств, ISUP TCP сервер |
| Telegram | `src/telegram/` | Уведомления в Telegram |
| Users | `src/users/` | Управление пользователями системы |
| Salary | `src/salary/` | (скрыто) Расчёт зарплат по посещаемости |
| Inventory | `src/inventory/` | (скрыто) Инвентарь + история |

## API Эндпоинты

Все эндпоинты с префиксом `/api`. Требуют JWT Bearer токен, кроме отмеченных `(публичный)`.

### Auth
- `POST /auth/login` — вход (возвращает `access_token`)

### Companies
- `GET /companies` — список компаний
- `GET /companies/stats` — статистика холдинга (суперадмин)
- `GET /companies/:id` — одна компания
- `POST /companies` — создать (суперадмин)
- `PATCH /companies/:id` — обновить
- `PATCH /companies/:id/schedule` — обновить расписание обеда
- `DELETE /companies/:id` — удалить (суперадмин)

### Employees
- `GET /employees?companyId=&page=&limit=&search=` — список
- `POST /employees` — создать
- `GET /employees/:id` — профиль
- `PATCH /employees/:id` — обновить
- `DELETE /employees/:id` — удалить
- `POST /employees/:id/photo` — загрузить фото
- `GET /employees/:id/photo` — получить фото (JWT)
- `GET /employees/:id/photo/thumbnail` — миниатюра (JWT)
- `GET /employees/org-chart?companyId=` — орг. структура
- `PATCH /employees/reorder` — изменить порядок

### Departments
- `GET /departments?companyId=` — список
- `POST /departments` — создать
- `PATCH /departments/:id` — обновить
- `DELETE /departments/:id` — удалить
- `PATCH /departments/reorder` — изменить порядок

### Positions
- `GET /positions?companyId=` — список
- `POST /positions` — создать
- `PATCH /positions/:id` — обновить
- `DELETE /positions/:id` — удалить

### Position History
- `GET /position-history/employee/:id` — история должностей
- `POST /position-history/employee/:id` — добавить запись
- `PATCH /position-history/:id` — обновить запись
- `DELETE /position-history/:id` — удалить запись

### Offices
- `GET /offices?companyId=` — список
- `POST /offices` — создать
- `PATCH /offices/:id` — обновить
- `DELETE /offices/:id` — удалить

### Attendance
- `GET /attendance?date=YYYY-MM-DD&companyId=` — дневная сводка
- `GET /attendance/range?dateFrom=&dateTo=&companyId=` — за период
- `GET /attendance/employee/:id?month=&year=` — по сотруднику
- `PATCH /attendance/:id/correct` — корректировка (±минуты)
- `POST /attendance/event` — регистрация события IN/OUT

> При расчёте `totalMinutes` автоматически вычитается обед (по умолчанию 12:00–13:00, настраивается через `/companies/:id/schedule`).

### Registration (QR саморегистрация)
- `GET /registration/validate?token=` — проверить токен (публичный)
- `POST /registration/submit` — подать заявку с фото (публичный)
- `GET /registration/tokens?companyId=` — список токенов
- `POST /registration/tokens` — создать токен
- `DELETE /registration/tokens/:id` — удалить токен
- `GET /registration/pending?companyId=` — заявки на рассмотрении
- `PATCH /registration/:id/approve` — одобрить
- `PATCH /registration/:id/reject` — отклонить

### Checkin (QR-чекин + мобильный)

QR-чекин — сотрудник сканирует QR у входа в офис:
- `GET /checkin/employees?officeId=&token=` — список сотрудников офиса (публичный, проверяет QR-токен)
- `POST /checkin/event` — записать событие check-in/out (публичный)
- `GET /checkin/admin/qr?officeId=` — данные для отображения QR (JWT)

Мобильный чекин — сотрудник вводит телефон + делает селфи:
- `GET /checkin/lookup?phone=` — поиск сотрудника по телефону без создания события (публичный, лимит 10 запр/мин)
- `POST /checkin/phone` — отметиться по телефону + фото (публичный, лимит 5 запр/мин)

Защита мобильного чекина:
- IP rate limiting (5 запросов/мин на `/phone`, 10 на `/lookup`)
- Cooldown 5 минут между отметками одного сотрудника
- Обязательное фото (без фото — 400 Bad Request)
- Проверка MIME-типа файла (jpeg/png/webp)

### Doors (управление дверями — старый подход через relay-агент)
- `GET /doors?companyId=` — список дверей
- `POST /doors` — создать дверь (ip, port, login, password)
- `PATCH /doors/:id` — обновить
- `DELETE /doors/:id` — удалить
- `POST /doors/:id/grant/:employeeId` — выдать доступ
- `DELETE /doors/:id/revoke/:employeeId` — отозвать доступ

### Agent (API для relay-агента)
- `GET /agent/hik-commands` — получить очередь команд (агент polling каждые 5 сек)
- `PATCH /agent/hik-commands/:id` — отчёт агента о выполнении команды
- `GET /agent/photo/:employeeId` — фото сотрудника для загрузки на устройство
- `GET /agent/status` — статус агента
- `GET /agent/commands` — старые DoorCommand команды (устаревший endpoint)
- `PATCH /agent/commands/:id` — отчёт по старым командам

### Hikvision (устройства + ISUP)
- `POST /hikvision/event?token=` — webhook от устройств (публичный, токен в query)
- `GET /hikvision/devices` — список обнаруженных устройств (суперадмин)
- `GET /hikvision/devices/active?companyId=` — активные устройства компании
- `PATCH /hikvision/devices/:id/bind` — привязать к компании
- `PATCH /hikvision/devices/:id/unbind` — отвязать
- `DELETE /hikvision/devices/:id` — удалить
- `POST /hikvision/devices/:id/grant/:employeeId` — выдать доступ
- `DELETE /hikvision/devices/:id/revoke/:employeeId` — отозвать доступ
- `GET /hikvision/devices/:id/ping` — пинг устройства
- `GET /hikvision/devices/:id/check/:employeeId` — проверить доступ сотрудника
- `GET /hikvision/isup/status` — статус ISUP/EHome подключений

### Users (суперадмин only)
- `GET /users` — список пользователей
- `GET /users/roles` — список ролей
- `POST /users` — создать
- `PATCH /users/:id` — обновить
- `PATCH /users/:id/password` — сменить пароль
- `DELETE /users/:id` — удалить

### Salary (скрыто в UI)
- `GET /salary?month=&year=&companyId=` — ведомость за месяц
- `GET /salary/employee/:id?year=` — история по сотруднику
- `POST /salary/calculate?month=&year=&companyId=` — рассчитать
- `PATCH /salary/:id` — обновить премию/удержание

### Inventory (скрыто в UI)
- `GET /inventory?companyId=&page=&limit=&search=` — список
- `POST /inventory` — создать
- `PATCH /inventory/:id` — обновить
- `DELETE /inventory/:id` — удалить
- `PATCH /inventory/:id/assign/:employeeId` — привязать к сотруднику
- `PATCH /inventory/:id/unassign` — отвязать
- `GET /inventory/:id/history` — история изменений

## Мультитенантность

- Каждый запрос фильтруется по `companyId` из JWT токена
- Суперадмин может передать `?companyId=X` для работы с любой компанией
- Пересечение данных между компаниями невозможно — `ForbiddenException` при попытке

## Переменные окружения

| Переменная | Описание |
|---|---|
| `DATABASE_URL` | Строка подключения MySQL |
| `JWT_SECRET` | Секрет для подписи JWT |
| `PORT` | Порт бэкенда (7070 внутри Docker) |
| `AGENT_SECRET_TOKEN` | Токен для аутентификации relay-агентов |
| `TELEGRAM_TOKEN` | Токен Telegram бота |
| `TELEGRAM_CHAT_IDS` | ID чатов через запятую |
| `HIKVISION_WEBHOOK_TOKEN` | Токен безопасности для webhook от устройств |
| `ISUP_PORT` | Порт ISUP/EHome TCP сервера (7660) |
| `ISUP_ENC_KEY` | Ключ шифрования EHome2.0 (если настроен на устройстве) |
