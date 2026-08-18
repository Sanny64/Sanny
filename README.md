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
<div align="center">
  <img alt="Homepage" src="*placeholder*" />
</div>

Hey there, Sanny here 👋 this is my personal website.

It'll be used as a **portfolio**, a helper for me to **host events** and for you to get some **entertainment** of it.

## Content

- [Getting Started](#getting-started)
- [Project Direction](#project-direction)
- [Tech-Stack](#tech-stack)
- [Features](#features)
- [Auth & Roles](#auth--roles)
- [Pages](#pages)

## Getting Started

Clone this repository. You will need node.js and git installed globally on your machine.

### Installation and Setup Instructions

Installation: npm install

In the project directory, run one of the workspace scripts:

- npm run dev:sanny
- npm run dev:login
- npm run dev:docs

For quality checks:

- npm run lint
- npm run build

That will open http://localhost:5173 for frontend projects and http://localhost:3000 for docusaurus to view the selected app in dev mode in your browser. The page will reload automatically if you make edits.

### Directory Structure

```
Sanny/ (Root Workspace)
├── .github/                  # CI/CD Workflows & actions
├── backend/                  # Fastify Server Engine
│   └── src/
│        ├── middleware/      # RBAC role guards & authentication checks
│        └── modules/         # Encapsulated Fastify logic plugins
│             ├── auth/       # OAuth2 & JWT handlers
│             ├── blog/       # Public writing handlers
│             ├── events/     # Secret /party /comfort /refreshments endpoints
│             ├── portfolio/  # Recruiter-restricted data routes
│             └── settings/   # Settings API for cross domain settings profiling
│
├── games/
│   ├── first/#index.html     # Independent game service / repository (first ever website of mine)
│   └── blockrunner/          # Independent game service / repository (programming challenge)
│
├── login/                    # Frontend: auth.sanny64.de (Vite + React + TS)
│   ├── public/
│   └── src/
│       ├── assets/           # Frontend project specific assets
│       ├── components/       # Custom frontend project exclusive components
│       └── pages/            # LoginPage
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
- Authentication: required for some actions, with a role system
- Settings: language and appearance changes
- Requirements: barrier-free, dark and light mode, English and German support, micro-interactions, modern and intuitive design

## Tech-Stack

### Frontend

- React + Typescript + Vite
- Routing via React-Router-Dom
- Animations via Framer-Motion

### Backend

- Fastify (TypeScript) + REST API Architecture + Prisma Schemas; The api endpoints for all (sub)-domains are routed via _base-url_/api/v001/
- Nginx is used for traffic management
- Google OAuth 2.0 (via Fastify-Passport / Fastify-Secure-Session) + JWT
- Role-Based Access Control (RBAC) Middleware
- MySQL (MariaDB + HeidiSQL)
- Cloudflare (WAF & DDoS Protection) + Fastify-Helmet (@fastify/helmet)

### Deployment

- CI/CD via [SamKirkland FTP-Deploy-Action](https://github.com/SamKirkland/FTP-Deploy-Action)
- Version control via Git and [Github](https://github.com/Sanny64/Sanny)
- Hosted at Hetzner Webhosting on [Sanny64](https://www.sanny64.de)
- Before deployment check whether all your repository secrets are set (Frontend: FTP_SERVER, FTP_USERNAME, FTP_PASSWORD | Backend: VPS_HOST, VPS_USER , VPS_SSH_KEY)
- Backend only running locally for now.

## Features

- Language and theme settings are handled by the shared i18n and styles packages, saved in cookies and mirrored in localStorage only on user change.
  - If no cookie value is set for either language or theme the website falls back to browser preferences
- JWT and OAuth2-based authentication routed via sub-domain to main-domain
- RBAC
- User-(login)-data storage in MySQL database
- Cloudflare security features

### Integrations

- WhatsApp
- Gmail
- OAuth2 (Google)
- Cloudflare

## Auth & Roles

There are four roles: standard user, authenticated user, recruiter, admin. They all come with different permissions.

Recruiters differ to authenticated users in a way they get access to personal information and pictures of me.

Authenticated users differ to standard users in a way they can use forms and interact with allowed backend services.

## Pages

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
- Haptic Navigation Wristbands "Haptigation" [@Provadis-School](https://www.provadis-hochschule.de) ([/haptigation](https://www.sanny64.de/projects/haptigation))
- Golf Handicap Calculator "PROSCRUM" [@Provadis-School](https://www.provadis-hochschule.de) ([/proscrum](https://www.sanny64.de/projects/proscrum))
- College Management System "Student Assistant Utility" [@Provadis-School](https://www.provadis-hochschule.de) ([/sau](https://www.sanny64.de/projects/sau))
- Surface Evaluation Ordering System "SEOS" [@Deutsche-Telekom-Technik-GmbH](https://www.telekom.com/de) ([/seos](https://www.sanny64.de/projects/seos))
- Internal ServiceNow-based IT-Service-Management (Incident-/Change-Management) "SM.Now" [@Deutsche-Telekom-IT-GmbH](https://www.telekom.com/de) ([/smnow](https://www.sanny64.de/projects/smnow))
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

The event organization pages ([/party](https://www.sanny64.de/party)) are separated from the other pages.

They follow their own theme and mainly focus on making the user feel comfortable.

They're accessible only via QR-codes and can't be reached from the main UI.

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

## Login

Login is hosted at https://auth.sanny64.de

## Settings

The settings can be accessed with /settings across all subdomains

- Dark/Light mode
- English/German
- Accessibility settings
- User profiles will be

## Error-Handling

- Visual HTTP Error handling is done via npm package @sanny/ui
- Excepetions are caught via
