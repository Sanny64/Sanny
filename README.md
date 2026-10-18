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
- [Project Direction](#project-direction)
- [Tech-Stack](#tech-stack)
- [Features](#features)
- [Auth & Roles](#auth--roles)
- [Pages](#pages)

## Getting Started

Clone this repository. You will need node.js and git installed.

### Installation and Setup Instructions

Install dependencies from the repository root with `npm ci`.

In the project directory, run one of the workspace scripts:

- npm run dev:sanny
- npm run dev:auth
- npm run dev:docs

For quality checks, use scripts defined by the root `package.json`:

- `npm run format:check`
- `npm run test`
- `npm run lint:backend`, `npm run lint:auth`, `npm run lint:sanny`, and `npm run lint:docs`
- Shared-package lint: `npm run lint -w @sanny/i18n`, `npm run lint -w @sanny/styles`, and `npm run lint -w @sanny/ui`
- `npm run build:auth`, `npm run build:sanny`, and `npm run build:docs`

`npm run test` runs formatting, backend type/unit/monitoring tests, real-Redis integration, frontend app lint/build, the shared UI component suite, mocked browser tests, and live password-user Auth0 tests in headed Chromium, Firefox, and Edge. Docs build remains separate as `npm run build:docs`. Install Playwright browsers with `npx playwright install chromium firefox msedge` and use dedicated test credentials for live authentication. Google automation is intentionally skipped, and Cloudflare may require a manual password-login verification; the tests do not bypass either provider's checks. Frontend build wrappers build shared packages before each app. See the [backend automated testing guide](documentation/docs/backend/local-testing/automated-testing.mdx), [frontend automated testing guide](documentation/docs/frontend/local-testing/automated-testing.mdx), and [staging readiness checklist](backend/TODO.md).

Run each app you need in its own terminal. Sanny is served at `https://localhost:5173`, Auth at `https://localhost:5174`, and the English docs at `http://localhost:3000` (`npm run dev:docs-de` serves German docs at port `3001`). Frontend development servers use a local HTTPS certificate and reload when source changes.

`npm run test:backend:redis` starts a disposable Compose project that inherits the
real app and Redis environment, TLS configuration, and service definitions. It
waits for Redis health, uses separate networking and data volumes, limits the
test run to 120 seconds, and removes its containers and volumes afterward. The
development stack does not need to be running.

### Deployment

Every push to `main` runs the production docs workflow. Every push to `test` runs the test frontend workflow; manual test runs are restricted to that branch. All sites are built for the subdomain root (`/`).

Configure the GitHub Actions repository variable `VITE_DEV_API_URL` for the test backend and `VITE_PROD_API_URL` for the production backend. The test workflow passes the development URL into the existing `VITE_PROD_API_URL` build-time slot because optimized Vite builds use the production code path, regardless of deployment branch. Production workflows use the production URL. Builds fail if their required URL is missing. Local `.env.local` files remain unchanged and are not available on GitHub runners. The test URL must be reachable by visitors; `localhost` would point to each visitor's own device.

Configure these HTTPS subdomains in Hetzner with the corresponding document roots (FTP-visible paths):

| Branch | Domain                 | FTP directory                |
| ------ | ---------------------- | ---------------------------- |
| `main` | `docs.sanny64.de`      | `/public_html/docs/`         |
| `test` | `test.sanny64.de`      | `/public_html/testing/`      |
| `test` | `test.auth.sanny64.de` | `/public_html/testing/auth/` |
| `test` | `test.docs.sanny64.de` | `/public_html/testing/docs/` |

The test destinations can be overridden with GitHub repository variables `TEST_SANNY_SERVER_DIR`, `TEST_AUTH_SERVER_DIR`, and `TEST_DOCS_SERVER_DIR`; include a trailing slash. Update or remove existing overrides if they point elsewhere. Auth and docs are nested directories on disk but are served at `/` on their own subdomains. Each upload uses a site-specific FTP sync-state file. DNS, TLS certificates, and subdomain document roots must be configured in the hosting control panel; FTP deployment does not create them.

Both workflows use `FTP_SERVER`, `FTP_USERNAME`, and `FTP_PASSWORD` secrets. Test sites also require `TEST_BASIC_AUTH_ENTRY` containing one or more newline-separated `username:hashed-password` lines (no blank lines), and `TEST_BASIC_AUTH_FILE_PATH` containing the absolute server filesystem path to the main test site's `.htpasswd`. This is not the FTP-visible path. Each line provides a separate login that works across all three sites. The test workflow generates `.htpasswd` from the secret and uploads it with the Sanny site, so no manual WebFTP upload is needed. If `TEST_SANNY_SERVER_DIR` is overridden, make sure `TEST_BASIC_AUTH_FILE_PATH` matches the file's actual upload location. Apache must be permitted to read the shared password file from each subdomain and allow Basic Auth and rewrite directives in `.htaccess`. Sanny and Auth use SPA fallbacks; docs serves its generated pages and `404.html`.

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
│   ├── monitoring/                  # Prometheus, exporters, Grafana, Loki, and Promtail
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
├── games/
│   ├── first/#index.html     # Independent game service / repository (first ever website of mine)
│   └── blockrunner/          # Independent game service / repository (programming challenge)
│
├── auth/                    # Frontend: auth.sanny64.de (Vite + React + TS)
│   ├── public/
│   └── src/
│       ├── assets/           # Frontend project specific assets
│       ├── components/       # Custom frontend project exclusive components
│       └── pages/            # Authentication helper routes
│
├── sanny/                    # Frontend: sanny64.de (Vite + React + TS)
│   ├── public/
│   └── src/
│       ├── assets/           # Frontend project specific assets
│       ├── components/       # Custom frontend project exclusive components
│       └── pages/            # Main: Home, Blog, Games, Portfolio, Projects | Auxiliary: Party (different style)
│
├── shared                    # Shared custom npm packages
│   └── packages/
│       ├── i18n/             # Shared language context, types, utilities, and translations
│       ├── styles/           # Shared theme context, types, utilities, and styling state
│       └── ui/               # Shared ui components, pages and component/page styles
│           ├── components/   # Buttons, TextInput, etc.
│           ├── pages/        # Settings, Errors
│           └── styles/
│
├── .gitignore                # Global git ignoring rules
└── README.md                 # Project roadmap & documentation
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

The authentication workspace is `auth/`; use `dev:auth`, `lint:auth`, `build:auth`, and `test:e2e:accessibility:auth`. Its workflow publishes an artifact to `/public_html/auth/`; the hosting document root for `auth.sanny64.de` must match. The former login workspace/script names are no longer supported. Backend login endpoints and Auth0 callback URLs remain unchanged.

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
- Before deployment check whether all your repository secrets are set (Frontend: FTP_SERVER, FTP_USERNAME, FTP_PASSWORD | Backend: VPS_HOST, VPS_USER , VPS_SSH_KEY)
- The backend has a VPS deployment workflow. Pushes to `main` test and publish an image; the VPS deployment itself requires a manual `workflow_dispatch` run and configured deployment secrets.

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
