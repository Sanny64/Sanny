## Staging Readiness Verification

Shared gate behavior and evidence-handling rules are in the [Local Testing guide](../documentation/docs/general-info/testing.mdx). Backend test commands and coverage boundaries are in [Automated Testing](../documentation/docs/backend/local-testing/automated-testing.mdx). Frontend component, lint, build, and browser-test coverage is in [Frontend Local Testing](../documentation/docs/frontend/local-testing/automated-testing.mdx). Backend manual checks are in [Manual Testing](../documentation/docs/backend/local-testing/manual-testing.mdx). Record hosted evidence in the restricted deployment record and link only sanitized outcomes here. Never include secrets or personal data.

There is no hosted staging environment yet. Local unit, mocked-browser, and development-stack results are not staging sign-off.

### Automation Gaps

- [ ] Add safe staging smoke coverage, or record approved manual evidence, for successful live profile updates, account deletion, admin role changes/list pagination, password reset, and MFA/email-OTP challenge and recovery. Current UI E2E mocks these API responses.
- [ ] Add live session tests for refresh success, expiry/reuse rejection, PKCE replay rejection, and expiry-warning behavior against isolated staging. Existing unit/Redis tests do not establish hosted Auth0/proxy behavior.

### Manual Accessibility and Provider Checks

- [ ] Complete keyboard-only workflows in English and German, screen-reader testing, 200% zoom, and reduced-motion checks. Record device/browser/assistive technology and results.
- [ ] Decide whether forced-colors/high-contrast mode is supported; test and document it if in scope.
- [ ] Verify Google sign-in and both Google-first/password-first account-link directions, including ownership reauthentication, confirm/cancel, expiry cleanup, and resulting Auth0/local-account state. Google automation is skipped by design.
- [ ] Verify the password-user Auth0 login manually when Cloudflare presents its human-verification challenge; the automated flow reports this as skipped rather than attempting to bypass the challenge.
- [ ] Verify live Auth0 MFA and email-OTP step-up, password reset, email verification, and recovery paths with dedicated identities.

### Hosted Staging and Monitoring

- [ ] Provision isolated staging and complete every check in [Deployment and Recovery](../documentation/docs/backend/deployment.mdx): correct environment/tenant/data targets, HTTPS and headers, proxy trust/direct access, CSRF, rate limits, auth lifecycle, role authorization, pagination, deletion, error contracts, backup/restore, rollback, and log/metric redaction.
- [ ] Verify Grafana's real Discord/email contact-point delivery in the development stack; the isolated test sink does not prove external delivery. The earlier local Grafana API attempt returned HTTP 401.
- [ ] Verify Grafana email contact-point delivery; it has not been run. The direct Discord webhook returned HTTP 204, but Grafana alert routing/delivery is still unverified.
- [ ] Run the real NGINX 429 Playwright scenario and record the alert and notification result; it has not been run.
- [ ] Verify monitoring endpoints remain private, `/nginx_status` is unavailable publicly but available to its exporter, and retention/access controls are appropriate in staging.
- [ ] Record build/revision, environment, date, scope, outcomes, residual risks, rollback readiness, and reviewer sign-off. Keep staging readiness open until all required evidence is reviewed.

## Repository Audit Findings (2026-10-22)

These findings concern the current source and are separate from the hosted verification checklist above. The authorization and session defects were reproduced using isolated in-memory mocks; no real identities or services were modified.

### Release Blockers

- [ ] **Critical: authenticate account-link cleanup scheduling.** The public `/api/v001/auth/confirm-account-linking` route in [auth.route.ts](src/routes/auth.route.ts) accepts supplied identity IDs and schedules deletion without authenticating the Auth0 transaction. [account-link-cleanup.ts](src/utils/account-link-cleanup.ts) later deletes the supplied temporary identity. Require a verified, signed transaction, bind its identities to server-trusted state, and revalidate that the identity is genuinely temporary and eligible for deletion before cleanup. Add negative tests for fabricated, tampered, expired, and replayed requests and for established/linked accounts.
- [ ] **High: require authorization for both accounts before local merging.** [linkUserAccountsHandler](src/controllers/user.controller.ts) checks ownership of only one supplied subject, then calls [mergeUserAccounts](src/services/user.service.ts) without verifying Auth0 linked the pair. Require the canonical authenticated primary and server-confirmed linkage/ownership before credential transfer or record deletion. Make local consolidation transactional and test that an unrelated secondary identity cannot be merged or deleted.
- [ ] **High: enforce idle and absolute session expiry.** [session.ts](src/utils/session.ts) calculates an idle TTL but writes an eight-hour TTL; [session-rotation.ts](src/utils/session-rotation.ts) resets `createdAt` during rotation. The audit resumed a session after 31 minutes idle. Preserve the original creation timestamp, enforce inactivity independently, cap every write/refresh by the remaining absolute lifetime, and keep expiry warnings consistent. Add time-controlled tests for idle expiry, repeated rotations, refresh near the absolute deadline, and active sessions never exceeding eight hours.
- [ ] **High: support cross-host frontend CSRF safely.** The API sets a host-only `__Host-sanny_csrf` cookie, but Sanny reads it from its own `document.cookie`. A browser probe confirmed another hostname cannot read it. Provide the session-bound CSRF token through an explicitly allowed, non-cacheable API response and coordinate frontend changes. Preserve host-only/HttpOnly session cookies, exact-origin CORS, and origin/token checks. Add separate-hostname browser tests, not only different ports on one hostname.
- [ ] **High: invalidate stale authorization after role changes.** [updateUserRolesHandler](src/controllers/user.controller.ts) updates Auth0 roles without revoking or versioning cached Redis session identities. Ensure removed roles/permissions stop authorizing existing sessions without waiting for token refresh or expiry. Test revocation across multiple sessions and deny protected requests immediately after removal.
- [x] **High: correct production Compose environment and certificate paths.** [docker-compose.prod.yml](docker/compose/docker-compose.prod.yml) now uses the explicit backend project directory for environment/TLS mounts and inherited Compose services. An executable contract resolves the real Compose model with synthetic inputs and checks the selected image and backend paths without reading real credentials. Hosted provisioning/deployment remains unverified; see the [root TODO](../../TODO.md).

### Required Security Regression Coverage

These tests are acceptance requirements for the fixes above, not tests already implemented. First demonstrate a failing assertion against the current defect, then make it pass with the fix and keep it in the required CI gate. Extend existing test homes where possible; mock external providers, not the authorization/expiry decisions under test.

- [ ] **Cleanup scheduling and deletion:** extend [auth route injection tests](src/tests/auth-route-inject.test.ts), [cleanup tests](src/tests/account-link-cleanup.test.ts), and relevant [account-link callback tests](src/tests/account-link-callback.test.ts). Fabricated/unsigned transactions, tampered IDs, expired/replayed state, and established/already-linked identities must neither enqueue unauthorized cleanup nor reach provider deletion. Exercise the worker as well as the route, assert zero unauthorized side effects, and retain successful verified temporary-account cleanup and confirmed-link cancellation cases.
- [ ] **Local account merge authorization:** extend [user route guard tests](src/tests/user-route-guards.test.ts) and [account-linking tests](src/tests/auth0-account-linking.test.ts), adding service-level coverage in the existing backend test layout as needed. Owning only the primary or secondary account, supplying an unrelated identity, or lacking confirmed Auth0 linkage must not transfer credentials or delete records. Cover the valid canonical linked pair and failure/rollback behavior without partial consolidation.
- [ ] **Session deadlines:** extend [session rotation tests](src/tests/session-rotation.test.ts). Use controlled time to check just before, exactly at, and after idle/absolute expiry; repeated touches/rotations and token refresh must never reset the original absolute deadline. Assert stored Redis TTLs, denied expired requests, and unchanged absolute expiry metadata. Include the isolated real-Redis suite for actual key expiration, not only an in-memory store that ignores TTLs.
- [ ] **Cross-host CSRF:** extend [CSRF guard injection tests](src/tests/csrf-guard-inject.test.ts) and coordinate the separate-host browser scenario in the [Sanny TODO](../frontend/sanny/TODO.md). Missing, incorrect, other-session tokens and untrusted origins must be rejected without mutation; legitimate frontend requests must succeed. Assert the session cookie remains host-only, Secure, and HttpOnly and that token delivery is non-cacheable and unavailable to disallowed origins.
- [ ] **Authorization revocation:** extend [user route guard tests](src/tests/user-route-guards.test.ts), [role-sync tests](src/tests/auth0-role-sync.test.ts), and session coverage. Start with authorized sessions, remove roles/permissions through the real update path with only the provider mocked, then reuse the old sessions against protected routes and require immediate denial. Cover multiple sessions, unaffected users, failed provider updates, and concurrent refresh so stale privileges are not resurrected.
- [x] **Production configuration:** [repository contracts](../../shared/tests/contracts/config.test.mjs) now resolve production Compose from a temporary backend project with synthetic interpolation inputs and check environment/TLS paths and image selection. Companion staging/remote-shell contracts cover artifact paths and clean-revision deployment gating. They do not load real environment files or deploy.

### Operations and Optimization

- [ ] **Medium: enable actual log retention and rotation.** [loki.yml](monitoring/loki.yml) sets `retention_period: 168h` without enabling Compactor retention, so the declaration alone does not delete old logs. Configure version-appropriate Compactor retention and persistent deletion state. Bound/rotate Pino and NGINX file logs and container logs; verify retention and disk behavior rather than relying only on configuration text.
- [ ] Cache Auth0 Management API access tokens until shortly before expiry with concurrency-safe renewal; [auth0-management.ts](src/utils/auth0-management.ts) currently requests a token for every management operation. Retain bounded timeouts and safe failure behavior, and avoid duplicate role-list requests in one role update.
- [ ] Reuse remote JWKS instances in [access-token.ts](src/utils/access-token.ts) rather than recreating their caches for every verification. Preserve issuer/audience validation, key rotation, and failure handling.
- [ ] Index sessions by subject so [destroySessionsForSubject](src/utils/session.ts) does not scan and deserialize all sessions for each revocation. Keep indexes and refresh-lock keys consistent under expiry, rotation, deletion, and concurrency.
- [ ] Evaluate build-time backend compilation instead of shipping the broad source tree and a runtime TypeScript loader. Adopt only if it materially simplifies startup/image contents without adding redundant build ownership.

### External Evidence and Validation

- [ ] Verify the hosted tenant enforces the required signup OTP policy: local creation marks email verified, and the first-login Action synchronizes verification without independently proving OTP completion. This remains a tenant-policy dependency, not a source-proven verification bypass. Record authorized staging evidence and deployed Action versions without secrets.
- [ ] Rerun backend unit and isolated integration suites after fixes, then the repository CI gate. Audit baseline: 155 unit tests passed, one skipped; backend production dependency audit found zero published advisories. Neither result proves hosted Auth0/proxy behavior or production security.

## General Backend Acceptance and Operations

These items expand the existing staging/deployment checklist into concrete acceptance work and operational decisions. They are not additional source-proven audit defects.

- [ ] Establish reproducible MariaDB schema initialization and versioned schema/data rollout, including a clean database, upgrade from the deployed revision, and a compatible rollback or recovery plan. Keep Prisma generation distinct from applying schema changes; review Auth0 custom-database compatibility before rollout.
- [ ] Define consistency and retry behavior for operations spanning Auth0, MariaDB, and Redis: profile changes, account linking/deletion, password reset, and session revocation. Exercise partial provider/database failures and retries; ensure no false success, unrelated deletion, or permanent orphaned state.
- [ ] Define bounded outbound-request timeouts and retry budgets for Auth0/SMTP and cleanup jobs, including rate limiting, unavailable providers, startup, and cancellation. Test recovery without duplicate sensitive operations or leaking provider responses/secrets.
- [ ] Define liveness versus dependency readiness and verify startup/shutdown with unavailable or reconnecting database/Redis services. Confirm termination stops accepting work and closes cleanup jobs, connections, and logs within the host's shutdown budget.
- [ ] Establish least-privilege MariaDB/Auth0/Redis/runtime access, private network boundaries, resource/disk limits, and a supported container-image update policy. Verify deployed settings rather than assuming source defaults establish host hardening.
- [ ] Implement protected MariaDB backup scheduling, encryption/access control, retention, and an isolated restore drill. Assign recovery ownership and agree on acceptable data loss and recovery time; separately decide which Redis/monitoring state is recoverable versus intentionally discarded with forced reauthentication.
- [ ] Establish TLS certificate issuance/renewal and runtime-secret rotation procedures, including Auth0 application/M2M credentials, database/Redis/SMTP credentials, and account-link signing secrets. Test safe overlap or deliberate invalidation where rotation affects in-flight sessions/proofs.
- [ ] Turn monitoring into an actionable operating procedure: define availability/latency/error and resource alerts, verify routing to a real recipient, document response/rollback steps, and rehearse a clean-host deployment plus application/configuration rollback using an immutable release.
