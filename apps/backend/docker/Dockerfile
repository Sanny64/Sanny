FROM dhi.io/node:24-debian12-dev@sha256:e0f4824c665674c76cc7d8d212bc6dfd7a9ec21d005fbc0c6104bf64acc86e31 AS builder

USER root

WORKDIR /app

COPY package.json package-lock.json ./
COPY tsconfig.json ./tsconfig.json
COPY apps/backend/package.json ./apps/backend/package.json
COPY apps/frontend/auth/package.json ./apps/frontend/auth/package.json
COPY apps/frontend/sanny/package.json ./apps/frontend/sanny/package.json
COPY apps/documentation/package.json ./apps/documentation/package.json
COPY shared/packages/i18n/package.json ./shared/packages/i18n/package.json
COPY shared/packages/styles/package.json ./shared/packages/styles/package.json
COPY shared/packages/ui/package.json ./shared/packages/ui/package.json
RUN npm ci --workspace=backend --include-workspace-root=false --ignore-scripts

WORKDIR /app/backend
COPY apps/backend/prisma ./prisma
RUN npx prisma generate

COPY apps/backend .
WORKDIR /app
RUN npm prune --workspace=backend --include-workspace-root=false --omit=dev --ignore-scripts
RUN mkdir -p /app/logs
WORKDIR /app/backend

FROM builder AS production

RUN rm -rf /app/backend/src/tests

FROM dhi.io/node:24-debian12@sha256:7f480846df997cc986a0accdd55cd2649548fdbd9545b4dd778bba4524262286 AS runtime

WORKDIR /app/backend

COPY --from=production --chown=1001:1001 /app/node_modules /app/node_modules
COPY --from=production --chown=1001:1001 /app/tsconfig.json /app/tsconfig.json
COPY --from=production --chown=1001:1001 /app/backend /app/backend
COPY --from=production --chown=1001:1001 /app/logs /app/logs

EXPOSE 3000

USER 1001

CMD ["node", "--import=tsx", "src/server.ts"]
