# Этап 1: Сборка приложения
FROM node:20-alpine AS builder

WORKDIR /app

# Копируем package.json и package-lock.json
COPY package*.json ./

# Устанавливаем зависимости
RUN npm install

# Копируем исходный код
COPY . .

# Собираем приложение
RUN npm run build

# Этап 2: Установка production-зависимостей
FROM node:20-alpine AS production

WORKDIR /app

COPY package*.json ./
RUN npm install --omit=dev

# Этап 3: Финальный образ
FROM node:20-alpine

WORKDIR /app

# Копируем собранное приложение из этапа 'builder'
COPY --from=builder /app/dist ./dist

# Копируем production-зависимости из этапа 'production'
COPY --from=production /app/node_modules ./node_modules

# Открываем порт, на котором будет работать приложение
EXPOSE 7070

# Команда для запуска приложения
CMD ["node", "dist/main"]
