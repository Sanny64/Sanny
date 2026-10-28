# Sanny64 monorepo

Personal website and authentication workspace using npm workspaces, React, TypeScript, Vite, Fastify, Prisma, and Docker.

## Layout

- `apps/frontend/auth` and `apps/frontend/sanny` contain the frontend applications.
- `apps/frontend/tests` contains cross-app frontend source contracts; shared browser/Vite/Vitest configs live at `apps/frontend/`.
- `apps/backend` contains the backend, Auth0 scripts, Prisma, Redis, monitoring, and Compose files.
- `apps/documentation` contains Docusaurus sources and translations.
- `shared/packages` contains source-exported shared frontend packages.
- `shared/tests` owns Playwright suites and repository/tooling contracts.
- `apps/frontend/tsconfig.frontend.json` is the shared browser compiler base; root `tsconfig.json` owns neutral/tooling defaults. `tooling/config/.nvmrc` pins Node.js 24.
- `tooling/scripts/{runtime,release,test}` owns repository-wide automation. Workspace-specific scripts stay with their app; test support stays under `shared/tests`.

## Rules

Use Node.js 24 and npm 11.6.3 from the repository root. Do not read `.env` files, edit generated output, create workspace lockfiles, or use destructive Git operations. Read the nearest `AGENTS.md` before editing a workspace.

Use `npm run check` for formatting-independent static checks, `npm run test:ci` for the CI gate, and `npm run test` only after the CI gate passes. Keep Playwright and Vitest tests separate: browser workflows remain in `shared/tests/e2e`, while fast workspace tests stay with their source packages.

Root configuration files are authoritative. Workspace configurations extend them and only add local paths, overrides, or test setup.

`npm run test` needs a TTY, which agent shells lack. To run the full development suite non-interactively, call the menu with preset answers. This is the same code path as the menu (`createFullTestEnvironment`, allowlisted `.env` values, `run-suites.mjs`). Run it from the repository root in PowerShell, only after the user approved a full run, because it uses live Auth0 and sends Discord messages and 429 traffic to the development stack. Expect about 22 minutes, so use an async shell with a long wait:

```powershell
$env:npm_execpath = Join-Path (Split-Path (Get-Command node).Source) 'node_modules/npm/bin/npm-cli.js'
@'
import { runTestMenu } from './tooling/scripts/test/menu.mjs';
const answers = ['full', 'development'];
await runTestMenu(process.env.npm_execpath, {
  selectOption: async () => answers.shift(),
  confirmRun: async () => true,
});
'@ | node --input-type=module - *> "$env:TEMP\full-dev.log"
```

Use `'full', 'production'` only when the user explicitly asks for a production run. It never reads `PROD_DISCORD_WEBHOOK` and skips the Discord checks. The target is the API URL; `NODE_ENV` stays `development` for the in-process tests. Do not read `.env` while debugging; the log contains no secrets. Individual live stages run with `node tooling/scripts/test/run-suites.mjs --live-only | --monitoring-only | --e2e-only`; `--monitoring-only` with `RUN_DISCORD_INTEGRATION=true` runs the Discord routing check against the local stack, and `RUN_EMAIL_INTEGRATION=true` sends the single email test (the local policy `policies.dev.yml` never emails; only production `policies.yml` routes critical alerts to email). If the dev containers fail to start with mount errors, recreate them with `npm run initialize:stack`.

After each `npm run test` run update the latest run log in `general-info/testing.mdx/#latest-full-run`; it must only contain at maximum one entry and must be updated for both English and German translations.

Document structural changes in both English and German documentation, then refresh reviewed source hashes with:

```sh
npm run review:docs -- <path-relative-to-apps/documentation/docs>
```
