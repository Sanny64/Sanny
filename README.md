<h2 align="center">
  Sanny's Website<br/>
  <a href="https://sanny64.de" target="_blank">Sanny64.de</a>
</h2>
<center>

![Static Badge](https://img.shields.io/badge/BUILT_WITH-REACT-blue?style=for-the-badge&logo=react&logoSize=auto)
![Static Badge](https://img.shields.io/badge/USING-VITE-purple?style=for-the-badge&logo=vite&logoSize=auto)
![Static Badge](https://img.shields.io/badge/AND-TYPESCRIPT-blue?style=for-the-badge&logo=typescript&logoSize=auto)
![Static Badge](https://img.shields.io/badge/HOSTED_ON-HETZNER-red?style=for-the-badge&logo=hetzner&logoSize=auto)

</center>
Hey there, Sanny here. This repository contains my public website, authentication helper, backend, shared frontend packages, standalone games, and developer documentation.

## Content

- [Getting Started](#getting-started)
- [Documentation](#documentation)
- [Project Direction](#project-direction)
- [Tech-Stack](#tech-stack)
- [Features](#features)
- [Auth & Roles](#auth--roles)
- [Pages](#pages)

## Getting Started

Clone this repository. You will need node.js and git installed.

### Installation and Setup Instructions

Use Node.js 24 and npm 11. Install every workspace, including the backend, from the repository root with `npm ci`; the root lockfile is authoritative.

In the project directory, run one of the workspace scripts:

- npm run dev:sanny
- npm run dev:auth
- npm run dev:docs

For quality checks, use scripts defined by the root `package.json`. Shared packages export source without library build artifacts. TypeScript, Vite, and common development types are root-owned; package configs define source boundaries, and root tooling owns Vite/Vitest/Playwright configs. Builds produce output only: run `npm run check` before building manually. `npm run test:tooling` checks configuration contracts. See the [workspace tooling and migration guide](documentation/docs/general-info/workspace-tooling.mdx) for migration details.

- `npm run format:check`
- `npm run test`
- `npm run lint:backend`, `npm run lint:auth`, `npm run lint:sanny`, and `npm run lint:docs`
- `npm run lint`, `npm run typecheck`, and `npm run check` run the corresponding base script in every workspace plus root tooling. `lint` is always ESLint; `typecheck` is always TypeScript; `check` composes both. Targeted `typecheck:*` and `check:*` wrappers use the same suffixes as `lint:*`.
- Shared-package lint: `npm run lint -w @sanny/i18n`, `npm run lint -w @sanny/styles`, and `npm run lint -w @sanny/ui`
- `npm run build:auth`, `npm run build:sanny`, and `npm run build:docs`

`npm run test:ci` runs formatting, all workspace/tooling static checks, config contracts, backend unit/monitoring/Redis tests, app builds, components, mocked browsers, and a docs build for both locales without live authentication credentials. `npm run test` adds live password-user Auth0 tests and reports the full elapsed duration. Mocked and live Playwright suites each run once across Chromium, Firefox, and Edge. Install Playwright browsers with `npx playwright install chromium firefox msedge` and use dedicated test credentials for live authentication. Google automation is intentionally skipped, and Cloudflare may require manual password-login verification. The gates require Docker; the full gate additionally requires a reachable development API/Auth0 setup. See the [backend automated testing guide](documentation/docs/backend/local-testing/automated-testing.mdx) and [frontend automated testing guide](documentation/docs/frontend/local-testing/automated-testing.mdx).

Run each app you need in its own terminal. Sanny is served at `https://localhost:5173`, Auth at `https://localhost:5174`, and the English docs at `http://localhost:3000` (`npm run dev:docs-de` serves German docs at port `3001`). Frontend development servers use a local HTTPS certificate and reload when source changes.

`npm run test:integration:redis -w backend` starts a disposable Compose project
with a backend test image and Redis using a fixed test-only password plus the
repository TLS certificates. Its Docker network is internal, and it does not load
`backend/.env` or use the running backend stack. It waits for Redis health, uses a
separate data volume, limits the test run to 120 seconds, and removes its
containers and volume afterward.

### Branches and Releases

This project uses three long-lived branches: `dev -> test -> main`.

| Branch | Purpose                                                              | Deploys to                    |
| ------ | -------------------------------------------------------------------- | ----------------------------- |
| `dev`  | Daily development. No sites or images are deployed from here.        | None                          |
| `test` | Release candidate. Verified on the web before going to production.   | Test environment (Basic Auth) |
| `main` | Production only. Exactly one commit per release, tagged for version. | Production                    |

A release is created by building one new commit on `main` from the file tree of `test` (no merge, no squash-merge), then tagging it as `release-1.0.0.x`. This keeps `main` clean and conflict-free while `dev` and `test` keep their full history. The complete flow with all commands is described in the [deployment documentation](documentation/docs/general-info/deployment.mdx).

### Deployment

Every push to `test` runs the test frontend workflow; manual test runs are restricted to that branch. Docs deploy from `main` when `documentation/**`, `shared/packages/**`, `package.json`, or `package-lock.json` changes. Sanny and Auth deploy from `main` when their configured app, shared-package, or root package files change. Backend changes under `backend/` or to its workflow trigger checks and publish one image to GHCR and Docker Hub; a manual run from `main` deploys its exact Docker Hub commit-SHA image to the VPS. All sites are built for the subdomain root (`/`).

Configure the GitHub Actions repository variable `VITE_DEV_API_URL` for the test backend and `VITE_PROD_API_URL` for production. Both deployments pass their respective value as `VITE_API_URL`, the only API setting consumed by browser code. Locally, shared Vite configuration resolves that value from `VITE_DEV_API_URL` for development/test mode and `VITE_PROD_API_URL` for production mode; an explicit `VITE_API_URL` takes precedence. Existing local environment files need not be renamed and are not available on GitHub runners. Builds require an HTTPS origin without credentials, paths, queries, or fragments. The test URL must be reachable by visitors; `localhost` points to each visitor's own device.

Every deployment depends on the same secret-free `verify.yml` gate used for pull requests. Actions are pinned to commit SHAs, checkout does not persist credentials, and FTPS requires trusted hostname-matching certificates. Fix the hosting certificate or FTP hostname instead of disabling verification. Configure a GitHub ruleset to require the verification check and review for protected branches; workflow files alone do not enforce branch protection.

Configure these HTTPS subdomains in your prefered web hosting service provider (e.g. Hetzner) with the corresponding document roots (FTP-visible paths):

| Branch | Domain                 | FTP directory                |
| ------ | ---------------------- | ---------------------------- |
| `main` | `sanny64.de`           | see production workflow      |
| `main` | `auth.sanny64.de`      | `/public_html/auth/`         |
| `main` | `docs.sanny64.de`      | `/public_html/docs/`         |
| `test` | `test.sanny64.de`      | `/public_html/testing/`      |
| `test` | `test.auth.sanny64.de` | `/public_html/testing/auth/` |
| `test` | `test.docs.sanny64.de` | `/public_html/testing/docs/` |

The test workflow uses fixed destinations: `/public_html/testing/`, `/public_html/testing/auth/`, and `/public_html/testing/docs/`. Auth and docs are nested directories on disk but are served at `/` on their own subdomains. Each test upload uses a site-specific FTP sync-state file. DNS, TLS certificates, and subdomain document roots must be configured in the hosting control panel; FTP deployment does not create them.

Both workflows use `FTP_SERVER`, `FTP_USERNAME`, and `FTP_PASSWORD` secrets. Test sites also require `TEST_BASIC_AUTH_ENTRY` containing one or more newline-separated `username:hashed-password` lines (no blank lines), and `TEST_BASIC_AUTH_FILE_PATH` containing the absolute server filesystem path to the main test site's `.htpasswd`. This is not the FTP-visible path. Each line provides a separate login that works across all three sites. The test workflow generates `.htpasswd` from the secret and uploads it with the Sanny site, so no manual WebFTP upload is needed. Apache must be permitted to read the shared password file from each subdomain and allow Basic Auth and rewrite directives in `.htaccess`. Sanny and Auth use SPA fallbacks; docs serves its generated pages and `404.html`.

The backend uses one image workflow: pushes to `main` that change `backend/**` or `.github/workflows/deploy-backend.yml` run checks and publish the same `latest` and commit-SHA images to GHCR and Docker Hub (`sanny64/backend`). Docker Hub is used by Gordon and as the VPS deployment source. A manual `workflow_dispatch` from `main` deploys the exact commit-SHA image; runs from other branches do not publish or deploy.

### Directory Structure

```
Sanny/ (Root Workspace)
├── .github/                         # CI/CD workflows & actions
│
├── backend/                         # Fastify server engine
│   ├── auth0/
│   │    ├── database-action/        # Scripts to manage the custom database connection
│   │    ├── post-login/             # Scripts that run after user login
│   │    └── post-user-registration/ # Scripts that run after user registration
│   │
│   ├── docker/                      # Docker compose and Dockerfile
│   ├── monitoring/                  # Prometheus, exporters, Grafana, Loki, and Alloy
│   ├── nginx/                       # Reverse proxy, rate limiting safety net, 429-error handling
│   ├── prisma/                      # Prisma Schema
│   ├── redis/                       # Memory-NoSQL database
│   └── src/                         # Custom backend implementation
│        ├── controllers/
│        ├── routes/
│        ├── schemas/
│        ├── services/
│        ├── tests
│        ├── types/
│        ├── utils/
│        └── server.ts
│
├── documentation/                   # Frontend: docs.sanny64.de (Docusaurus)
│   └── docs/                        # MDX sources, e.g. general-info/deployment.mdx
│
├── games/
│   ├── first/                       # Independent game service / repository (first ever website of mine, index.html)
│   └── blockrunner/                 # Independent game service / repository (programming challenge)
│
├── auth/                            # Frontend: auth.sanny64.de (Vite + React + TS)
│   ├── public/
│   └── src/
│       ├── assets/                  # Frontend project specific assets
│       ├── components/              # Custom frontend project exclusive components
│       └── pages/                   # Authentication helper routes
│
├── sanny/                           # Frontend: sanny64.de (Vite + React + TS)
│   ├── public/
│   └── src/
│       ├── assets/                  # Frontend project specific assets
│       ├── components/              # Custom frontend project exclusive components
│       └── pages/                   # Main: Home, Blog, Games, Portfolio, Projects | Auxiliary: Party (different style)
│
├── shared/                          # Shared custom npm packages
│   └── packages/
│       ├── i18n/                    # Shared language context, types, utilities, and translations
│       ├── styles/                  # Shared theme context, types, utilities, and styling state
│       └── ui/                      # Shared ui components, pages and component/page styles
│           ├── components/          # Buttons, TextInput, etc.
│           ├── pages/               # Settings, Errors
│           └── styles/
│
├── .gitignore                       # Global git ignoring rules
└── README.md                        # Project overview & setup
```

## Documentation

The developer documentation is built with Docusaurus. Its sources are plain MDX files in `documentation/docs/` and it is published at [docs.sanny64.de](https://docs.sanny64.de).

Good starting points:

- [Getting Started](documentation/docs/start.mdx)
- [Deployment and Git flow](documentation/docs/general-info/deployment.mdx)

If you want to feed the documentation to a tool or an AI agent, either clone the repository or fetch single files as raw text. The `main` branch always contains the latest released state:

```
https://raw.githubusercontent.com/Sanny64/Sanny/main/documentation/docs/<path>.mdx
```

## Project Direction

- Architecture: modul-based mono-repo
- Design approach: mobile-first and user-centered design
- Authentication: through Auth0 - required for backend use and personal infos
- Settings: language and appearance changes
- Requirements: barrier-free, dark and light mode, English and German support, micro-interactions, modern and intuitive design

## Tech-Stack

### Frontend

- React + Typescript + Vite
- Routing via React Router data-router APIs
- Animations via Framer-Motion

### Shared Visual System

Sanny and Auth use the same semantic light/dark theme from `@sanny/styles`: neutral surfaces, green accents, locally bundled Manrope typography, consistent spacing, 4-8px radii, and visible keyboard focus. Theme selection continues to follow browser preferences until a manual choice is saved.

Both Vite configs use the shared HTML theme bootstrap in `vite.shared.ts`. It applies the saved theme (cookie first, then localStorage, otherwise system preference) and a critical page background before React or external styles load, preventing a white flash on hard refresh. Keep the bootstrap's fallback colors aligned with the shared background tokens.

`ThemeProvider` also supplies Framer Motion defaults through `MotionConfig` with `reducedMotion="user"`. `@sanny/ui` owns `AppShell`, route-entry motion, shared buttons, settings, and notifications. Both apps import the shared global/layout CSS in `src/main.tsx`, including standalone error and proof-resume routes. App-specific styles consume semantic variables instead of defining another light/dark palette. Auxiliary party routes keep their scoped colors.

The authentication workspace is `auth/`; use `dev:auth`, `lint:auth`, `build:auth`, and `test:frontend:accessibility:auth`. Its workflow publishes an artifact to `/public_html/auth/`; the hosting document root for `auth.sanny64.de` must match. The former login workspace/script names are no longer supported. Backend login endpoints and Auth0 callback URLs remain unchanged.

### Backend

- Fastify (TypeScript) + REST API Architecture + Prisma Schemas; The api endpoints for all (sub)-domains are routed via _base-url_/api/v001/
- Nginx is used as a reverse proxy for traffic management
- Auth0 custom database authentication
- Role-Based Access Control (RBAC) through Auth0
- MySQL (MariaDB + HeidiSQL)
- Fastify Helmet (`@fastify/helmet`)

### Deployment

- CI/CD via [SamKirkland FTP-Deploy-Action](https://github.com/SamKirkland/FTP-Deploy-Action)
- Version control via Git and [Github](https://github.com/Sanny64/Sanny)
- Hosted at Hetzner Webhosting on [Sanny64](https://www.sanny64.de)
- Before deployment check whether all your repository secrets are set (Frontend: FTP_SERVER, FTP_USERNAME, FTP_PASSWORD | Backend: VPS_HOST, VPS_USERNAME, VPS_SSH_KEY)
- The backend workflow tests and publishes one image to GHCR and Docker Hub when backend files change on `main`; a manual `workflow_dispatch` from `main` deploys that exact Docker Hub commit-SHA image to the VPS. Configure the Docker Hub and VPS secrets in GitHub Actions.

## Features

- Language and theme settings are handled by the shared i18n and styles packages, saved in cookies and mirrored in localStorage only on user change.
  - If no cookie value is set for either language or theme the website falls back to browser preferences
- Transient account/admin feedback and recoverable auth/linking failures use shared toasts, with German and English messages under `shared.notifications`. Loading, empty states, confirmations, and terminal errors remain on their pages.
- Unknown routes in the main frontend display the localized 404 page. Explicit `/error?status=...` redirects and router errors retain their corresponding error pages.
- Auth0 authorization-code login with PKCE is handled by the backend; browser apps use its server-side session API.
- Current Auth0 roles used by the application are `user` and `admin`.
- Auth0 credentials and application-user data share the MySQL user store without a second signup

### Integrations

- Google OAuth through Auth0
- SMTP for backend password-reset email

## Auth & Roles

The application currently uses the Auth0 roles `user` and `admin`. Self-service API permissions are assigned to `user`; administrative routes require `admin` and the relevant API permission, with MFA for sensitive operations. Recruiter and other role-specific content is not currently implemented.

## Pages

The routes listed below exist, but public page bodies currently render translated placeholders. The descriptions and feature lists are product direction, not shipped page functionality. Interactive settings/admin and authentication flows are implemented separately.

- [Homepage](#homepage)
- [Portfolio](#portfolio)
- [Projects](#projects)
- [Games](#games)
- [Blog](#blog)
- [Event-Organisation](#event-organisation)

---

### Homepage

The homepage is the general starting page when accessing my website.

Its main purpose is to introduce myself and redirect to the specific topic pages.

---

### Portfolio

The portfolio ([/portfolio](https://www.sanny64.de/portfolio)) is supposed to be an overview of my professional skillset.

- Resumé (Recruiters only)
- Academic degree
- Specialization
- IT history
- Past work
- Programming languages, frameworks and tools I use
- Link to projects page ([/projects](https://www.sanny64.de/projects))

---

### Projects

My projects archive ([/projects](https://www.sanny64.de/projects))

- My [first ever website](https://www.sanny64.de/games/first/index.html) [@Provadis-School](https://www.provadis-hochschule.de)
- Haptic Navigation Wristbands "Haptigation" [@Provadis-School](https://www.provadis-hochschule.de) ([/projects/haptigation](https://www.sanny64.de/projects/haptigation))
- Golf Handicap Calculator "PROSCRUM" [@Provadis-School](https://www.provadis-hochschule.de) ([/projects/proscrum](https://www.sanny64.de/projects/proscrum))
- College Management System "Student Assistant Utility" [@Provadis-School](https://www.provadis-hochschule.de) ([/projects/sau](https://www.sanny64.de/projects/sau))
- Surface Evaluation Ordering System "SEOS" [@Deutsche-Telekom-Technik-GmbH](https://www.telekom.com/de) ([/projects/seo](https://www.sanny64.de/projects/seo))
- Internal ServiceNow-based IT-Service-Management (Incident-/Change-Management) "SM.Now" [@Deutsche-Telekom-IT-GmbH](https://www.telekom.com/de) ([/projects/sm.now](https://www.sanny64.de/projects/sm.now))
- Link to games archive ([/games](https://www.sanny64.de/games))

---

### Games

An archive ([/games](https://www.sanny64.de/games)) for my mini game projects.

- [Blockrunner](https://blockrunner.sanny64.de)

---

### Blog

A blog ([/blog](https://www.sanny64.de/blog)) for my political, philosophical and poetic writing

---

### Event-Organisation

The event organization routes ([/party](https://www.sanny64.de/party), `/party/comfort`, and `/party/refreshments`) use a separate visual layout and are not linked from the main navigation. They remain directly routable; their current page bodies are placeholders.

They follow their own theme and mainly focus on making the user feel comfortable.

The following is the intended event-page content, not current functionality:

1. **Main Page**

- Welcome message
- Overview when and where (Static Info Card)
- What's still needed? (Form; Admins only; Automated changes based on "What will you bring?" -> WhatsApp confirmation and optional reminders)
- What will you bring? (Form; Automated Suggestions based on "What's still needed?")
- Song suggestions

2. **Period Comfort Kit** ([/party/comfort](https://www.sanny64.de/party/comfort))

- What's inside the kit? (Dynamic Info Cards)
- Where it's at? (Static Info Card)
- What did you take? (Form)
  - Withdrawn, Empty? | Name (optional) | Message (optional)
  - Send
- Spotify Integration (relaxed period comfort playlist)
- Personal message

3. **Refreshments Kit** ([/party/refreshments](https://www.sanny64.de/party/refreshments))

- What's inside the kit? (Dynamic Info Cards)
- Where it's at? (Static Info Card)
- What did you take? (Form)
  - Withdrawn, Empty? | Name (optional) | Message (optional)
  - Send
- Spotify Integration (laid-back chill mix)
- Personal message

## Authentication

Auth is hosted at https://auth.sanny64.de and handles account-link confirmation and ownership verification. Its root shows the authentication request state and shared appearance settings; sign-in remains owned by the backend and Auth0.

## Settings

### Default

The settings can be accessed with /settings across all subdomains

- Dark/Light mode
- English/German
- Accessibility settings (coming soon)
- Self user actions (change password, username)

### Admin

The admin settings allow user account changes (roles, username, etc.) for different user accounts if an admin user logs in.
They are restricted for any non admin users.

## Error-Handling

- Visual HTTP Error handling is done via npm package @sanny/ui
