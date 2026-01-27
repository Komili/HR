# Этап 1: Сборка приложения
FROM node:20-alpine AS builder

WORKDIR /app

# Копируем package.json и package-lock.json (если есть)
COPY package*.json ./

# Устанавливаем зависимости
RUN npm install

# Копируем исходный код
COPY . .

# Собираем приложение
RUN npm run build

# Этап 2: Финальный образ
FROM node:20-alpine

WORKDIR /app

# Устанавливаем production-зависимости
COPY package*.json ./
RUN npm install --omit=dev

# Копируем собранное приложение из этапа 'builder'
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./

# Открываем порт
EXPOSE 7070

# Команда для запуска приложения
CMD ["npm", "start", "--", "-p", "7070"]
