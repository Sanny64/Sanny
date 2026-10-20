# Sanny64 monorepo

Personal website and authentication workspace built with npm workspaces, React, TypeScript, Vite, and Fastify. Keep the README's architecture summary aligned when architecture changes; read any applicable child `AGENTS.md` before editing that area.

Prioritize security and user experience, followed by maintainability. Never read `.env` or `.env.*` files; templates are allowed. Keep user changes, secrets, and environment-specific values safe. Do not use destructive Git operations or revert unrelated changes.

Use source code, root/workspace `package.json` scripts, and deployment workflows as the implementation truth. The documentation explains workflows and operator responsibilities; provider-side configuration cannot be inferred from repository files.

## Development

Use Node.js 24 and npm 11.6.3. Install from the repository root with `npm ci`; do not create workspace lockfiles or install dependencies from individual workspaces. Start apps with the root `dev:*` scripts. Before manual builds, run `npm run check`; use `npm run format:check` for formatting.

Use `npm run test:ci` for the local CI gate. `npm run test` adds live Auth0 and invokes the opt-in 429 spike scenario, which skips unless `RUN_429_SPIKE_E2E=true`; enabling it also requires Grafana credentials and may trigger alerts. The full gate needs Docker, browsers, a reachable development API/tenant, and dedicated test credentials. See `documentation/docs/general-info/setup.mdx` and `documentation/docs/general-info/testing.mdx` for commands and prerequisites.

## Code Rules

- Keep changes focused and follow local TypeScript/React conventions. Prefer shared-package fixes when behavior is shared.
- Import shared packages through `@sanny/i18n`, `@sanny/styles`, and `@sanny/ui` exports; do not depend on generated `dist/` output.
- Preserve frontend provider order unless the task requires changing it. Keep strict TypeScript and Vite ESM patterns.
- Do not edit generated output or installed dependencies. For frontend accessibility work, use the accessibility-compliance skill.

## Workspace Map

- `sanny/` and `auth/`: public and authentication frontends.
- `backend/`: Fastify API, Prisma, Auth0 source scripts, Compose, and monitoring. Keep `/metrics` and exporters private; read backend guidance before infrastructure or Auth0 changes.
- `shared/packages/`: shared localization, theme/styles, and UI. `tooling/`, `tests/`, and `scripts/` own common configuration, checks, and automation.
- `documentation/`: English/German developer docs. `games/`: standalone projects.

Root scripts and `.github/workflows/` define runnable checks and deployment behavior. Read `documentation/docs/general-info/tooling.mdx` or the deployment guide instead of duplicating their operational details here.

## Verification And Documentation

Run the narrowest relevant workspace check and test, then `npm run format:check`. Wire new tests into the owning package script; do not replace actual test commands with lint/typecheck aliases. Record full-gate results in `documentation/docs/general-info/testing.mdx`.

Document breaking changes in English and German, then refresh reviewed-source hashes with `npm run docs:translation:review -- <docs-relative-path>`. See the testing, setup, tooling, and deployment guides for detailed procedures.

## Security And Releases

Keep secrets and environment-specific values out of source. Do not change deployment workflows unless the related package or release path changes. Workflow triggers do not configure GitHub branch protection or provider-side services. Follow `documentation/docs/general-info/deployment.mdx` for release steps and operator-owned settings.

## Specialized Guidance

Consult the relevant `.agents/skills/` instructions for accessibility, Auth0, and Prisma work. When repository evidence is insufficient, check the maintained docs first and then authoritative external documentation; never assume provider-side settings.
