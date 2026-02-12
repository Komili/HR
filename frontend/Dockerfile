# Этап 1: Сборка приложения
FROM node:20-alpine AS builder

WORKDIR /app

# Копируем package.json и package-lock.json
COPY package*.json ./

# Устанавливаем зависимости
RUN npm install

# Копируем исходный код
COPY . .

# Для Docker используем /api через nginx proxy
ENV NEXT_PUBLIC_API_URL=/api

# Собираем приложение
RUN npm run build

# Этап 2: Финальный образ
FROM node:20-alpine

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1

# Backend URL для API прокси (внутри Docker-сети)
ENV BACKEND_URL=http://backend:7070

# Копируем необходимые файлы
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public

# Открываем порт
EXPOSE 7070

ENV PORT=7070
ENV HOSTNAME="0.0.0.0"

# Команда для запуска
CMD ["node", "server.js"]
