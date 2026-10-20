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
- [Project](#project)
- [Tech Stack](#tech-stack)
- [Documentation](#documentation)

## Getting Started

Clone this repository. You need Git, Node.js 24, and npm 11.6.3.

### Installation and Setup Instructions

Install all workspaces from the repository root:

```sh
npm ci
```

Start the services you need in separate terminals:

- `npm run dev:sanny`
- `npm run dev:auth`
- `npm run dev:docs` or `npm run dev:docs:de`
- `npm run start:backend` (after [backend setup](https://docs.sanny64.de/docs/backend/backend-setup))

Sanny runs at `https://localhost:5173`, Auth at `https://localhost:5174`, and English docs at `http://localhost:3000`. See the [setup guide](https://docs.sanny64.de/docs/general-info/setup) for German docs, backend prerequisites, and build commands.

Run `npm run check` before manual builds. `npm run test:ci` is the Docker-backed CI-compatible gate; `npm run test` additionally runs live Auth0 and invokes the opt-in 429 spike scenario, which skips unless `RUN_429_SPIKE_E2E=true`. Live Auth0 needs a reachable development API/tenant and dedicated test credentials; enabling the spike scenario also requires Grafana credentials and may trigger alerts. See the [local testing guide](https://docs.sanny64.de/docs/general-info/testing) for prerequisites and coverage.

For backend containers and restart commands, see [Backend Setup](https://docs.sanny64.de/docs/backend/backend-setup). Shared package and tooling ownership is documented in the [workspace tooling guide](https://docs.sanny64.de/docs/general-info/workspace-tooling).

Detailed browser, Redis, and visual-test procedures live in the [frontend](https://docs.sanny64.de/docs/frontend/local-testing/automated-testing), [backend](https://docs.sanny64.de/docs/backend/local-testing/automated-testing), and [workspace tooling](https://docs.sanny64.de/docs/general-info/workspace-tooling) guides.

### Branches and Releases

The documented release convention is `dev -> test -> main`; GitHub Actions do not enforce the branch policy. See the [deployment guide](https://docs.sanny64.de/docs/general-info/deployment) for release steps.

### Deployment

The **Release workspace** workflow verifies and selects deployments for `main` and `test`. Test pushes deploy the frontend sites and docs; production targets depend on changed paths. Backend image publishing and optional VPS deployment are separate steps. Hosting secrets, DNS, TLS, document roots, and branch protections are configured outside this repository. The [deployment guide](https://docs.sanny64.de/docs/general-info/deployment) is the detailed source for workflow behavior and operator setup.

The main workspaces are `auth/`, `sanny/`, `backend/`, `shared/`, and `documentation/`; `games/` contains standalone projects. See the [setup guide](https://docs.sanny64.de/docs/general-info/setup) for ownership details.

## Documentation

The developer documentation is built with Docusaurus. Its sources are plain MDX files in `documentation/docs/` and it is published at [docs.sanny64.de](https://docs.sanny64.de).

Good starting points:

- [Getting Started](https://docs.sanny64.de/docs/start)
- [Deployment and Git flow](https://docs.sanny64.de/docs/general-info/deployment)

If you want to feed the documentation to a tool or an AI agent, either clone the repository or fetch single files as raw text. The `main` branch always contains the latest released state:

```
https://raw.githubusercontent.com/Sanny64/Sanny/main/documentation/docs/<path>.mdx
```

## Project

This monorepo contains the public site, an Auth helper for account-linking flows, a Fastify API, shared frontend packages, standalone games, and developer documentation. Public content routes currently render translated placeholders; interactive settings and account flows are separate. See the [frontend project guide](https://docs.sanny64.de/docs/frontend/projects/general) for current scope.

## Tech Stack

- Frontend: React 19, TypeScript, Vite, React Router, and Framer Motion.
- Backend: Fastify, Prisma, MariaDB, Redis, and Auth0, running behind NGINX in the Compose environment.
- Shared frontend behavior: localization, themes, and UI through `@sanny/i18n`, `@sanny/styles`, and `@sanny/ui`.

See the [shared-package](https://docs.sanny64.de/docs/frontend/shared-packages/styles), [backend](https://docs.sanny64.de/docs/backend/backend-setup), [Auth](https://docs.sanny64.de/docs/frontend/projects/auth), and [Sanny](https://docs.sanny64.de/docs/frontend/projects/sanny) guides for implementation details. Deployment and hosting responsibilities are covered in the [deployment guide](https://docs.sanny64.de/docs/general-info/deployment).
