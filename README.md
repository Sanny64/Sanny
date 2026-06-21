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

In the project directory, you can run: npm run dev

That will open http://localhost:5173 to view the website in devmode in your browser. The page will reload automatically if you make edits.

### Directory Structure
```
Sanny/ (Root Workspace)
├── .github/                  # CI/CD Workflows & actions
├── backend/                  # Fastify Server Engine
│   └── src/
│        ├── middleware/       # RBAC role guards & authentication checks
│        └── modules/          # Encapsulated Fastify logic plugins
│             ├── auth/         # OAuth2 & JWT handlers
│             ├── portfolio/    # Recruiter-restricted data routes
│             ├── blog/         # Public writing handlers
│             └── events/       # Secret /party /comfort /refreshing endpoints
│
├── games/
│   └── blockrunner/          # Independent game service / repository
│
├── login/                    # Frontend: auth.sanny64.de (Vite + React + TS)
│   ├── dist/
│   ├── public/
│   └── src/
│       ├── assets/
│       ├── components/
│       └── pages/            # Login UI
│
├── sanny/                    # Frontend: sanny64.de (Vite + React + TS)
│   ├── dist/                 # Production build outputs
│   ├── public/
│   └── src/
│       ├── assets/
│       ├── components/
│       └── pages/            # Portfolio, Projects, Games, Blog, Party, Settings
│
├── .gitignore                # Global git ignoring rules
└── README.md                 # Project roadmap & documentation
```

## Project Direction
- Architecture: microservice-oriented
- Design approach: mobile-first and user-centered design
- Authentication: required for some actions, with a role system
- Settings: language and appearance changes
- Requirements: barrier-free, dark and light mode, English and German support, micro-interactions, modern and intuitive design

## Tech-Stack

### Frontend
- React + Typescript + Vite
- Routing via React-Router
- Animations via Framer-Motion

### Backend
- Fastify (TypeScript) + REST API Architecture; The api endpoints for all (sub)-domains are routed via *base-url/api/v001/
- Nginx is used for traffic management
- Google OAuth 2.0 (via Fastify-Passport / Fastify-Secure-Session) + JWT
- Role-Based Access Control (RBAC) Middleware
- MySQL (MariaDB + HeidiSQL)
- Cloudflare (WAF & DDoS Protection) + Fastify-Helmet (@fastify/helmet)

### Deployment
- CI/CD via [SamKirkland FTP-Deploy-Action](https://github.com/SamKirkland/FTP-Deploy-Action)
- Version control via Git and [Github](https://github.com/Sanny64/Sanny)
- Hosted at Hetzner Webhosting on [Sanny64](https://www.sanny64.de)
- Before triggering a deploy action make sure all repository secrets are set (FTP_PASSWORD, FTP_SERVER, FTP_USERNAME)

## Features
- Extended components library
- Multi-page layout
- Fully responsive; mobile first
- User centered design
- Full Frontend + Backend Code
- English Code only
- No AI-integration; SAVE RESOURCES WHERE EVER POSSIBLE

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
- [Login](#login)
- [Settings](#settings)

---

### Homepage
The homepage is the general starting page when accessing my website.

Its main purpose is to introduce myself and redirect to the specific topic pages.

---

### Portfolio
The portfolio (/portfolio) is supposed to be an overview of my professional skillset. 
- Resumé (Recruiters only)
- Academic degree
- Specialization
- IT history
- Past work
- Programming Languages, Frameworks and Tools I use
- Link to projects page (/projects)

---

### Projects 
My projects archive (/projects)
- My first ever website (/first)
- Golf Handicap Calculator "PROSCRUM" (/proscrum)
- College Management System "Student Assistant Utility" (/sau)
- Haptic Navigation Wristbands "Haptigation" (/haptigation)
- Link to games archive (/games)

---

### Games
An archive (/games) for my mini game projects.

---

### Blog
A blog for my political, philosophical and poetic writing

---

### Event-Organisation
The event organization pages (/party) are separated from the other pages. 

They follow their own theme and mainly focus on making the user feel comfortable.

They're accessible only via QR-codes and can't be reached from the main UI.

1. **Main Page**
- Welcome message
- Overview when and where (Static Info Card)
- What's still needed? (Form; Admins only; Automated changes based on "What will you bring?" -> WhatsApp confirmation and optional reminders)
- What will you bring? (Form; Automated Suggestions based on "What's still needed?")
- Song suggestions

2. **Period Comfort Kit** (/comfort)
- What's inside? (Dynamic Info Cards)
- Where it's at? (Static Info Card)
- What did you take? (Form)
  - Withdrawn, Empty? | Name (optional) | Message (optional)
  - Send
- Spotify Integration (relaxed period comfort playlist)
- Personal message

3. **Refreshing Kit** (/refreshing)
- What's inside? (Dynamic Info Cards)
- Where it's at? (Static Info Card)
- What did you take? (Form)
  - Withdrawn, Empty? | Name (optional) | Message (optional)
  - Send
- Spotify Integration (laid-back chill mix)
- Personal message

---

### Login
Login is hosted at auth.sanny64.de

---

### Settings
The settings can be accessed with /settings
- Dark/Light Mode
- English/German
- Accessibility Settings
