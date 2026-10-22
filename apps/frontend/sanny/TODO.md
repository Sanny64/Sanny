# Sanny TODO

## Product Completion

- [ ] Decide the first-release route/content scope. [Home](src/pages/home/Home.tsx), [Portfolio](src/pages/portfolio/Portfolio.tsx), [Projects](src/pages/projects/Projects.tsx), and [Blog](src/pages/blog/Blog.tsx) currently render translated labels/headings rather than finished content. For each public route, provide approved English/German content and working navigation, or deliberately hide/defer it; do not invent a blog/CMS or other new product requirements solely to fill a placeholder.
- [ ] Review project-detail, games, and auxiliary/party routes against that scope. Confirm links/assets actually ship in the chosen deployment and do not depend on Git-ignored local files. Provide intentional empty/not-found states for deferred content.
- [ ] Verify public navigation and direct-link reloads across the deployed document root, including nested routes, unknown URLs, language/theme preferences, and auth/logout return destinations.
- [ ] Review page titles/descriptions, canonical URLs, meaningful headings/link text, image alternatives, and indexing policy for published content. Keep staging protected and prevent unintended indexing; do not publish unfinished placeholder routes as finished pages.

## Audit Findings (2026-10-22)

## Correctness and Security

- [ ] **High: replace cross-host CSRF cookie reads.** [AccountSettings](src/pages/settings/AccountSettings.tsx), [AdminSettings](src/pages/settings/AdminSettings.tsx), and [LoginButton](src/components/default/LoginButton.tsx) read `__Host-sanny_csrf` from `document.cookie`. An API-host-only cookie is unavailable on another frontend hostname, as confirmed by a browser probe. Consume a backend-issued session-bound token through an allowed, non-cacheable response; retain credentials and existing origin protections. Coordinate with the [backend TODO](../../backend/TODO.md) and test actual separate hostnames for mutations and logout.
- [ ] **Medium: implement server-backed user pagination.** [AdminSettings](src/pages/settings/AdminSettings.tsx) fetches `/api/v001/users/list` without page parameters, then paginates the default first 25 records locally. Request pages explicitly and agree on totals/cursors with the backend. Test more than 25 users, empty/final pages, and deletion from the last page. Keep mock users in test fixtures rather than silently mixing synthetic records into the development admin UI.

## Normalization and Developer Experience

- [ ] Consolidate duplicated API request, CSRF, response parsing, and typed-error handling into a frontend-owned helper. Preserve distinct MFA/email-OTP behavior and do not move app-specific authorization logic into generic shared UI.
- [ ] Move hardcoded German/English admin strings, confirmation dialogs, pagination labels, empty states, and accessible labels into the existing translation catalog. Verify both languages in normal and resumed-action flows.
- [ ] Use public workspace package imports consistently; replace the deep relative Button source import in [AccountSettings](src/pages/settings/AccountSettings.tsx) with the existing `@sanny/ui` export.
- [ ] Measure route bundle costs before introducing lazy loading for settings/admin and secondary content routes; avoid speculative splitting without a measurable loading benefit.
- [ ] Include blocked-storage startup checks for both shared providers; the underlying fixes belong in the [shared packages TODO](../../../shared/packages/TODO.md).

## Workflow Acceptance

- [ ] Verify account/admin loading, unauthenticated/forbidden, missing-local-profile, empty-result, network/provider failure, rate-limit, success, and retry states. Preserve drafts where appropriate and prevent duplicate submissions or false completion during partial failures.
- [ ] Verify the login indicator rechecks session state after expiry, logout/account deletion, and recovery from a failed initial request; do not let a cached response or rejected promise keep authentication UI stale for the page lifetime.
- [ ] Verify normal and resumed MFA/email-OTP actions produce the same visible result, retain the intended user/page/return destination, and handle expired/replayed resume tokens and cancellation without replaying the wrong action.
- [ ] Complete supported desktop/mobile, keyboard, screen-reader, zoom, and reduced-motion acceptance for navigation, settings, and admin workflows. Include long translated labels, focus after navigation/dialogs, validation messages, and actionable error feedback.

## Verification

- [ ] Add regression browser coverage for cross-host authentication/CSRF and complete admin pagination. Existing same-host/different-port mocks do not establish cross-host production behavior.
- [ ] Make the cross-host CSRF regression exercise distinct HTTPS hostnames in an isolated browser context, real browser cookie scoping/CORS, and the actual client token/request logic. Prove a valid profile/admin mutation and logout succeed while missing/incorrect/other-session tokens and disallowed origins fail without side effects. Do not stub every mutation to unconditional success; that would conceal the original defect. Wire the scenario into the required mocked-browser gate with no live Auth0 credentials, using a controlled test API where needed.
- [ ] Rerun app checks, local tests, and relevant mocked-browser/accessibility suites after fixes. The audit's fast Sanny tests passed, but full browser, build, and live Auth0 gates were not completed. See the [root TODO](../../../TODO.md) for repository-wide release blockers.
