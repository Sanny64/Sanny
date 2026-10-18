# Sanny Public Site

The `sanny/` workspace is the public React 19, TypeScript, and Vite application. It shares localization, theme, and UI behavior through `@sanny/i18n`, `@sanny/styles`, and `@sanny/ui`.

## Routes

- `/`, `/portfolio`, `/projects`, `/projects/haptigation`, `/projects/proscrum`, `/projects/sau`, `/projects/seo`, `/projects/sm.now`, `/blog`, and `/games`
- `/party`, `/party/comfort`, and `/party/refreshments` use the auxiliary layout and scoped colors.
- `/settings` and `/settings/admin` contain interactive account and admin UI.

The public content routes are present, but their page bodies currently render translated placeholders. The standalone games under `games/` are separate projects and are not embedded in these route pages.

## App Structure

`src/main.tsx` installs `ThemeProvider` before `LanguageProvider` and imports shared styles. `src/App.tsx` defines the React Router data routes. Main routes use `AppShell`; party routes use the auxiliary layout.

Authentication is handled by the Fastify backend and Auth0. The browser reads `VITE_DEV_API_URL` in development and `VITE_PROD_API_URL` in production; it does not configure an Auth0 SPA client.

## Development

Run these commands from the repository root:

```sh
npm ci
npm run dev:sanny
npm run lint:sanny
npm run build:sanny
npm run test:e2e:accessibility:sanny
```

The development server uses HTTPS at `https://localhost:5173`. Build and lint wrappers are defined in the root `package.json`.

See the [frontend documentation](../documentation/docs/frontend/projects/sanny.mdx) and [deployment guide](../documentation/docs/general-info/deployment.mdx) for shared behavior and workflow details.
