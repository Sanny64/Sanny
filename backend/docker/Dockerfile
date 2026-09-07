FROM node:24-alpine

RUN apk update && apk upgrade --no-cache

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY prisma ./prisma
RUN npx prisma generate

COPY redis/certs/ca.crt /app/redis-ca.crt

COPY . .

EXPOSE 3000

CMD ["npx", "tsx", "src/server.ts"]