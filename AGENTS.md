# Sanny64 monorepo

Personal website and authentication workspace built with npm workspaces, TypeScript, React 19, Vite, and a Fastify backend.
Always keep AGENTS.md in sync with the README.md if you do changes on architecture level. Throughout the repository you will find additional AGENT.md files.
Read them if you change things in the relative areas. Keep them in sync with one another.

The main goal in all aspects of this project is the compromiss of highest security with highest User Experience comfort. Always consider these aspects when making changes.
After those two main concerns comes the maintainability and developer-friendliness. Those things are also always to consider.

NEVER READ .env or .env.* files. You may use .env.template or .env.*.template files.

## Development Environment

- Install dependencies at the repo root with `npm ci`.
- Node.js 24 is what CI uses; match that when possible.
- Run the public site in dev mode with `npm run dev:sanny`.
- Run the auth app in dev mode with `npm run dev:auth`.
- Root `lint`, `typecheck`, and `check` delegate to matching workspace scripts plus root tooling. There is no aggregate `build`; use the defined app/image wrappers.
- `build:auth` and `build:sanny` produce app output only. Run `npm run check` before manual builds. CI runs all static checks once before builds; shared packages have no build step. TypeScript, Vite, common development types, and YAML tooling are root-owned.
- Formatting scripts are `npm run format:check` and `npm run format`; `.editorconfig` is the shared whitespace and line-ending policy read by editors and Prettier, and `.prettierignore` owns formatting exclusions.
- `npm run test` times `test:ci` (formatting, all static checks, contracts, backend unit/monitoring/Redis, app builds, components, mocked browsers, and a docs build for both locales) plus one live Auth0 Playwright invocation across Chromium, Firefox, and Edge. Live E2E requires a reachable development API/Auth0 tenant, dedicated test credentials, and installed browsers. Docker is required for monitoring and Redis integration.
- Targeted lint commands include `npm run lint:backend`, `npm run lint:auth`, `npm run lint:sanny`, `npm run lint:docs`, `npm run lint:shared` and package-scoped shared lint scripts.
- `lint` always runs ESLint, `typecheck` always runs TypeScript, and workspace `check` composes both. Root `typecheck:*` and `check:*` wrappers use the same suffixes as `lint:*`. Workspace `test` scripts run actual test runners, never static-check aliases.
- The backend uses the root workspace install and lockfile. Run with `npm run start:backend`; `npm run build:backend` builds its image without starting services.

## Code Style Guidelines

- Keep the code as lean, efficient and as recomprehensible as possible.
- Always priotize shared level fixes over redudant frontend repo changes.
- Follow the existing TypeScript and React patterns in each folder; do not introduce a new style system or formatter assumption.
- Keep changes small and local. Avoid broad refactors unless the task explicitly needs them.
- Use the workspace package names `@sanny/i18n`, `@sanny/styles`, and `@sanny/ui` instead of deep relative imports across packages.
- Do not import from generated `dist/` output when the source package entrypoint is available.
- Preserve the current provider order in frontend `src/main.tsx` files unless a change requires otherwise.
- Frontend code assumes strict TypeScript settings and Vite ESM modules; avoid CommonJS patterns.
- Shared packages resolve through workspace exports, not aliases or generated output. Run `npm run typecheck:shared` after shared changes.
- Always run `npm run format:check` and if needed `npm run format` on your code changes.
- Do not edit generated folders such as `dist/` or installed dependencies such as `node_modules/`.
- Use accessibility-compliance skill as your single source of truth.

## Project Context

- `auth/` is the auth-focused React/Vite app.
- `sanny/` is the public site React/Vite app.
- `shared/packages/i18n/` owns language context, cookie/localStorage persistence, and translation exports.
- `shared/packages/styles/` owns semantic light/dark design tokens, bundled Manrope typography, layout CSS, theme persistence, and the reduced-motion-aware Framer Motion configuration.
- `shared/packages/ui/` owns reusable UI components and `AppShell`, the branded, accessible frame with route-entry motion used by Sanny and Auth. Keep appearance fixes here or in styles rather than duplicating them in apps.
- `backend/` is a Fastify workspace using the root lockfile and repository-root Docker build context.
- `backend/monitoring/` provisions Prometheus metrics and Grafana alerts; Alloy ships redacted logs to Loki. Keep `/metrics` and exporters internal. Preserve legacy `promtail-data` during offset migration.
- `vite.shared.ts` owns shared React/HTTPS plugins and the HTML theme bootstrap. Preserve cookie/localStorage/system precedence and fallback colors aligned with shared style tokens.
- Neutral, browser, and Node compiler defaults live in `tsconfig.base.json`, `tsconfig.frontend.base.json`, and `tsconfig.node.base.json`; `tsconfig.tooling.json` owns root configs and E2E files.
- `eslint.config.js` is the single discovered lint policy. `.editorconfig` is the shared whitespace and line-ending policy for editors and Prettier; `.prettierignore` owns formatting exclusions. Run `npm run check:tooling` for tooling lint/types and `npm run test:tooling` for configuration contract tests.
- `.github/workflows/` contains deployment workflows for `auth`, `sanny`, docs, test frontends, and `backend`.
- See the Deployment section below for branch behavior, workflow triggers, destinations, and hosting configuration.
- `README.md` is high-level product documentation, but the package scripts and workflows are the source of truth for agent execution.

## Testing Instructions

- Backend aggregate verification (2026-10-19, Node 24): `npm run test:backend` passed unit tests, monitoring integration (2 tests), and isolated Redis integration (7 tests). Redis uses the test-only Compose environment without `backend/.env`.
- Latest CI verification (2026-10-19, Node 24.22.0): `npm run test:ci` passed in 14:02 after script reconciliation, including 18 contracts, backend unit/monitoring checks, app/component checks, 644 mocked browser tests (10 intentional skips), and English/German docs builds. Real Redis passed in the preceding full attempt. Live Auth0 remains failing as recorded below; CI success is not full-gate or hosted sign-off.

- Latest full attempt (2026-10-19, Node 24.22.0): `npm run test` exited 1 after 15:19. CI/static checks, monitoring, frontend tests/builds, docs builds, and real Redis passed; a concurrently removed `test:integration` alias stopped the final stage. The script graph was repaired and 18 configuration contracts passed. Separate live Chromium, Firefox, and Edge attempts reached Auth0 but failed with `invalid_authentication_state`; Google was intentionally skipped. The full gate is not green; do not weaken state validation or classify this as staging sign-off.
- Run the root test gate with `npm run test`. It requires Docker, installed Playwright browsers for Chromium, Firefox, and Edge, a reachable development Auth0/backend setup, and dedicated `TESTUSER_EMAIL`/`TESTUSER_PASSWORD` credentials. It takes about 15 minutes to complete (18.10.2026). Always document the latest run here and in the [documentation](./documentation/docs/frontend/local-testing/automated-testing.mdx), [documentation](./documentation/docs/backend/local-testing/automated-testing.mdx).
- Run the frontend lint/build/component and mocked browser gate with `npm run test:frontend`; app-specific static checks are `npm run check -w auth` and `npm run check -w sanny`. Neither app exposes a fake test script for lint.
- Run frontend accessibility suites with `npm run test:frontend:accessibility`, or individually with `npm run test:frontend:accessibility:shared`, `npm run test:frontend:accessibility:auth`, and `npm run test:frontend:accessibility:sanny`.
- Run backend static checks with `npm run check:backend`; `npm run test:backend` runs unit, monitoring, and real-Redis integration tests. Backend integration script names use `test:integration:<suite>`.
- `npm run test:integration:redis -w backend` runs the Redis case directly. It starts its own image and Redis service with a health check, a fixed Compose-local test password, an internal network and isolated volume, a 120-second test timeout, and automatic cleanup. It does not load the developer `.env` or require a running development stack.
- Run live Auth0 system integration with `npm run test:e2e:real`; it runs the configured Chromium, Firefox, and Edge projects in one Playwright invocation. `npm run test:e2e` is the convenience command for mocked frontend and live integration browser suites. Google automation is explicitly skipped because Google may block controlled browsers; keep manual Google verification separate.
- For frontend verification, run `npm run check -w auth -w sanny -w @sanny/i18n -w @sanny/styles -w @sanny/ui` before app builds. App `tsconfig.json` files own browser source; `tsconfig.tooling.json` owns both app Vite configs and the UI Vitest config. Do not recreate the removed app/node tsconfig wrappers.
- Lint shared packages with `npm run lint -w @sanny/i18n`, `npm run lint -w @sanny/styles`, and `npm run lint -w @sanny/ui`.
- Backend unit tests are in `backend/src/tests`; mocked frontend Playwright tests are in `e2e/mock`; live cross-system integration tests are in `e2e/real`.
- Default Playwright config selects mocked tests only; live runs require `playwright.real.config.ts`. CI cannot reuse existing servers; live auth artifacts remain disabled.
- Both CI and full gates include tooling/docs typechecks and docs builds. See `documentation/docs/general-info/workspace-tooling.mdx` for ownership changes, migration, and the operator-controlled Alloy rollout.
- If you add tests, wire them into the relevant package script and keep `npm run test` as the top-level quality gate.

## Workflow / Security

- Keep secrets out of the repository. Deployment workflows use GitHub Actions secrets such as `FTP_SERVER`, `FTP_USERNAME`, `FTP_PASSWORD`, `VPS_HOST`, `VPS_USERNAME`, and `VPS_SSH_KEY`.
- Do not hardcode environment-specific values into source files when a workflow secret or runtime config should be used.
- Changes to package names, workspace paths, or build output locations must be mirrored in the root scripts and the matching workflow file under `.github/workflows/`.
- The main branch triggers deploy workflows, so keep the relevant build and lint scripts green before merging.
- Avoid editing workflow files unless the related package or deploy path changes.

## Deployment

- The documented release convention is `dev -> test -> main`; it is not enforced by GitHub Actions. Promote and verify a release on `test` before creating the release commit on `main`. See [the deployment guide](documentation/docs/general-info/deployment.mdx) for the full release flow.
- Every push to `test` deploys Sanny, Auth, and docs to `/public_html/testing/`, `/public_html/testing/auth/`, and `/public_html/testing/docs/`. Manual workflow runs are restricted to `test`. These workflows deploy frontends and docs only, not the backend. The three test uploads use separate FTP sync-state files and are served from the subdomain root (`/`).
- Production workflows run on `main` with path filters: docs for `documentation/**`, `shared/packages/**`, and root `package.json`/`package-lock.json`; Auth for `auth/**`, `shared/packages/**`, and those root files; Sanny for `sanny/**`, `shared/packages/**`, and those root files. They upload to `/public_html/docs/`, `/public_html/auth/`, and `/public_html/sanny/`, respectively.
- Backend changes on `main` publish the same `latest` and commit-SHA image tags to GHCR and Docker Hub. VPS deployment is a separate manual `workflow_dispatch` from `main`, which deploys that commit-SHA image; manual runs from other branches do not deploy.
- Set the GitHub Actions repository variable `VITE_DEV_API_URL` for test and `VITE_PROD_API_URL` for production. Each deployment maps its value to the canonical `VITE_API_URL` build input. Browser code uses only `VITE_API_URL`; shared Vite configuration resolves legacy local inputs by mode and validates HTTPS origins. The test API URL must be reachable by site visitors.
- All deployments depend on the shared secret-free `verify.yml` workflow used for PRs. It runs `test:ci`: format, static checks, contracts, backend unit/monitoring/Redis, app builds, components, mocked browsers, and docs builds. `npm run test` adds live Auth0 checks without repeating earlier stages. Mocked browsers run in one Playwright invocation with two workers. FTPS uses strict certificate verification and all action references are SHA-pinned. Protected-branch rules remain operator-configured.
- Test Basic Auth uses `TEST_BASIC_AUTH_ENTRY` with one or more newline-separated `username:hashed-password` lines and no blank lines. `TEST_BASIC_AUTH_FILE_PATH` must be the absolute server path to the shared `.htpasswd`, not its FTP path. The workflow generates and uploads that file with Sanny. Hosting DNS, TLS, document roots, and any extra domain aliases are configured by the hosting provider; keep `README.md` and the deployment guide aligned with these settings.
- Find more info on deployment in the [documentation](./documentation/docs/general-info/deployment.mdx)

## Agents Instructions

- On certain topics you might want to consolidate agent skills (See the respective `skills-lock.json` files in root and each mono-repo).
- You can find them both in the root under `.agents/skills/` for accessiblity skills and in `backend/.agents/skills/` for auth0 and prisma instructions.

## Constraints

- If at some point you are missing crucial information to complete a task research it. At first in the documentation repo and then in the internet.
- Never read .env or .env.local files. Exclude them from your searches. Accidents are not tolerated. You may use .env.template and .env.local.template files.
- Always add tests to new implementations or change old tests only if you adjusted relative code.
- Every breaking change you implement must be documented in the `documentation/docs/` repository.
- Never consider a task implementation complete until the documenation entry and `npm run format:check` hasn't completed successfully.
