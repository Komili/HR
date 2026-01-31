# Stage 1: build
FROM node:20-bullseye-slim AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

# Copy all source files first
COPY . .

# Generate Prisma client with the latest schema
RUN npx prisma generate

# Build the application
RUN npm run build

# Compile seed script
RUN npx tsc prisma/seed.ts --outDir dist/prisma --esModuleInterop --skipLibCheck

# Stage 2: runtime
FROM node:20-bullseye-slim

WORKDIR /app

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/prisma ./prisma

EXPOSE 7070

CMD ["node", "dist/src/main"]
