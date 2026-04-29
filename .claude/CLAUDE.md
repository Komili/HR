# КАДРЫ - HR Management System (Multi-Tenant Holding)

## Project Overview
Multi-tenant HR management web application for a holding company with 9 companies. Russian language interface. Full mobile responsiveness.

## Architecture
```
                    ┌─────────────────┐
                    │    ХОЛДИНГ      │
                    │  (Суперадмин)   │
                    └────────┬────────┘
                             │ видит ВСЁ
    ┌───────┬───────┬───────┬┴──────┬───────┬───────┬───────┬───────┬───────┐
    ▼       ▼       ▼       ▼       ▼       ▼       ▼       ▼       ▼       ▼
 Фавз  Дезинф. Фавз   Бунёд  Роҳҳои  Фавз   Макон  Макон  QIS.
        Кемик. Интер.  Фавз  Климат        (Маг.) Калам
        Каждая компания изолирована друг от друга
```

## Tech Stack
- **Backend**: NestJS 11 + TypeScript + Prisma ORM
- **Frontend**: Next.js 15 + React 19 + Tailwind CSS + shadcn/ui
- **Database**: MySQL 8.0
- **Auth**: JWT + Passport.js + bcrypt
- **Containerization**: Docker + docker-compose + Nginx
- **Tables**: TanStack React Table
- **Export**: XLSX (SheetJS)
- **Notifications**: Telegram Bot API
- **Face ID / СКУД**: Hikvision + relay-агент

## Key Ports
- MySQL: 7171 (external) / 3306 (internal)
- Backend: 7272 (external) / 7070 (internal)
- Frontend: 7373 (external) / 7070 (internal)
- Nginx HTTP: **7474**
- Nginx HTTPS: **7443**
- ISUP/EHome TCP: **7660** (Hikvision устройства → сервер, напрямую)

## Test Credentials

### Суперадмин холдинга (доступ ко ВСЕМ компаниям)
- admin@holding.tj / password
- admin1..admin5@holding.tj / password

### Бунёд Интернешнл
- hr@bunyod.tj / password (Кадровик)
- manager@bunyod.tj / password (Руководитель)
- accountant@bunyod.tj / password (Бухгалтер)

### Фавз
- hr@favz.tj / password (Кадровик)
- manager@favz.tj / password (Руководитель)

### Остальные компании
- hr@dezinfection.tj, hr@makon.tj, hr@makon-shop.tj, hr@rohhoi.tj, hr@favz-chemical.tj, hr@favz-climat.tj (Кадровик)

## User Roles (RBAC)
1. **Суперадмин** - Full access to ALL companies, can switch between companies
2. **Кадровик** - Full CRUD on employees, departments, positions, documents, attendance (own company only)
3. **Руководитель** - View employees, correct attendance (own company only)
4. **Бухгалтер** - View employee profiles only (own company only)
5. **Сотрудник** - No access to employee data

## Companies (9)
1. Фавз
2. Дезинфекция
3. Фавз Кемикал
4. Бунёд Интернешнл
5. Роҳҳои Фавз
6. Фавз Климат
7. Макон
8. Макон (Магазин)
9. QIS. Калам

## Project Structure
```
HR/
├── backend/                    # NestJS API
│   ├── src/
│   │   ├── auth/              # JWT, Passport, Guards
│   │   ├── companies/         # Company CRUD + work schedule
│   │   ├── employees/         # CRUD, photo upload, org-chart, reorder
│   │   ├── departments/       # CRUD + reorder (sortOrder)
│   │   ├── positions/         # CRUD with companyId filter
│   │   ├── position-history/  # История должностей сотрудника
│   │   ├── documents/         # File upload/download
│   │   ├── inventory/         # (скрыто в UI) Inventory + history
│   │   ├── offices/           # Office locations per company
│   │   ├── attendance/        # Events IN/OUT, daily summary, correction
│   │   ├── salary/            # (скрыто в UI) Salary calculation
│   │   ├── registration/      # Self-registration tokens + approval
│   │   ├── checkin/           # QR Check-in (без Face ID оборудования)
│   │   ├── doors/             # Управление дверями Hikvision (relay-агент)
│   │   ├── hikvision/         # Webhook + ISUP сервер + управление устройствами
│   │   │   ├── hikvision.service.ts        # Бизнес-логика СКУД
│   │   │   ├── hikvision.controller.ts     # REST API
│   │   │   ├── hikvision-isup.service.ts   # TCP сервер ISUP5.0/EHome2.0 (:7660)
│   │   │   └── hikvision.module.ts
│   │   ├── agent/             # Relay-агент для Face ID команд
│   │   ├── telegram/          # Telegram уведомления
│   │   ├── users/             # User management
│   │   └── prisma/            # Prisma service
│   └── prisma/
│       ├── schema.prisma      # DB schema
│       ├── seed.js            # JavaScript seed (for Docker)
│       ├── import-skud.js     # Импорт данных из skud.sql (одноразовый)
│       └── organize-photos.js # Раскладка фото из СКУД по папкам
├── frontend/                   # Next.js app
│   ├── app/
│   │   ├── (app)/             # Protected routes
│   │   │   ├── dashboard/     # Main dashboard with stats
│   │   │   ├── employees/     # List + [id] profile with tabs
│   │   │   ├── departments/
│   │   │   ├── positions/
│   │   │   ├── attendance/    # Attendance tracking with color coding
│   │   │   ├── org-structure/ # Оргструктура: иерархия + по отделам
│   │   │   ├── registrations/ # Заявки на регистрацию (QR + одобрение)
│   │   │   ├── qr/            # QR Check-in (самостоятельная отметка)
│   │   │   ├── reports/       # Отчёты (XLSX экспорт)
│   │   │   ├── admin/         # Админ-панель (суперадмин only)
│   │   │   ├── doors/         # Управление дверями СКУД (суперадмин only)
│   │   │   ├── salary/        # (скрыто в UI) Зарплата
│   │   │   ├── inventory/     # (скрыто в UI) Инвентарь
│   │   │   └── settings/      # Company & office settings
│   │   ├── (auth)/login/
│   │   ├── register/          # Публичная страница саморегистрации (?token=)
│   │   └── contexts/          # Auth context with company switching
│   ├── components/            # UI components
│   │   ├── dashboard-layout   # Sidebar + header + mobile hamburger
│   │   ├── data-table         # TanStack Table с фикс. колонками
│   │   ├── employee-avatar    # Аватар с JWT-авторизацией фото
│   │   ├── status-badge       # Переиспользуемый бейдж статуса
│   │   └── photo-capture      # Камера с силуэтом (для регистрации)
│   └── lib/
│       ├── hrms-api.ts        # API клиент
│       ├── types.ts           # TypeScript типы
│       └── utils.ts           # Утилиты
└── docker/nginx/              # Nginx config (HTTP + HTTPS)
agent/
├── relay-agent.js             # Relay-агент (polling + ISAPI к устройствам)
├── configure-isup.js          # Скрипт настройки ISUP/EHome на устройстве
├── test-connection.js         # Тест подключения к устройствам
└── package.json
```

## Database Models (Prisma)
- **Company** — holding companies (9); поля: workDayStart/End, lunchBreakStart/End
- **User** — system users with roles
- **Role** — RBAC roles (5)
- **Employee** — company employees; поля: skudId, managerId, photoPath, status, sortOrder
- **Department** — company departments; поле: sortOrder
- **Position** — job positions (unique per company)
- **PositionHistory** — история должностей сотрудника (startDate, endDate)
- **EmployeeDocument** — uploaded files per employee
- **InventoryItem** — (скрыто в UI) company inventory with assignment
- **InventoryHistory** — audit trail for inventory changes
- **Office** — office locations per company
- **AttendanceEvent** — raw IN/OUT events; поля: source (HIKVISION|QR_CHECKIN), selfiePath
- **Attendance** — daily attendance summary; поля: isLate, isEarlyLeave, correctionType
- **RegistrationToken** — токены для саморегистрации сотрудников
- **Door** — конфигурация дверей Hikvision (ip, port, deviceSerial)
- **DoorAccess** — доступы сотрудников к дверям
- **DoorCommand** — очередь команд для relay-агента (GRANT/REVOKE)
- **HikvisionDevice** — обнаруженные Hikvision устройства (mac, ip, lastSeenAt, companyId)
- **HikvisionAccess** — доступы сотрудников к HikvisionDevice (employeeId, deviceId)
- **HikvisionCommand** — очередь команд relay-агента для устройств (action: GRANT|REVOKE, status: pending|processing|done|failed)
- **Salary** — (скрыто в UI) расчёт зарплаты по месяцам
- **AuditLog** — журнал всех операций в системе

## API Endpoints
All endpoints prefixed with `/api`:

### Auth
- POST /api/auth/login — Login (returns companyId, isHoldingAdmin in token)

### Companies
- GET /api/companies — List companies
- GET /api/companies/stats — Holding statistics (superadmin only)
- GET /api/companies/:id — Get company
- POST /api/companies — Create (superadmin only)
- PATCH /api/companies/:id — Update
- PATCH /api/companies/:id/schedule — Update work schedule (workDayStart/End, lunch)
- DELETE /api/companies/:id — Delete (superadmin only)

### Employees
- GET /api/employees?companyId=X&page=N&limit=N&search=S — List
- POST /api/employees — Create
- GET /api/employees/:id — Get profile
- PATCH /api/employees/:id — Update
- DELETE /api/employees/:id — Delete
- POST /api/employees/:id/photo — Upload photo
- GET /api/employees/:id/photo — Get photo (full size, JWT required)
- GET /api/employees/:id/photo/thumbnail — Get thumbnail
- GET /api/employees/org-chart?companyId=X — Org hierarchy tree
- GET /api/employees/pending?companyId=X — Pending registration requests
- PATCH /api/employees/:id/approve — Approve registration
- PATCH /api/employees/:id/reject — Reject registration
- PATCH /api/employees/reorder — Reorder employees (sortOrder)

### Departments & Positions
- GET /api/departments?companyId=X
- POST/PATCH/DELETE /api/departments
- PATCH /api/departments/reorder — Reorder departments
- GET /api/positions?companyId=X
- POST/PATCH/DELETE /api/positions

### Position History
- GET /api/position-history/employee/:id — История должностей
- POST /api/position-history/employee/:id — Добавить запись
- PATCH /api/position-history/:id — Обновить
- DELETE /api/position-history/:id — Удалить

### Documents
- GET /api/documents/employee/:id — List documents
- POST /api/documents/upload/employee/:id — Upload
- GET /api/documents/:id/download — Download
- GET /api/documents/:id/view — Inline view
- DELETE /api/documents/:id — Delete

### Offices
- GET /api/offices?companyId=X
- POST /api/offices — Create
- PATCH /api/offices/:id — Update
- DELETE /api/offices/:id — Delete

### Attendance
- GET /api/attendance?date=YYYY-MM-DD&companyId=X — Daily summary
- GET /api/attendance/range?dateFrom=&dateTo=&companyId=X — Date range
- GET /api/attendance/employee/:id?month=M&year=Y — Employee monthly
- PATCH /api/attendance/:id/correct — Correct time (±minutes)
- POST /api/attendance/event — Register IN/OUT event

### Registration (QR саморегистрация)
- GET /api/registration/validate?token=T — Валидация токена (публичный)
- POST /api/registration/submit — Отправить заявку с фото (публичный)
- POST /api/registration/tokens — Создать токен регистрации
- GET /api/registration/tokens?companyId=X — Список токенов
- DELETE /api/registration/tokens/:id — Отозвать токен

### QR Check-in
- GET /api/checkin/employees?officeId=X&token=T — Список сотрудников офиса
- POST /api/checkin/event — Записать событие check-in/out
- GET /api/checkin/admin/qr — QR данные для офиса (JWT required)

### Doors (СКУД — relay-агент, старый подход)
- GET /api/doors?companyId=X — Список дверей
- POST /api/doors — Создать дверь
- PATCH /api/doors/:id — Обновить
- DELETE /api/doors/:id — Удалить
- POST /api/doors/:id/grant/:employeeId — Выдать доступ
- DELETE /api/doors/:id/revoke/:employeeId — Отозвать доступ
- POST /api/doors/:id/sync-all — Синхронизировать всех пользователей

### Agent (Relay-агент для Hikvision)
- GET /api/agent/commands — Получить DoorCommand команды (агент polling)
- PATCH /api/agent/commands/:id — Отчёт о выполнении DoorCommand
- GET /api/agent/hik-commands — Получить HikvisionCommand (GRANT/REVOKE устройств)
- PATCH /api/agent/hik-commands/:id — Отчёт о выполнении HikvisionCommand
- GET /api/agent/photo/:employeeId — Фото для Face ID
- GET /api/agent/doors — Список дверей агента
- GET /api/agent/status — Статус агента

### Hikvision (устройства + ISUP)
- POST /api/hikvision/event — Webhook от устройств (без JWT, ?token=)
- GET /api/hikvision/devices — Список обнаруженных устройств (суперадмин)
- GET /api/hikvision/devices/active?companyId=X — Активные устройства компании
- PATCH /api/hikvision/devices/:id/bind — Привязать устройство к компании
- PATCH /api/hikvision/devices/:id/unbind — Отвязать устройство
- DELETE /api/hikvision/devices/:id — Удалить устройство
- GET /api/hikvision/devices/employee/:employeeId — Устройства сотрудника
- POST /api/hikvision/devices/:id/grant/:employeeId — Выдать доступ
- DELETE /api/hikvision/devices/:id/revoke/:employeeId — Отозвать доступ
- GET /api/hikvision/devices/:id/ping — Пинг устройства
- GET /api/hikvision/devices/:id/check/:employeeId — Проверить доступ + статус синхронизации
- GET /api/hikvision/isup/status — Статус ISUP/EHome подключений (суперадмин)
- GET /api/hikvision/test?token= — Тест Telegram уведомления

### Users (суперадмин only)
- GET /api/users — Список пользователей
- GET /api/users/roles — Список ролей
- POST /api/users — Создать пользователя
- PATCH /api/users/:id — Обновить
- PATCH /api/users/:id/password — Изменить пароль
- DELETE /api/users/:id — Удалить

### Inventory (скрыто в UI)
- GET /api/inventory?companyId=X&page=N&limit=N&search=S
- POST/PATCH/DELETE /api/inventory
- GET /api/inventory/employee/:id
- PATCH /api/inventory/:id/assign/:employeeId
- PATCH /api/inventory/:id/unassign
- GET /api/inventory/:id/history

### Salary (скрыто в UI)
- POST /api/salary/calculate?month=M&year=Y
- GET /api/salary/employee/:id?year=Y

## Multi-Tenancy Implementation

### Database Schema
- All entities have `companyId` foreign key
- `User.isHoldingAdmin` flag for superadmins
- Unique constraints: `@@unique([name, companyId])` for departments/positions

### Backend Pattern
- `RequestUser` interface includes `companyId`, `isHoldingAdmin`
- All services have `getCompanyFilter(user, requestedCompanyId?)` method
- Superadmins pass `?companyId=X` to filter; regular users always filtered by own companyId
- `ForbiddenException` for cross-company access

### Frontend Pattern
- `AuthContext` manages `currentCompanyId`, `currentCompanyName`
- `CompanySelector` in sidebar for superadmins
- API calls use `withCompanyId()` helper (reads from localStorage)
- Amber/orange theme for superadmin UI elements

## Docker Commands
```bash
# Start all services
docker-compose up -d --build

# View logs
docker-compose logs -f backend
docker-compose logs -f frontend

# Reset database (DEV ONLY — удаляет все данные)
docker-compose exec backend npx prisma db push --force-reset
docker-compose exec backend node prisma/seed.js

# Import real data from skud.sql (one-time production import)
docker-compose exec backend npx prisma db push --force-reset
docker-compose exec backend node prisma/import-skud.js
docker-compose exec backend node prisma/organize-photos.js

# Rebuild specific service
docker-compose up -d --build frontend
docker-compose up -d --build backend
```

## Storage Structure
```
storage/
├── companies/
│   └── {CompanyName}/
│       └── employees/
│           └── {employeeId}/       # Только ID — стабильно при любых изменениях
│               ├── photo.jpg       # Оригинал фото
│               ├── photo_norm.jpg  # Нормализованное (авто-поворот, 800px)
│               ├── photo_thumb.jpg # Миниатюра 80x80
│               └── docs/           # Документы сотрудника
├── skud-photos/                    # Временная папка для импорта фото из СКУД
└── tmp/                            # Временные файлы загрузки
```

## Employee Statuses (8)
Активен, Стажёр, Руководитель, Дистанционно, В отпуске, Больничный, Декрет, Уволен

## Hidden Modules (скрыты по решению руководства, код сохранён)
- **Инвентарь** (`/inventory`) — закомментирован в меню `dashboard-layout.tsx`
- **Зарплата** (`/salary`) — закомментирован в меню `dashboard-layout.tsx`
- **Имущество** — таб в профиле сотрудника (`employees/[id]/page.tsx`) закомментирован
- Чтобы включить: раскомментировать соответствующие строки в этих двух файлах

## Environment Variables (.env)
```env
# Database
MYSQL_ROOT_PASSWORD=...
MYSQL_DATABASE=hrms
MYSQL_USER=hrms
MYSQL_PASSWORD=...
DATABASE_URL=mysql://...

# Backend
JWT_SECRET=...
PORT=7070

# Frontend
NEXT_PUBLIC_API_URL=http://backend:7070

# Telegram (уведомления о посещаемости, опозданиях)
TELEGRAM_TOKEN=...
TELEGRAM_CHAT_IDS=...   # через запятую

# Hikvision СКУД webhook
HIKVISION_WEBHOOK_TOKEN=...   # токен для webhook от устройств (?token=)

# Hikvision ISUP/EHome TCP сервер (порт 7660)
ISUP_PORT=7660
ISUP_ENC_KEY=...    # ключ шифрования ISUP (если настроен на устройстве)

# Relay-агент (Face ID команды через локальную сеть)
AGENT_SECRET_TOKEN=...  # токен для аутентификации агента
```

## Hikvision СКУД — Архитектура

### Два подхода к управлению устройствами

**1. Relay-агент (работает, основной)**
- ПК в локальной сети запускает `agent/relay-agent.js`
- Агент polling-ит `/api/agent/hik-commands` каждые 5 секунд
- Сервер создаёт `HikvisionCommand` (action=GRANT|REVOKE, status=pending)
- Агент выполняет ISAPI вызовы напрямую к устройству (192.168.0.x)
- Отчитывается через `PATCH /api/agent/hik-commands/:id`

**2. ISUP/EHome TCP сервер (порт 7660, WIP)**
- `HikvisionIsupService` — TCP сервер, слушает на :7660
- Устройство само подключается к серверу (обходит NAT)
- Поддерживает: ISUP5.0 (magic 0x20) и EHome2.0 (0x01 0x01, DS-K серия)
- Проблема: DS-K1T342MFX-E1 требует проприетарный EHome2.0 challenge-response
  (шифрование с "Ключ шифрования") — протокол не задокументирован публично
- Для включения ISUP без шифрования: запустить `agent/configure-isup.js`

### configure-isup.js
```bash
# На локальном ПК с relay-агентом:
# Посмотреть текущий конфиг ISUP на устройстве
node configure-isup.js 192.168.0.160 admin <пароль>

# Попробовать отключить шифрование + обновить адрес сервера
node configure-isup.js 192.168.0.160 admin <пароль> 185.177.0.140 7660
```

### Поток данных посещаемости
```
Hikvision устройство → HTTP Webhook → POST /api/hikvision/event
                     → HikvisionService.handleEvent()
                     → AttendanceEvent (source=HIKVISION)
                     → Telegram уведомление (опоздание, ранний уход)
```

### HikvisionDevice vs Door
- **Door** — старая модель (ip, port, login, password). Relay-агент через `/api/agent/commands`
- **HikvisionDevice** — новая модель (mac, lastSeenIp, companyId). Через `/api/agent/hik-commands`
- HikvisionDevice автоматически создаётся при первом webhook от устройства

## Important Notes
- Next.js 15 uses Promise-based params — use `React.use(params)` in client components
- Frontend uses `output: "standalone"` for Docker
- Backend uses `/api` global prefix
- Employee photo requires JWT auth — use `EmployeeAvatar` component
- `storage/tmp` must exist in container: `docker exec hrms_backend mkdir -p /app/storage/tmp`
- Dynamic Tailwind classes don't work (JIT purge) — use explicit class names
- Mobile: columns hidden via `meta: { className: "hidden sm:table-cell" }` in TanStack columns
- Nginx: use hostname variables in proxy_pass (no trailing slash, no /api/ suffix)
- `prisma db push --force-reset` resets AUTO_INCREMENT → same IDs each fresh import
- `import-skud.js` is a one-time migration script, not used in production flow
