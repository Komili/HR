# КАДРЫ — Система управления персоналом для холдинга

Мультитенантное веб-приложение для управления персоналом холдинга из 8 компаний. Суперадмины холдинга имеют доступ ко всем компаниям, обычные пользователи видят только свою компанию.

## Архитектура холдинга

```
                    ┌─────────────────┐
                    │    ХОЛДИНГ      │
                    │  (5 Суперадминов)│
                    └────────┬────────┘
                             │ видят ВСЁ
    ┌────────┬───────┬───────┼───────┬────────┬────────┬────────┐
    ▼        ▼       ▼       ▼       ▼        ▼        ▼        ▼
┌───────┬───────┬───────┬───────┬───────┬───────┬───────┬───────┐
│Бунёд  │Дезин- │Макон  │Макон  │Роҳҳои │ Фавз  │Фавз   │Фавз   │
│Интер. │фекция │       │(Маг.) │ Фавз  │       │Кемик. │Климат │
└───────┴───────┴───────┴───────┴───────┴───────┴───────┴───────┘
           Данные каждой компании изолированы
```

## Быстрый старт (Docker)

```bash
# 1. Клонировать репозиторий
git clone <repo-url>
cd HR

# 2. Запустить все сервисы
docker-compose up -d --build

# 3. Подождать ~30 секунд пока запустится БД

# 4. Применить миграции и заполнить данными
docker-compose exec backend npx prisma migrate reset --force

# 5. Приложение доступно на http://localhost:7474
```

### При обновлении схемы БД

```bash
# Полный сброс (удаляет все данные!)
docker-compose down -v
docker-compose up -d --build

# Подождать ~30 секунд, затем
docker-compose exec backend npx prisma migrate reset --force
```

## Доступ к приложению

**URL:** http://localhost:7474

## Тестовые учётные записи

### Суперадмины холдинга (доступ ко ВСЕМ компаниям)

| Email | Пароль | Описание |
|-------|--------|----------|
| `admin1@holding.tj` | `password` | Суперадмин 1 |
| `admin2@holding.tj` | `password` | Суперадмин 2 |
| `admin3@holding.tj` | `password` | Суперадмин 3 |
| `admin4@holding.tj` | `password` | Суперадмин 4 |
| `admin5@holding.tj` | `password` | Суперадмин 5 |

### Бунёд Интернешнл

| Email | Пароль | Роль |
|-------|--------|------|
| `hr@bunyod.tj` | `password` | Кадровик |
| `manager@bunyod.tj` | `password` | Руководитель |
| `accountant@bunyod.tj` | `password` | Бухгалтер |

### Фавз

| Email | Пароль | Роль |
|-------|--------|------|
| `hr@favz.tj` | `password` | Кадровик |
| `manager@favz.tj` | `password` | Руководитель |

## Компании холдинга (8)

1. **Бунёд Интернешнл** — головная компания
2. **Дезинфекция** — санитарные услуги
3. **Макон** — производство
4. **Макон (Магазин)** — розничная торговля
5. **Роҳҳои Фавз** — логистика
6. **Фавз** — основное производство
7. **Фавз Кемикал** — химическая продукция
8. **Фавз Климат** — климатическое оборудование

## Роли и права доступа

| Роль | Уровень доступа | Возможности |
|------|-----------------|-------------|
| **Суперадмин** | Весь холдинг | Полный доступ ко всем компаниям, переключение между компаниями |
| **Кадровик** | Своя компания | CRUD сотрудников, отделов, должностей, документов, инвентаря, посещаемости |
| **Руководитель** | Своя компания | Просмотр сотрудников, корректировка посещаемости |
| **Бухгалтер** | Своя компания | Просмотр профилей сотрудников |
| **Сотрудник** | — | Нет доступа к данным персонала |

### Матрица прав доступа

| Функция | Суперадмин | Кадровик | Руководитель | Бухгалтер |
|---------|:----------:|:--------:|:------------:|:---------:|
| Переключение между компаниями | + | - | - | - |
| Просмотр всех компаний | + | - | - | - |
| Просмотр списка сотрудников | + | + | + | - |
| Просмотр профиля сотрудника | + | + | + | + |
| Создание/редактирование сотрудников | + | + | - | - |
| Управление отделами | + | + | - | - |
| Управление должностями | + | + | - | - |
| Загрузка документов | + | + | - | - |
| Управление инвентарём | + | + | - | - |
| Просмотр посещаемости | + | + | + | + |
| Корректировка посещаемости | + | + | + | - |
| Регистрация прихода/ухода | + | + | - | - |
| Управление офисами | + | + | - | - |

## Функциональность

### Реализовано
- **Мультитенантность** — 8 компаний с изолированными данными
- **Суперадмины** — 5 пользователей с доступом ко всему холдингу
- **Переключатель компаний** — для суперадминов в боковой панели
- **Авторизация** — JWT токены с информацией о компании
- **Роли и права (RBAC)** — 5 ролей с разным уровнем доступа
- **Сотрудники** — полный CRUD, поиск, пагинация, профиль с вкладками
- **Отделы** — уникальны в рамках компании
- **Должности** — уникальны в рамках компании
- **Документы** — загрузка/скачивание, организация по компаниям
- **Инвентарь** — учёт имущества, назначение сотрудникам, история изменений
- **Офисы** — управление офисными локациями компаний
- **Посещаемость** — учёт рабочего времени, корректировка, цветовая кодировка статусов
- **Отчёты** — генерация CSV отчётов (сотрудники, отделы, посещаемость, месячный обзор)
- **Дашборд** — статистика по персоналу с быстрыми отчётами
- **Настройки** — управление компанией и офисами
- **Адаптивная вёрстка** — все страницы оптимизированы для мобильных устройств
- **Полностью на русском языке**

## Тестовые данные

После запуска seed-скрипта в базе будут:

- **8 компаний** холдинга
- **5 суперадминов** с доступом ко всем компаниям
- **По 5 отделов** в каждой компании (Администрация, Бухгалтерия, Отдел кадров, Отдел продаж, Склад)
- **По 8 должностей** в каждой компании
- **5 тестовых сотрудников** (3 в Бунёд, 2 в Фавз)
- **7 пользователей** компаний с разными ролями
- **Инвентарь** с историей назначений
- **Офисы** (2-3 на компанию)
- **Посещаемость** за последние 30 дней с событиями IN/OUT

## Docker сервисы

| Сервис | Контейнер | Внутренний порт | Внешний порт |
|--------|-----------|-----------------|--------------|
| MySQL 8.0 | hrms_db | 3306 | 7171 |
| Backend (NestJS) | hrms_backend | 7070 | 7272 |
| Frontend (Next.js) | hrms_frontend | 7070 | 7373 |
| Nginx (прокси) | hrms_nginx | 80 | **7474** |

## Полезные команды

```bash
# Запустить все сервисы
docker-compose up -d

# Остановить все сервисы
docker-compose down

# Посмотреть логи всех сервисов
docker-compose logs -f

# Посмотреть логи конкретного сервиса
docker-compose logs -f backend
docker-compose logs -f frontend

# Полный сброс с чистой базой данных
docker-compose down -v
docker-compose up -d --build
# Подождать 30 сек, затем:
docker-compose exec backend npx prisma migrate reset --force

# Только заполнить данными (без сброса)
docker cp backend/prisma/seed.js hrms_backend:/app/prisma/seed.js
docker-compose exec backend node prisma/seed.js

# Открыть Prisma Studio (GUI для БД)
docker-compose exec backend npx prisma studio

# Подключиться к MySQL
docker-compose exec db mysql -u hrms -phrmspassword123 hrms

# Перезапустить конкретный сервис
docker-compose restart backend
docker-compose restart frontend
```

## Локальная разработка (без Docker)

### Требования
- Node.js 20+
- MySQL 8.0
- npm

### 1. База данных

```bash
mysql -u root -p
```

```sql
CREATE DATABASE hrms;
CREATE USER 'hrms'@'localhost' IDENTIFIED BY 'hrmspassword123';
GRANT ALL PRIVILEGES ON hrms.* TO 'hrms'@'localhost';
FLUSH PRIVILEGES;
```

### 2. Backend

```bash
cd backend

# Установить зависимости
npm install

# Создать .env файл
cp .env.example .env
# Отредактируйте DATABASE_URL: mysql://hrms:hrmspassword123@localhost:3306/hrms

# Применить миграции и создать таблицы
npx prisma migrate dev

# Заполнить тестовыми данными
npm run db:seed

# Запустить в режиме разработки
npm run start:dev
```

### 3. Frontend

```bash
cd frontend

# Установить зависимости
npm install

# Создать .env.local
echo "NEXT_PUBLIC_API_URL=http://localhost:3000/api" > .env.local

# Запустить в режиме разработки
npm run dev
```

**Приложение будет доступно:**
- Frontend: http://localhost:3000
- Backend API: http://localhost:3000/api

## Технологии

| Компонент | Технология | Версия |
|-----------|------------|--------|
| **Backend** | NestJS + TypeScript | 11.x |
| **Frontend** | Next.js + React | 15.x / 19.x |
| **База данных** | MySQL | 8.0 |
| **ORM** | Prisma | 5.x |
| **UI** | Tailwind CSS + shadcn/ui | 4.x |
| **Таблицы** | TanStack React Table | 8.x |
| **Экспорт** | SheetJS (xlsx) | — |
| **Авторизация** | JWT + Passport.js | — |
| **Контейнеризация** | Docker + docker-compose | — |
| **Прокси** | Nginx | 1.27 |

## Структура проекта

```
HR/
├── backend/                    # NestJS API
│   ├── src/
│   │   ├── auth/              # Авторизация (JWT, Passport)
│   │   ├── companies/         # CRUD компаний
│   │   ├── employees/         # CRUD сотрудников
│   │   ├── departments/       # CRUD отделов
│   │   ├── positions/         # CRUD должностей
│   │   ├── documents/         # Загрузка/скачивание файлов
│   │   ├── inventory/         # Учёт инвентаря + история
│   │   ├── offices/           # Офисные локации
│   │   ├── attendance/        # Учёт посещаемости + корректировка
│   │   ├── users/             # Управление пользователями
│   │   └── prisma/            # Prisma сервис
│   └── prisma/
│       ├── schema.prisma      # Схема БД (13 моделей)
│       ├── seed.ts            # Тестовые данные (TypeScript)
│       ├── seed.js            # Тестовые данные (JavaScript)
│       └── migrations/        # Миграции БД
├── frontend/                   # Next.js приложение
│   ├── app/
│   │   ├── (app)/             # Защищённые страницы
│   │   │   ├── dashboard/     # Главная панель со статистикой
│   │   │   ├── employees/     # Сотрудники (список + профиль с вкладками)
│   │   │   ├── departments/   # Отделы
│   │   │   ├── positions/     # Должности
│   │   │   ├── inventory/     # Инвентарь (TanStack Table)
│   │   │   ├── attendance/    # Посещаемость (цветовая кодировка)
│   │   │   ├── reports/       # Отчёты (CSV экспорт)
│   │   │   └── settings/      # Настройки (компания + офисы)
│   │   ├── (auth)/            # Страницы авторизации
│   │   │   └── login/         # Вход
│   │   └── contexts/          # React контексты
│   ├── components/            # UI компоненты
│   │   ├── ui/                # shadcn/ui компоненты
│   │   └── dashboard-layout.tsx # Layout с переключателем компаний
│   └── lib/                   # Утилиты и API клиент
├── storage/                    # Хранилище документов
│   └── companies/             # Папки по компаниям
├── docker/
│   └── nginx/
│       └── default.conf       # Конфигурация Nginx
├── docker-compose.yml         # Docker оркестрация
└── README.md                  # Документация
```

## API Endpoints

Все эндпоинты начинаются с `/api`:

### Авторизация
```
POST /api/auth/login     — Вход → access_token с companyId, isHoldingAdmin
POST /api/auth/register  — Регистрация
```

### Компании
```
GET    /api/companies           — Список компаний (суперадмин видит все)
GET    /api/companies/stats     — Статистика холдинга (только суперадмин)
GET    /api/companies/:id       — Детали компании
POST   /api/companies           — Создать (только суперадмин)
PATCH  /api/companies/:id       — Обновить (только суперадмин)
DELETE /api/companies/:id       — Удалить (только суперадмин)
```

### Сотрудники
```
GET    /api/employees?companyId=X&page=N&limit=N&search=S  — Список
GET    /api/employees/:id          — Профиль
POST   /api/employees              — Создать
PATCH  /api/employees/:id          — Обновить
DELETE /api/employees/:id          — Удалить
```

### Отделы и Должности
```
GET    /api/departments?companyId=X
GET    /api/positions?companyId=X
POST/PATCH/DELETE — с проверкой доступа к компании
```

### Документы
```
GET  /api/documents/employee/:id           — Список документов
POST /api/documents/upload/employee/:id    — Загрузить
GET  /api/documents/:id/download           — Скачать
GET  /api/documents/:id/view               — Просмотр (inline)
```

### Инвентарь
```
GET    /api/inventory?companyId=X&page=N&limit=N&search=S — Список
GET    /api/inventory/:id                  — Детали
POST   /api/inventory                      — Создать
PATCH  /api/inventory/:id                  — Обновить
DELETE /api/inventory/:id                  — Удалить
GET    /api/inventory/employee/:id         — Инвентарь сотрудника
PATCH  /api/inventory/:id/assign/:empId    — Назначить сотруднику
PATCH  /api/inventory/:id/unassign         — Снять назначение
GET    /api/inventory/:id/history          — История изменений
```

### Офисы
```
GET    /api/offices?companyId=X  — Список офисов
POST   /api/offices              — Создать
PATCH  /api/offices/:id          — Обновить
DELETE /api/offices/:id          — Удалить
```

### Посещаемость
```
GET   /api/attendance?date=YYYY-MM-DD&companyId=X      — Сводка за день
GET   /api/attendance/range?dateFrom=&dateTo=&companyId=X — За период
GET   /api/attendance/employee/:id?month=M&year=Y       — Месячная история
PATCH /api/attendance/:id/correct                       — Корректировка времени
POST  /api/attendance/event                             — Регистрация входа/выхода
```

## Безопасность

- Пароли хешируются с bcrypt (10 rounds)
- JWT токены с информацией о компании и роли
- Проверка доступа к данным другой компании (ForbiddenException)
- Суперадмины имеют флаг `isHoldingAdmin` в токене
- CORS настроен для разрешённых доменов
- Валидация всех входных данных (class-validator)
- Файлы хранятся вне публичной директории

## Решение проблем

### Ошибка при запуске после обновления схемы
```bash
docker-compose down -v
docker-compose up -d --build
# Подождать 30 секунд
docker-compose exec backend npx prisma migrate reset --force
```

### Контейнер backend не запускается
```bash
docker-compose logs backend
docker-compose logs db
```

### Frontend не видит API
```bash
curl http://localhost:7272/api
curl http://localhost:7474/api/auth/login -X POST \
  -H "Content-Type: application/json" \
  -d '{"email":"admin1@holding.tj","password":"password"}'
```

## Лицензия

MIT
