# Sanny64 backend

This guide builds on the repository [root AGENTS.md](../AGENTS.md). Always read the root guide first; it defines shared instructions, and this file adds backend-specific guidance.

The Sanny64 backend is a Fastify + Prisma application that uses Auth0 services for user management.
It is part of a larger mono repo. Some steps may require investigating different sub-repos. If you can't find a file always check elsewhere first.
Auth0 uses a custom database connection backed by the application's user records. Auth0 database scripts live in `apps/backend/auth0/database-action/`, Login-flow Actions in `apps/backend/auth0/post-login/`, and registration Actions in `apps/backend/auth0/post-user-registration/`. Actions are deployed to Auth0 separately; deploying the backend does not deploy them.

# Credential ownership

Security is the highest priority, right after UX.
Auth0 owns password hashing and verification through the custom database action scripts.
The Fastify backend must not hash, verify, or create passwords; its `User.password` column is
used by the Auth0 scripts and must never be returned by API queries.
The Auth0 custom database runtime uses its supported bcrypt integration. Do not add a second
backend password-hashing path unless the Auth0 scripts are migrated to a protected backend API.

# Agent Guidance

in .agents you can find a series of guides for the use of prisma and auth0.
In case you need more info on external services or frameworks please research.
Always research best practices beforehand.
If a certain configuration is unclear, ask before you assume.

# Workflow

Development Compose explicitly builds image `sanny64-backend:latest`; runtime containers are named `sanny64-backend`. Production keeps its registry image. Do not propagate fixed runtime names or image tags into disposable test projects. Fixed runtime names permit one instance per Docker host. Root `npm run initialize:stack` delegates to backend `initialize:stack` to rebuild buildable images and recreate the full development stack; `npm run restart:backend` applies local naming changes by rebuilding/recreating only the backend service. Both preserve volumes; building alone does not rename an existing container.

Install from the repository root with `npm ci`; do not create a backend lockfile. Build Docker from the repository-root context with `docker build -f apps/backend/docker/Dockerfile .`. `npm run build:backend` builds only. Deploy both Compose files because production inherits common services. Alloy replaces Promtail; preserve the old positions volume during migration as documented in `apps/documentation/docs/general-info/tooling.mdx`.

Once you have implemented functionality make sure it works.
If it's a function use dummy data to verify its functionality
If its an api endpoint, start the backend stack in root using `npm run start:stack` and execute the api call to verify it works.
Always check linting and formating (scripts may be used from root)

# Auth0

Check `apps/backend/auth0/database-action/` and `apps/backend/auth0/post-login/` before reimplementing Auth0-managed behavior. Account linking is coordinated by the Login-flow Action and auth frontend; keep backend user records synchronized only after Auth0 confirms the link. See `apps/backend/README.md` for the current linking flow.

## Authentication API Permissions

// self user
update:me - Update your own user profile
delete:me - Delete your own user profile

// admin only (Authentication API has these permissions too)
read:users - Get a user profile
write:users - Create a new user
update:users - Update a user profile
delete:users - Delete a user profile

## API usage

The browser applications do not obtain Auth0 tokens directly. The backend owns the OAuth flow and requests `offline_access`; browser API requests use the backend's session-backed API.

## Dev vs. Prod separation

Use separate Auth0 tenants when development and production must run concurrently: Actions and Custom Database connection settings are tenant-scoped, and backend environment selection does not isolate tenant configuration. Do not rely on assumptions about Auth0 plan pricing.

Backend runtime code selects environment-specific values using `NODE_ENV` and the `DEV_` or `PROD_` prefixes through the shared configuration helpers. Auth0 Actions are configured separately in Auth0 and must receive their own `NODE_ENV` and matching environment-specific Action secrets. Custom Database connection values are also configured in Auth0; they are not read from `apps/backend/.env`.

## Resource Fetching

Before doing changes always fetch best practice data, preferibly from the documentation pages of the relative tool you are currently implementing (e.g. auth0)

## Agent instructions

In `apps/backend/.agents/skills/` you can find additional instructions on auth0 and prisma.

## Documentation

Backend documentation belongs in `apps/documentation/docs/backend/*`.

## Tests

Backend unit tests live in `src/tests/`; monitoring integration tests live in `monitoring/tests/`. Unit tests cover routes, controllers, services, and utilities, so implementation files are not limited to `src/utils/`.

Run backend ESLint and typechecking from the repository root with `npm run check:backend`, and unit/monitoring/Redis/Discord tests with `npm run test:backend`. Workspace `lint` is ESLint, `typecheck` is TypeScript, `check` composes both, and `test` composes `test:unit`, `test:integration:monitoring`, `test:integration:redis`, and `test:integration:discord`.
Run the real-Redis session integration test directly with `npm run test:integration:redis -w backend`; Docker must be available.
The Redis test runner uses an isolated backend image and Redis service, a fixed test-only password in Compose, fresh one-day test TLS certificates, a health check, and its own internal network/data volume. It never loads `apps/backend/.env`, mounts developer certificates, or inherits runtime Compose services. The runner removes the isolated network, volume, and temporary certificates afterward. The test has a 120-second timeout; no running development stack is required. Initial session-store connections are bounded by `REDIS_CONNECT_TIMEOUT_MS` (default 10000 milliseconds), without changing reconnection after startup.

Backend lint includes hosted Auth0 scripts. Keep their runtime globals and database-script entrypoint exceptions narrowly scoped in root ESLint. The application is launched by Docker, not by a package `main` field. Production image publishing and optional manual VPS deployment are reusable children of `release.yml`; request VPS deployment on `main` with `deploy-backend` enabled.
The root `npm run test` runs `test:ci` once, then live Auth0 and invokes the 429 spike scenario. The spike spec skips unless `RUN_429_SPIKE_E2E=true`; enabling it requires Grafana credentials and may trigger alerts. `test:ci` checks all workspaces/tooling, backend unit/monitoring/Redis/Discord tests, frontend builds/components/mocked browsers, Linux visual baselines, and both docs locales without live credentials. Monitoring rules are derived from production definitions by the test runner, with only timing accelerated; its temporary file is removed after teardown. Live password-user Auth0 E2E runs through one `test:e2e:real` Playwright invocation across Chromium, Firefox, and Edge. The full root gate requires Docker, a reachable development API/Auth0 tenant, dedicated `TESTUSER_EMAIL`/`TESTUSER_PASSWORD` credentials, and browsers installed with `npx playwright install chromium firefox webkit msedge`. Google automation is skipped; Cloudflare may require manual verification.
