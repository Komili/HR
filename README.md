# КАДРЫ - Система управления персоналом

Мультитенантная HR-система для холдинга из 8 компаний.

## Быстрый старт

```bash
# 1. Скачать
git clone https://github.com/Komili/HR.git
cd HR

# 2. Настроить
cp .env.example .env
# Отредактируйте .env — измените пароли!

# 3. Запустить (5-15 минут в первый раз)
docker compose up --build -d

# 4. Создать таблицы в БД
docker compose exec backend npx prisma db push

# 5. Заполнить данными
docker compose exec backend node prisma/seed.js

# 6. Открыть http://localhost:7474
# Логин: admin@holding.tj
# Пароль: password
```

Подробная инструкция: **[docs/ИНСТРУКЦИЯ.md](docs/ИНСТРУКЦИЯ.md)**

---

## Модули системы

| Модуль | Описание |
|--------|----------|
| Сотрудники | CRUD, профили с вкладками, фото, документы |
| Отделы / Должности | Уникальные в рамках каждой компании |
| Посещаемость | Учёт времени, корректировки, цветовая кодировка |
| Зарплата | Расчёт на основе посещаемости |
| Инвентарь | Учёт имущества, привязка к сотрудникам, история |
| Оргструктура | Визуальная древовидная иерархия |
| Админ-панель | Управление пользователями, компаниями, ролями |

## Роли

| Роль | Доступ |
|------|--------|
| **Суперадмин** | Все компании + админ-панель |
| **Кадровик** | Полный CRUD (своя компания) |
| **Руководитель** | Просмотр + корректировка времени |
| **Бухгалтер** | Просмотр профилей и зарплат |

## Технологии

- **Backend:** NestJS 11 + Prisma + MySQL 8
- **Frontend:** Next.js 15 + React 19 + Tailwind CSS + shadcn/ui
- **Инфраструктура:** Docker + Nginx

## Порты

| Сервис | Порт |
|--------|------|
| **Система (Nginx)** | **7474** |
| MySQL | 7171 |
| Backend API | 7272 |
| Frontend | 7373 |

## Полезные команды

```bash
# Тестовые данные
docker compose exec backend node prisma/seed.js

# Очистка БД (остаётся только админ)
docker compose exec backend node prisma/clean-db.js

# Логи
docker compose logs -f backend

# Полный сброс
docker compose down -v && docker compose up --build -d
docker compose exec backend npx prisma db push
docker compose exec backend node prisma/seed.js
```
