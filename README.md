# КАДРЫ — Система управления персоналом для холдинга

Мультитенантное веб-приложение для управления персоналом холдинга из 8 компаний. Суперадмины холдинга имеют доступ ко всем компаниям, обычные пользователи видят только свою компанию.

## 🏢 Архитектура холдинга

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

## 🚀 Быстрый старт (Docker)

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

### ⚠️ При обновлении схемы БД

Если вы обновляете проект с новой схемой базы данных:

```bash
# Полный сброс (удаляет все данные!)
docker-compose down -v
docker-compose up -d --build

# Подождать ~30 секунд, затем
docker-compose exec backend npx prisma migrate reset --force
```

## 🌐 Доступ к приложению

**URL:** http://localhost:7474

## 🔑 Тестовые учётные записи

### 🔴 Суперадмины холдинга (доступ ко ВСЕМ компаниям)

| Email | Пароль | Описание |
|-------|--------|----------|
| `admin1@holding.tj` | `password` | Суперадмин 1 |
| `admin2@holding.tj` | `password` | Суперадмин 2 |
| `admin3@holding.tj` | `password` | Суперадмин 3 |
| `admin4@holding.tj` | `password` | Суперадмин 4 |
| `admin5@holding.tj` | `password` | Суперадмин 5 |

### 🔵 Бунёд Интернешнл

| Email | Пароль | Роль |
|-------|--------|------|
| `hr@bunyod.tj` | `password` | Кадровик |
| `manager@bunyod.tj` | `password` | Руководитель |
| `accountant@bunyod.tj` | `password` | Бухгалтер |

### 🟢 Фавз

| Email | Пароль | Роль |
|-------|--------|------|
| `hr@favz.tj` | `password` | Кадровик |
| `manager@favz.tj` | `password` | Руководитель |

## 🏭 Компании холдинга (8)

1. **Бунёд Интернешнл** — головная компания
2. **Дезинфекция** — санитарные услуги
3. **Макон** — производство
4. **Макон (Магазин)** — розничная торговля
5. **Роҳҳои Фавз** — логистика
6. **Фавз** — основное производство
7. **Фавз Кемикал** — химическая продукция
8. **Фавз Климат** — климатическое оборудование

## 👥 Роли и права доступа

| Роль | Уровень доступа | Возможности |
|------|-----------------|-------------|
| **Суперадмин** | Весь холдинг | Полный доступ ко всем компаниям, переключение между компаниями |
| **Кадровик** | Своя компания | CRUD сотрудников, отделов, должностей, документов |
| **Руководитель** | Своя компания | Просмотр списка сотрудников и профилей |
| **Бухгалтер** | Своя компания | Просмотр профилей сотрудников |
| **Сотрудник** | — | Нет доступа к данным персонала |

### Матрица прав доступа

| Функция | Суперадмин | Кадровик | Руководитель | Бухгалтер |
|---------|:----------:|:--------:|:------------:|:---------:|
| Переключение между компаниями | ✅ | ❌ | ❌ | ❌ |
| Просмотр всех компаний | ✅ | ❌ | ❌ | ❌ |
| Просмотр списка сотрудников | ✅ | ✅ | ✅ | ❌ |
| Просмотр профиля сотрудника | ✅ | ✅ | ✅ | ✅ |
| Создание/редактирование сотрудников | ✅ | ✅ | ❌ | ❌ |
| Управление отделами | ✅ | ✅ | ❌ | ❌ |
| Управление должностями | ✅ | ✅ | ❌ | ❌ |
| Загрузка документов | ✅ | ✅ | ❌ | ❌ |

## 📊 Тестовые данные

После запуска seed-скрипта в базе будут:

- **8 компаний** холдинга
- **5 суперадминов** с доступом ко всем компаниям
- **По 5 отделов** в каждой компании (Администрация, Бухгалтерия, Отдел кадров, Отдел продаж, Склад)
- **По 8 должностей** в каждой компании
- **5 тестовых сотрудников** (3 в Бунёд, 2 в Фавз)
- **7 пользователей** компаний с разными ролями

## 🐳 Docker сервисы

| Сервис | Контейнер | Внутренний порт | Внешний порт |
|--------|-----------|-----------------|--------------|
| MySQL 8.0 | hrms_db | 3306 | 7171 |
| Backend (NestJS) | hrms_backend | 7070 | 7272 |
| Frontend (Next.js) | hrms_frontend | 7070 | 7373 |
| Nginx (прокси) | hrms_nginx | 80 | **7474** |

## 📝 Полезные команды

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

## 💻 Локальная разработка (без Docker)

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

## ✨ Функциональность

### Реализовано
- ✅ **Мультитенантность** — 8 компаний с изолированными данными
- ✅ **Суперадмины** — 5 пользователей с доступом ко всему холдингу
- ✅ **Переключатель компаний** — для суперадминов в боковой панели
- ✅ **Авторизация** — JWT токены с информацией о компании
- ✅ **Роли и права (RBAC)** — 5 ролей с разным уровнем доступа
- ✅ **Сотрудники** — полный CRUD, поиск, пагинация
- ✅ **Отделы** — уникальны в рамках компании
- ✅ **Должности** — уникальны в рамках компании
- ✅ **Документы** — загрузка/скачивание, организация по компаниям
- ✅ **Дашборд** — статистика по персоналу
- ✅ **Полностью на русском языке**

## 🛠 Технологии

| Компонент | Технология | Версия |
|-----------|------------|--------|
| **Backend** | NestJS + TypeScript | 11.x |
| **Frontend** | Next.js + React | 15.x / 19.x |
| **База данных** | MySQL | 8.0 |
| **ORM** | Prisma | 5.x |
| **UI** | Tailwind CSS + shadcn/ui | 4.x |
| **Авторизация** | JWT + Passport.js | — |
| **Контейнеризация** | Docker + docker-compose | — |
| **Прокси** | Nginx | 1.27 |

## 📁 Структура проекта

```
HR/
├── backend/                    # NestJS API
│   ├── src/
│   │   ├── auth/              # Авторизация (JWT, Passport)
│   │   ├── companies/         # CRUD компаний (NEW)
│   │   ├── employees/         # CRUD сотрудников (с фильтром по companyId)
│   │   ├── departments/       # CRUD отделов (с фильтром по companyId)
│   │   ├── positions/         # CRUD должностей (с фильтром по companyId)
│   │   ├── documents/         # Загрузка/скачивание файлов
│   │   ├── users/             # Управление пользователями
│   │   └── prisma/            # Prisma сервис
│   └── prisma/
│       ├── schema.prisma      # Схема БД с моделью Company
│       ├── seed.ts            # Тестовые данные (TypeScript)
│       ├── seed.js            # Тестовые данные (JavaScript)
│       └── migrations/        # Миграции БД
├── frontend/                   # Next.js приложение
│   ├── app/
│   │   ├── (app)/             # Защищённые страницы
│   │   │   ├── dashboard/     # Главная панель
│   │   │   ├── employees/     # Сотрудники
│   │   │   ├── departments/   # Отделы
│   │   │   ├── positions/     # Должности
│   │   │   ├── reports/       # Отчёты
│   │   │   └── settings/      # Настройки
│   │   ├── (auth)/            # Страницы авторизации
│   │   │   └── login/         # Вход
│   │   └── contexts/          # React контексты (с переключением компаний)
│   ├── components/            # UI компоненты
│   │   ├── ui/                # shadcn/ui компоненты
│   │   └── dashboard-layout.tsx # Layout с переключателем компаний
│   └── lib/                   # Утилиты и API клиент
├── storage/                    # Хранилище документов
│   └── companies/             # Папки по компаниям
│       └── {CompanyName}/
│           └── employees/
│               └── {FirstName}_{LastName}_{id}/
│                   └── docs/
├── docker/
│   └── nginx/
│       └── default.conf       # Конфигурация Nginx
├── docker-compose.yml         # Docker оркестрация
└── README.md                  # Документация
```

## 📂 Хранилище документов

Документы организованы по компаниям:

```
storage/companies/{CompanyName}/employees/{FirstName}_{LastName}_{id}/docs/
```

**Пример:**
```
storage/companies/Bunyod_Interneshnl/employees/Farrukh_Rahimov_1/docs/
├── passport_2026-01-30.pdf
├── snils_2026-01-30.pdf
└── employment_contract_2026-01-30.pdf
```

## 🔧 API Endpoints

### Авторизация
```
POST /api/auth/login     — Вход → access_token с companyId, isHoldingAdmin
POST /api/auth/register  — Регистрация
```

### Компании (NEW)
```
GET    /api/companies           — Список компаний (суперадмин видит все)
GET    /api/companies/stats     — Статистика холдинга (только суперадмин)
GET    /api/companies/:id       — Детали компании
POST   /api/companies           — Создать (только суперадмин)
PATCH  /api/companies/:id       — Обновить (только суперадмин)
DELETE /api/companies/:id       — Удалить (только суперадмин)
```

### Сотрудники (с фильтрацией по компании)
```
GET    /api/employees?companyId=X  — Список (фильтр по компании)
GET    /api/employees/:id          — Детали (проверка доступа)
POST   /api/employees              — Создать (companyId из токена или body)
PATCH  /api/employees/:id          — Обновить (проверка доступа)
DELETE /api/employees/:id          — Удалить (проверка доступа)
```

### Отделы и Должности (с фильтрацией по компании)
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

## 🔒 Безопасность

- ✅ Пароли хешируются с bcrypt (10 rounds)
- ✅ JWT токены с информацией о компании и роли
- ✅ Проверка доступа к данным другой компании (ForbiddenException)
- ✅ Суперадмины имеют флаг `isHoldingAdmin` в токене
- ✅ CORS настроен для разрешённых доменов
- ✅ Валидация всех входных данных (class-validator)
- ✅ Файлы хранятся вне публичной директории

## 🐛 Решение проблем

### Ошибка при запуске после обновления схемы
```bash
# Полный сброс базы данных
docker-compose down -v
docker-compose up -d --build
# Подождать 30 секунд
docker-compose exec backend npx prisma migrate reset --force
```

### Контейнер backend не запускается
```bash
# Проверьте логи
docker-compose logs backend

# Убедитесь что БД готова
docker-compose logs db
```

### Frontend не видит API
```bash
# Проверьте что backend работает
curl http://localhost:7272/api

# Тест авторизации
curl http://localhost:7474/api/auth/login -X POST \
  -H "Content-Type: application/json" \
  -d '{"email":"admin1@holding.tj","password":"password"}'
```

### Суперадмин не видит все компании
```bash
# Убедитесь что seed выполнен корректно
docker-compose exec backend node prisma/seed.js

# Проверьте в БД
docker-compose exec db mysql -u hrms -phrmspassword123 hrms \
  -e "SELECT email, isHoldingAdmin FROM User WHERE isHoldingAdmin = 1;"
```

## 📄 Лицензия

MIT
