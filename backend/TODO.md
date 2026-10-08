# Staging Readiness Verification

Backend test commands and coverage boundaries are in [Automated Testing](../docs/docs/backend/local-testing/automated-testing.mdx). Frontend component, lint, build, and browser-test coverage is in [Frontend Local Testing](../docs/docs/frontend/local-testing/automated-testing.mdx). Manual checks are in [Manual Testing](../docs/docs/backend/local-testing/manual-testing.mdx). Record hosted evidence in the restricted deployment record and link only sanitized outcomes here. Never include secrets or personal data.

There is no hosted staging environment yet. Local unit, mocked-browser, and development-stack results are not staging sign-off.

## Automation Gaps

- [ ] Add safe staging smoke coverage, or record approved manual evidence, for successful live profile updates, account deletion, admin role changes/list pagination, password reset, and MFA/email-OTP challenge and recovery. Current UI E2E mocks these API responses.
- [ ] Add live session tests for refresh success, expiry/reuse rejection, PKCE replay rejection, and expiry-warning behavior against isolated staging. Existing unit/Redis tests do not establish hosted Auth0/proxy behavior.

## Manual Accessibility and Provider Checks

- [ ] Complete keyboard-only workflows in English and German, screen-reader testing, 200% zoom, and reduced-motion checks. Record device/browser/assistive technology and results.
- [ ] Decide whether forced-colors/high-contrast mode is supported; test and document it if in scope.
- [ ] Verify Google sign-in and both Google-first/password-first account-link directions, including ownership reauthentication, confirm/cancel, expiry cleanup, and resulting Auth0/local-account state. Google automation is skipped by design.
- [ ] Verify the password-user Auth0 login manually when Cloudflare presents its human-verification challenge; the automated flow reports this as skipped rather than attempting to bypass the challenge.
- [ ] Verify live Auth0 MFA and email-OTP step-up, password reset, email verification, and recovery paths with dedicated identities.

## Hosted Staging and Monitoring

- [ ] Provision isolated staging and complete every check in [Deployment and Recovery](../docs/docs/backend/deployment.mdx): correct environment/tenant/data targets, HTTPS and headers, proxy trust/direct access, CSRF, rate limits, auth lifecycle, role authorization, pagination, deletion, error contracts, backup/restore, rollback, and log/metric redaction.
- [ ] Verify Grafana's real Discord/email contact-point delivery in the development stack; the isolated test sink does not prove external delivery. The earlier local Grafana API attempt returned HTTP 401.
- [ ] Verify Grafana email contact-point delivery; it has not been run. The direct Discord webhook returned HTTP 204, but Grafana alert routing/delivery is still unverified.
- [ ] Run the real NGINX 429 Playwright scenario and record the alert and notification result; it has not been run.
- [ ] Verify monitoring endpoints remain private, `/nginx_status` is unavailable publicly but available to its exporter, and retention/access controls are appropriate in staging.
- [ ] Record build/revision, environment, date, scope, outcomes, residual risks, rollback readiness, and reviewer sign-off. Keep staging readiness open until all required evidence is reviewed.
