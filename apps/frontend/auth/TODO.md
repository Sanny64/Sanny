# Auth TODO

## Product and Workflow Acceptance

- [ ] Define acceptance for the intended neutral root, account-link confirmation, proof completion, and proof-resume routes; ensure direct navigation and refreshed nested URLs work on the deployed auth subdomain without exposing credentials or presenting unsupported account-management features.
- [ ] Verify popup blocked/closed, user cancellation, provider/network failure, expired/malformed proof state, and retry paths. Confirm intervals/listeners/channels are cleaned up on completion or unmount and that the parent UI cannot remain indefinitely busy after the popup disappears.
- [ ] Verify concurrent tabs/linking attempts cannot consume each other's proof or produce a misleading success state. Correlate messages with the intended transaction and retain backend validation as the security boundary.
- [ ] Verify supported desktop/mobile browsers, accessible focus/status/error handling, keyboard operation, zoom, and reduced motion through the full ownership-proof flow. Decide and document any unsupported popup/browser cases rather than claiming untested compatibility.

## Audit Findings (2026-10-22)

## Account Linking

- [ ] Coordinate the critical/high account-link authorization fixes in the [backend TODO](../../backend/TODO.md). Frontend parameter validation and ownership-proof UI must never substitute for backend transaction authentication or second-account ownership checks.
- [ ] Move hardcoded account-link headings, status/error messages, buttons, provider descriptions, and accessible text in [AccountLinkingPage](src/pages/accountLinkingPage/AccountLinkingPage.tsx) and proof/resume routes into the existing translation catalog. Verify English and German across confirmation, cancellation, expiry, popup failure, and retry.
- [ ] Correct the account-link page's claim that users can manage or unlink accounts in settings unless that workflow actually exists and is tested; otherwise remove the unsupported promise.

## Resilience and Verification

- [ ] Include blocked-storage startup coverage for the theme/language providers. Their initialization can currently throw when `localStorage` access is denied; fixes belong in the [shared packages TODO](../../../shared/packages/TODO.md).
- [ ] Verify hosted linking with dedicated identities in both login directions, including proof reauthentication, reset/resume, cancellation, expiry cleanup, and final Auth0/local-account consistency. Keep hosted evidence separate from mocked results.
- [ ] Rerun app checks, local tests, and relevant mocked-browser/accessibility suites after fixes. The audit's six fast Auth tests passed, but full browser, build, and live Auth0 gates were not completed. Release/deployment fixes are tracked in the [root TODO](../../../TODO.md).
