# Sanny64 monorepo

Sanny64 is an npm-workspaces monorepo containing two React/Vite frontends, a Fastify backend, shared frontend packages, Docusaurus documentation, end-to-end tests, and repository tooling.

## Project Vision

Sanny64 aims to be an accessible, personal digital space for a portfolio, projects, games, writing, and event resources. Experiences should be mobile-first and user-centered, with intuitive navigation, purposeful micro-interactions, dark and light themes, and English and German support. Authentication should protect only the actions or content that require it, with role-based permissions; users should be able to personalize language and appearance. Keep the platform modular and resource-conscious, with clear boundaries between product areas and backend services.

## Repository layout

- `apps/frontend/auth/` authentication frontend
- `apps/frontend/sanny/` public website frontend
- `apps/backend/` Fastify, Prisma, Auth0, Redis, and Compose backend application
- `apps/documentation/` English and German Docusaurus site
- `shared/packages/` source-exported `@sanny/i18n`, `@sanny/styles`, and `@sanny/ui`
- `shared/tests/` Playwright suites and repository configuration contracts
- `tooling/config/` canonical Node version pin
- `tooling/scripts/{runtime,release,test}/` repository runtime checks, release planning, and test orchestration; workspace-specific scripts remain with their apps

## Setup

Use Node.js 24 and npm 11.6.3. Install from the repository root:

```sh
npm ci
```

Run applications with:

```sh
npm run dev:auth
npm run dev:sanny
npm run dev:docs
npm run start:stack
```

Run `npm run check` before manual builds. The test commands have predictable tiers: `npm run test:unit`, `test:contracts`, `test:integration`, and `test:browser` run focused groups; `npm run test:core` composes the safe local suite, while `npm run test:ci` runs it non-interactively. `npm run test` opens the development/production and safe/full menu; full mode requires confirmation before live Auth0, Discord, and 429 traffic.

## Outlook

Upcoming work focuses on completing public website content, authentication acceptance, and accessibility and documentation readiness. Before production promotion, provision isolated staging and production environments and verify deployment, monitoring, rollback, and restore procedures. See the [product and release roadmap](TODO.md#product-and-release-roadmap) for current milestones and release gates.

## Configuration ownership

Root `tsconfig.json`, `eslint.config.js`, `prettier.config.ts`, and `playwright.config.ts` own repository-level defaults. Shared frontend compiler, Vite, and Vitest configs live under `apps/frontend/`; workspaces extend them and define local source boundaries or test environments.

See [`apps/documentation/docs/general-info/tooling.mdx`](https://docs.sanny64.de/docs/general-info/tooling.mdx) for detailed ownership and migration rules.
