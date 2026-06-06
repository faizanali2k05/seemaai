# ── Build stage ──
FROM node:22-alpine AS builder

RUN apk add --no-cache openssl

WORKDIR /app

COPY package.json ./

RUN npm install

COPY prisma/ ./prisma/
RUN npx prisma generate

COPY tsconfig.json ./
COPY src/ ./src/

RUN npx tsc

# ── Production stage ──
FROM node:22-alpine

RUN apk add --no-cache openssl

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY prisma/ ./prisma/
RUN npx prisma generate

COPY --from=builder /app/dist ./dist

EXPOSE 4000

CMD ["node", "dist/app.js"]
