# Инструкция по развёртыванию и переносу КАДРЫ (HR System)

## Содержание
1. [Требования к серверу](#1-требования-к-серверу)
2. [Что нужно перенести](#2-что-нужно-перенести)
3. [Шаг 1 — Подготовка нового сервера](#шаг-1--подготовка-нового-сервера)
4. [Шаг 2 — Копирование файлов](#шаг-2--копирование-файлов)
5. [Шаг 3 — Настройка окружения](#шаг-3--настройка-окружения)
6. [Шаг 4 — Запуск системы](#шаг-4--запуск-системы)
7. [Шаг 5 — Загрузка данных](#шаг-5--загрузка-данных)
8. [Шаг 6 — Проверка](#шаг-6--проверка)
9. [Обслуживание](#обслуживание)
10. [Возможные проблемы](#возможные-проблемы)

---

## 1. Требования к серверу

### Минимальные характеристики
- **CPU**: 2 ядра
- **RAM**: 4 GB (рекомендуется 8 GB)
- **Диск**: 50 GB свободного места (данные + образы Docker)
- **ОС**: Ubuntu 22.04 LTS / Debian 12 / CentOS 8+

### Необходимое ПО
```bash
# Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# Docker Compose
sudo apt-get install docker-compose-plugin   # Ubuntu/Debian
# или
sudo yum install docker-compose-plugin       # CentOS/RHEL

# Проверка версий
docker --version           # >= 24.x
docker compose version     # >= 2.x
```

---

## 2. Что нужно перенести

### Файлы проекта (исходный код)
```
HR/
├── backend/          ← весь исходный код бэкенда
├── frontend/         ← весь исходный код фронтенда
├── docker/           ← конфиг Nginx
├── docker-compose.yml
├── .env              ← ⚠️ СЕКРЕТЫ (создать вручную, не копировать!)
├── .env.example      ← шаблон для создания .env
└── README.md
```

### Данные (файлы пользователей)
```
storage/
├── companies/        ← фото и документы сотрудников (~940 MB)
└── skud-photos/      ← оригинальные фото из СКУД (~780 MB)
```

### База данных
```
skud.sql              ← дамп данных из СКУД для импорта
```

> **⚠️ ВАЖНО**: Файл `.env` с паролями **НЕ копировать** напрямую.
> На новом сервере создать заново со своими паролями!

---

## Шаг 1 — Подготовка нового сервера

```bash
# Обновить систему
sudo apt update && sudo apt upgrade -y

# Установить Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
newgrp docker

# Создать рабочую директорию
mkdir -p /opt/hrms
cd /opt/hrms
```

---

## Шаг 2 — Копирование файлов

### Вариант A: Через SCP / SFTP (рекомендуется)

С **текущего сервера** или локальной машины:

```bash
# Копировать исходный код (без node_modules, без storage)
rsync -avz --exclude='node_modules' \
           --exclude='.next' \
           --exclude='dist' \
           --exclude='*.tsbuildinfo' \
           --exclude='.env' \
           --exclude='storage' \
           --exclude='skud.sql' \
           /c/repos/HR/ user@NEW_SERVER_IP:/opt/hrms/

# Копировать skud.sql (1.3 MB)
scp /c/repos/HR/skud.sql user@NEW_SERVER_IP:/opt/hrms/

# Копировать папку storage (ВНИМАНИЕ: ~1.7 GB, займёт время)
rsync -avz --progress \
    /c/repos/HR/storage/ \
    user@NEW_SERVER_IP:/opt/hrms/storage/
```

### Вариант B: Через архив

```bash
# На текущей машине — создать архив исходников
tar -czf hrms-source.tar.gz \
    --exclude='*/node_modules' \
    --exclude='*/.next' \
    --exclude='*/dist' \
    --exclude='*.tsbuildinfo' \
    --exclude='.env' \
    --exclude='storage' \
    --exclude='skud.sql' \
    /c/repos/HR/

# Передать на новый сервер
scp hrms-source.tar.gz user@NEW_SERVER_IP:/opt/hrms/

# На новом сервере — распаковать
cd /opt/hrms
tar -xzf hrms-source.tar.gz --strip-components=1
rm hrms-source.tar.gz

# Отдельно передать данные
scp /c/repos/HR/skud.sql user@NEW_SERVER_IP:/opt/hrms/
rsync -avz --progress /c/repos/HR/storage/ user@NEW_SERVER_IP:/opt/hrms/storage/
```

### Вариант C: Через Git + данные отдельно

```bash
# На новом сервере — клонировать репозиторий
cd /opt/hrms
git clone https://YOUR_GIT_REPO_URL .

# Затем передать данные через rsync/scp (как выше)
```

---

## Шаг 3 — Настройка окружения

На **новом сервере**:

```bash
cd /opt/hrms

# Создать .env из шаблона
cp .env.example .env

# Отредактировать .env — обязательно сменить все пароли!
nano .env
```

### Содержимое `.env` (заменить значения своими)

```env
# База данных MySQL
MYSQL_USER=hrms
MYSQL_PASSWORD=ВАШ_НАДЁЖНЫЙ_ПАРОЛЬ_ДЛЯ_БД
MYSQL_ROOT_PASSWORD=ВАШ_ROOT_ПАРОЛЬ
MYSQL_DATABASE=hrms

# Подключение (пароль должен совпадать с MYSQL_PASSWORD выше)
DATABASE_URL="mysql://hrms:ВАШ_НАДЁЖНЫЙ_ПАРОЛЬ_ДЛЯ_БД@db:3306/hrms"

# JWT секрет — сгенерировать случайный (минимум 32 символа)
JWT_SECRET=сгенерируйте-случайную-строку-здесь-минимум-32-символа

# Не менять
PORT=7070
NEXT_PUBLIC_API_URL=/api
```

#### Генерация случайного JWT секрета:
```bash
# Linux/Mac
openssl rand -base64 48
# или
cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w 48 | head -n 1
```

### Проверить права на папку storage

```bash
# Убедиться что папка storage доступна
ls -la /opt/hrms/storage/
chmod -R 755 /opt/hrms/storage/

# Создать папку для временных файлов загрузок (обязательно!)
mkdir -p /opt/hrms/storage/tmp
```

---

## Шаг 4 — Запуск системы

```bash
cd /opt/hrms

# Собрать и запустить все контейнеры
docker compose up -d --build

# Следить за логами сборки (опционально)
docker compose logs -f
```

### Ожидаемый результат после запуска:
```
Container hrms_db        Started
Container hrms_backend   Started
Container hrms_frontend  Started
Container hrms_nginx     Started
```

### Проверить что всё запущено:
```bash
docker compose ps
```

Все контейнеры должны иметь статус `Up`.

### Создать папку tmp внутри контейнера (обязательно для загрузки фото)

```bash
docker exec hrms_backend mkdir -p /app/storage/tmp
```

---

## Шаг 5 — Загрузка данных

### 5.1 Сбросить и создать схему БД

```bash
docker compose exec backend npx prisma db push --force-reset
```

### 5.2 Импортировать данные из СКУД

```bash
# Скопировать скрипты в контейнер
docker cp backend/prisma/import-skud.js hrms_backend:/app/prisma/import-skud.js
docker cp backend/prisma/organize-photos.js hrms_backend:/app/prisma/organize-photos.js

# Запустить импорт (~2-5 минут)
docker compose exec backend node prisma/import-skud.js
```

Ожидаемый вывод:
```
✅ Импортировано сотрудников: 203
✅ Импортировано событий: 11074
✅ Создано дневных сводок: 2723
```

### 5.3 Разложить фото сотрудников

```bash
docker compose exec backend node prisma/organize-photos.js
```

Ожидаемый вывод:
```
✅ Фото разложено: 203
   Без фото (СКУД): 0
   Не найдено: 0
```

---

## Шаг 6 — Проверка

### Проверить доступность системы

```bash
# Заменить SERVER_IP на IP вашего нового сервера
curl -s -o /dev/null -w "%{http_code}" http://SERVER_IP:7474/
# Должен вернуть: 200

curl -s -o /dev/null -w "%{http_code}" http://SERVER_IP:7474/api/employees?companyId=1
# Должен вернуть: 401 (нужна авторизация — это нормально)
```

### Открыть в браузере

```
http://SERVER_IP:7474
```

### Тестовые учётные записи

| Роль | Email | Пароль |
|------|-------|--------|
| Суперадмин | admin@holding.tj | password |
| Кадровик Фавз | hr@favz.tj | password |
| Кадровик Макон | hr@makon.tj | password |
| Кадровик Бунёд | hr@bunyod.tj | password |

> После первого входа **обязательно смените пароли** через страницу настроек!

### Проверить систему QR-регистрации

```bash
# Токен регистрации создаётся через интерфейс:
# Войти → Регистрации → QR-коды → "Создать QR"
# Затем открыть в браузере:
http://SERVER_IP:7474/register?token=ВАШТОКЕН

# Или через API:
curl -s "http://SERVER_IP:7474/api/registration/validate?token=НЕВАЛИДНЫЙ"
# Должен вернуть: {"message":"Токен недействителен или отозван","statusCode":404}
```

---

## Обслуживание

### Рестарт системы после сброса сервера

```bash
cd /opt/hrms
docker compose up -d
```

### Полный сброс и переимпорт данных

```bash
cd /opt/hrms

# 1. Пересобрать контейнеры
docker compose up -d --build

# 2. Сбросить БД
docker compose exec backend npx prisma db push --force-reset

# 3. Импортировать данные
docker cp backend/prisma/import-skud.js hrms_backend:/app/prisma/import-skud.js
docker cp backend/prisma/organize-photos.js hrms_backend:/app/prisma/organize-photos.js
docker compose exec backend node prisma/import-skud.js
docker compose exec backend node prisma/organize-photos.js
```

### Просмотр логов

```bash
docker compose logs -f backend    # логи бэкенда
docker compose logs -f frontend   # логи фронтенда
docker compose logs -f nginx      # логи nginx
docker compose logs -f db         # логи MySQL
```

### Резервная копия БД

```bash
# Создать дамп MySQL
docker compose exec db mysqldump \
    -u hrms -p'ВАШ_ПАРОЛЬ' hrms > backup_$(date +%Y%m%d).sql

# Восстановить из дампа
docker compose exec -T db mysql \
    -u hrms -p'ВАШ_ПАРОЛЬ' hrms < backup_20260225.sql
```

### Резервная копия файлов storage

```bash
# Архивировать фото и документы
tar -czf storage_backup_$(date +%Y%m%d).tar.gz /opt/hrms/storage/companies/
```

### Настройка автозапуска при перезагрузке сервера

Docker уже настроен на автозапуск (`restart: unless-stopped`).
Убедиться что Docker запускается автоматически:

```bash
sudo systemctl enable docker
sudo systemctl start docker
```

---

## Возможные проблемы

### Белая страница / JS ошибки в браузере
```bash
# Рестарт nginx (обновляет DNS кэш)
docker compose restart nginx
```

### "Cannot GET /" или 404 на всех страницах
```bash
docker compose restart nginx
# Подождать 5 секунд и обновить страницу
```

### База данных не подключается
```bash
# Проверить статус контейнеров
docker compose ps

# Проверить логи БД
docker compose logs db

# Убедиться что DATABASE_URL в .env совпадает с MYSQL_PASSWORD
```

### Ошибка "Salary table does not exist"
```bash
# НЕ использовать migrate reset — использовать db push
docker compose exec backend npx prisma db push --force-reset
docker cp backend/prisma/import-skud.js hrms_backend:/app/prisma/import-skud.js
docker compose exec backend node prisma/import-skud.js
```

### Порт 7474 недоступен
```bash
# Проверить firewall
sudo ufw allow 7474/tcp    # Ubuntu
sudo firewall-cmd --add-port=7474/tcp --permanent && sudo firewall-cmd --reload  # CentOS
```

### Фото не отображаются
```bash
docker cp backend/prisma/organize-photos.js hrms_backend:/app/prisma/organize-photos.js
docker compose exec backend node prisma/organize-photos.js
```

---

## Порты системы

| Порт | Сервис | Доступ |
|------|--------|--------|
| **7474** | Nginx (основной) | Публичный — открыть в firewall |
| 7171 | MySQL | Только внутри сервера |
| 7272 | Backend API | Только внутри сервера |
| 7373 | Frontend | Только внутри сервера |

> Открывать наружу только порт **7474**. Остальные — только для отладки.

---

## Структура файлов на новом сервере

```
/opt/hrms/
├── backend/
│   ├── src/
│   ├── prisma/
│   │   ├── schema.prisma
│   │   ├── seed.js
│   │   ├── import-skud.js
│   │   └── organize-photos.js
│   ├── Dockerfile
│   └── package.json
├── frontend/
│   ├── app/
│   ├── components/
│   ├── lib/
│   ├── Dockerfile
│   └── package.json
├── docker/
│   └── nginx/
│       └── default.conf
├── storage/
│   ├── companies/      ← фото и документы сотрудников
│   └── skud-photos/    ← оригинальные фото СКУД
├── skud.sql            ← дамп данных для импорта
├── docker-compose.yml
├── .env                ← создать вручную из .env.example
└── .env.example
```
