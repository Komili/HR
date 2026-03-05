# КАДРЫ — Бэкенд (NestJS)

REST API для мультитенантной HR-системы холдинга.

## Стек

- **NestJS 11** + TypeScript
- **Prisma ORM** + MySQL 8.0
- **Passport.js** (JWT + Local стратегии)
- **bcrypt** для хеширования паролей
- **Multer** для загрузки файлов

## Запуск (Docker)

```bash
# Из корня проекта
docker-compose up -d --build backend

# Просмотр логов
docker-compose logs -f backend
```

## Запуск локально

```bash
npm install
cp .env.example .env   # настроить DATABASE_URL
npm run start:dev
```

## База данных

```bash
# Применить схему (без миграций, т.к. shadow DB недоступна)
npx prisma db push

# Сгенерировать клиент
npx prisma generate

# Заполнить тестовыми данными
node prisma/seed.js
```

## Структура модулей

| Модуль | Путь | Описание |
|---|---|---|
| Auth | `src/auth/` | JWT-авторизация, Passport, Guards |
| Companies | `src/companies/` | CRUD компаний холдинга |
| Employees | `src/employees/` | CRUD сотрудников с фильтром по компании |
| Departments | `src/departments/` | Отделы |
| Positions | `src/positions/` | Должности |
| Documents | `src/documents/` | Загрузка/скачивание файлов |
| Inventory | `src/inventory/` | Инвентарь + история |
| Offices | `src/offices/` | Офисы компаний |
| Attendance | `src/attendance/` | Посещаемость (события IN/OUT, пересчёт) |
| Salary | `src/salary/` | Расчёт зарплат по посещаемости |
| Position History | `src/position-history/` | История должностей сотрудника |
| Registration | `src/registration/` | Регистрация через QR-код |
| Users | `src/users/` | Управление пользователями |

## API Эндпоинты

Все эндпоинты с префиксом `/api`. Требуют JWT Bearer токен, кроме:
- `POST /api/auth/login`
- `POST /api/registration/submit`

### Auth
- `POST /auth/login` — вход (возвращает `access_token`)

### Companies
- `GET /companies` — список компаний
- `GET /companies/stats` — статистика холдинга (суперадмин)
- `GET /companies/:id` — одна компания
- `POST /companies` — создать (суперадмин)
- `PATCH /companies/:id` — обновить (суперадмин)
- `PATCH /companies/:id/schedule` — обновить расписание обеда (кадровик/руководитель)
- `DELETE /companies/:id` — удалить (суперадмин)

### Employees
- `GET /employees?companyId=&page=&limit=&search=` — список
- `POST /employees` — создать
- `GET /employees/:id` — профиль
- `PATCH /employees/:id` — обновить
- `DELETE /employees/:id` — удалить

### Attendance
- `GET /attendance?date=YYYY-MM-DD&companyId=` — дневная сводка
- `GET /attendance/range?dateFrom=&dateTo=&companyId=` — за период
- `GET /attendance/employee/:id?month=&year=` — по сотруднику
- `PATCH /attendance/:id/correct` — корректировка (±минуты)
- `POST /attendance/event` — регистрация события IN/OUT

> **Обед**: при расчёте `totalMinutes` автоматически вычитается перерыв на обед компании (настраивается через `/companies/:id/schedule`). По умолчанию 12:00–13:00.

### Salary
- `GET /salary?month=&year=&companyId=` — ведомость за месяц
- `GET /salary/employee/:id?year=` — история по сотруднику
- `POST /salary/calculate?month=&year=&companyId=` — рассчитать
- `PATCH /salary/:id` — обновить премию/удержание

### Position History
- `GET /position-history/employee/:id` — история должностей
- `POST /position-history/employee/:id` — добавить запись
- `PATCH /position-history/:id` — обновить запись
- `DELETE /position-history/:id` — удалить запись

### Registration (QR)
- `GET /registration/tokens?companyId=` — токены
- `POST /registration/tokens` — создать токен
- `DELETE /registration/tokens/:id` — удалить токен
- `POST /registration/submit` — подать заявку (публично)
- `GET /registration/pending?companyId=` — заявки на рассмотрении
- `PATCH /registration/:id/approve` — одобрить
- `PATCH /registration/:id/reject` — отклонить

## Мультитенантность

- Каждый запрос фильтруется по `companyId` из JWT
- Суперадмин может передать `?companyId=X` для работы с любой компанией
- Пересечение данных между компаниями невозможно — `ForbiddenException` при попытке

## Переменные окружения

| Переменная | Описание |
|---|---|
| `DATABASE_URL` | Строка подключения MySQL |
| `JWT_SECRET` | Секрет для подписи JWT |
| `JWT_EXPIRES_IN` | Время жизни токена (напр. `1h`) |
| `STORAGE_PATH` | Путь хранения файлов (напр. `/app/storage`) |
