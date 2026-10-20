FROM dhi.io/node:24-debian12-dev@sha256:e0f4824c665674c76cc7d8d212bc6dfd7a9ec21d005fbc0c6104bf64acc86e31 AS builder

USER root

WORKDIR /app

COPY package.json package-lock.json ./
COPY tooling/config/tsconfig.base.json ./tooling/config/tsconfig.base.json
COPY backend/package.json ./backend/package.json
COPY auth/package.json ./auth/package.json
COPY sanny/package.json ./sanny/package.json
COPY documentation/package.json ./documentation/package.json
COPY shared/packages/i18n/package.json ./shared/packages/i18n/package.json
COPY shared/packages/styles/package.json ./shared/packages/styles/package.json
COPY shared/packages/ui/package.json ./shared/packages/ui/package.json
RUN npm ci --workspace=backend --include-workspace-root=false --ignore-scripts

WORKDIR /app/backend
COPY backend/prisma ./prisma
RUN npx prisma generate

COPY backend .
WORKDIR /app
RUN npm prune --workspace=backend --include-workspace-root=false --omit=dev --ignore-scripts
RUN mkdir -p /app/logs

FROM dhi.io/node:24-debian12@sha256:7f480846df997cc986a0accdd55cd2649548fdbd9545b4dd778bba4524262286

WORKDIR /app/backend

COPY --from=builder --chown=1001:1001 /app/node_modules /app/node_modules
COPY --from=builder --chown=1001:1001 /app/tooling/config/tsconfig.base.json /app/tooling/config/tsconfig.base.json
COPY --from=builder --chown=1001:1001 /app/backend /app/backend
COPY --from=builder --chown=1001:1001 /app/logs /app/logs

EXPOSE 3000

USER 1001

CMD ["node", "--import=tsx", "src/server.ts"]
