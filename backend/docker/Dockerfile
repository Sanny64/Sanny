FROM node:24-alpine AS builder

WORKDIR /app

COPY package*.json ./
RUN npm install

COPY prisma ./prisma
RUN npx prisma generate

COPY . .

FROM dhi.io/node:24-debian12

WORKDIR /app

# Copy files as non-root (1001)
COPY --from=builder --chown=1001:1001 /app /app

EXPOSE 3000

USER 1001

CMD ["node", "dist/server.js"]
