# Shared Packages TODO

## Package and UX Contracts

- [ ] Keep the supported public source exports and workspace dependency/peer-dependency contracts verifiable from consuming apps; check clean-install builds and avoid deep private-source imports, generated-output dependencies, or unnecessary new package boundaries.
- [ ] Verify English/German translation key and interpolation parity, fallback behavior, and document language updates for shared components and consuming pages. Missing translations must not silently produce undefined user-facing or accessible text.
- [ ] Verify shared Button, Checkbox, ButtonGroup, and toast behavior for disabled/busy states, keyboard/focus, accessible names, live announcements, dismiss/action controls, and timer/subscription cleanup. Persistent actionable feedback must remain operable without a mouse.
- [ ] Verify shared light/dark styling and long translated content at supported mobile widths and 200% zoom; retain contrast, visible focus, stable controls, and reduced-motion behavior across both frontends.

## Audit Findings (2026-10-22)

## Storage Resilience

- [ ] **Medium: guard preference storage during provider initialization.** [resolveStoredTheme](styles/src/utils/theme.utils.ts) and [resolveStoredLanguage](i18n/src/utils/language.utils.ts) read `localStorage` without protection while their providers initialize. Both threw in isolated blocked-storage probes, potentially preventing either frontend from rendering. Use guarded reads, cookie/system defaults, and an in-memory fallback; do not require persistence for rendering.
- [ ] Guard theme/language persistence writes as well as reads. A denied or full storage backend must not break preference controls or leave the document state inconsistent.
- [ ] Add focused tests for throwing storage getters/setters, valid cookies with inaccessible storage, invalid/missing preferences, and continued frontend rendering and controls when persistence is unavailable. Reuse established test utilities and avoid creating a new package solely for these tests.

## Normalization and Accessibility

- [ ] Keep app-visible and accessible strings in the existing English/German catalogs; coordinate remaining account-link/admin hardcoded text with the frontend TODO files.
- [ ] Preserve existing skip navigation, semantic controls, live regions, document language, and reduced-motion support while applying fixes. Complete manual screen-reader, keyboard, zoom, and any supported forced-colors checks before claiming accessibility compliance.
- [ ] Keep package boundaries lean: share genuinely reused UI/preferences, but keep API session orchestration in frontend-owned code rather than coupling generic UI to backend routes.

## Verification

- [ ] Run shared package checks and component tests, then relevant frontend regression suites. The audit passed 14 shared UI component tests; it did not complete all browser/accessibility or build gates. See the [root TODO](../../TODO.md) for repository-wide verification and dependency work.
