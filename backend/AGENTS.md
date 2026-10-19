# Sanny64 backend

This guide builds on the repository [root AGENTS.md](../AGENTS.md). Always read the root guide first; it defines shared instructions, and this file adds backend-specific guidance.

The Sanny64 backend is a Fastify + Prisma application that uses Auth0 services for user management.
It is part of a larger mono repo. Some steps may require investigating different sub-repos. If you can't find a file always check elsewhere first.
Auth0 uses a custom database connection backed by the application's user records. Auth0 database scripts live in `backend/auth0/database-action/`, Login-flow Actions in `backend/auth0/post-login/`, and registration Actions in `backend/auth0/post-user-registration/`. Actions are deployed to Auth0 separately; deploying the backend does not deploy them.

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

Install from the repository root with `npm ci`; do not create a backend lockfile. Build Docker from the repository-root context with `docker build -f backend/docker/Dockerfile .`. `npm run build:backend` builds only. Deploy both Compose files because production inherits common services. Alloy replaces Promtail; preserve the old positions volume during migration as documented in `documentation/docs/general-info/workspace-tooling.mdx`.

Once you have implemented functionality make sure it works.
If it's a function use dummy data to verify its functionality
If its an api endpoint, start the backend in root using `npm run start:backend` and execute the api call to verify it works.
Always check linting and formating (scripts may be used from root)

# Auth0

Check `backend/auth0/database-action/` and `backend/auth0/post-login/` before reimplementing Auth0-managed behavior. Account linking is coordinated by the Login-flow Action and auth frontend; keep backend user records synchronized only after Auth0 confirms the link. See `backend/README.md` for the current linking flow.

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

Request offline_access; use getAccessTokenSilently() for every token sensitive API request.

## Dev vs. Prod separation

Since creating a development only tenant for auth0 is not possible without paying the dev vs. prod seperation must be enforced here.
All scripts that are dev vs prod sensetive must use `NODE_ENV = "development" | "production"` from `backend/.env` to enforce separation.
All dev vs. prod sensitive .env variables should have DEV_variable_name and PROD_variable_name. All scripts using them must check for NODE_ENV and switch them accordingly.

## Resource Fetching

Before doing changes always fetch best practice data, preferibly from the documentation pages of the relative tool you are currently implementing (e.g. auth0)

## Agent instructions

In `backend/.agents/skills/` you can find additional instructions on auth0 and prisma.

## Documentation

Backend documentation belongs in `documentation/docs/backend/*`.

## Tests

Backend unit tests live in `src/tests/`; monitoring integration tests live in `monitoring/tests/`. Unit tests cover routes, controllers, services, and utilities, so implementation files are not limited to `src/utils/`.

Run backend ESLint and typechecking from the repository root with `npm run check:backend`, and unit/monitoring/Redis tests with `npm run test:backend`. Workspace `lint` is ESLint, `typecheck` is TypeScript, `check` composes both, and `test` composes `test:unit`, `test:integration:monitoring`, and `test:integration:redis`.
Run the real-Redis session integration test directly with `npm run test:integration:redis -w backend`; Docker must be available.
The Redis test runner uses an isolated backend image and Redis service, a fixed test-only password in Compose, a health check, and its own internal network/data volume. It never loads `backend/.env` or inherits the runtime Compose services. The runner removes the isolated network and volume afterward. The test has a 120-second timeout; no running development stack is required. Initial session-store connections are bounded by `REDIS_CONNECT_TIMEOUT_MS` (default 10000 milliseconds), without changing reconnection after startup.
The root `npm run test` runs `test:ci` once, then live integration. `test:ci` checks all workspaces/tooling, backend unit/monitoring/Redis tests, frontend builds/components/mocked browsers, and one docs build for both locales without live credentials. Monitoring rules are derived from production definitions by the test runner, with only timing accelerated; its temporary file is removed after teardown. Live password-user Auth0 E2E runs through one `test:e2e:real` Playwright invocation across Chromium, Firefox, and Edge. The full root gate requires Docker, a reachable development API/Auth0 tenant, dedicated `TESTUSER_EMAIL`/`TESTUSER_PASSWORD` credentials, and browsers installed with `npx playwright install chromium firefox msedge`. Google automation is skipped; Cloudflare may require manual verification.
