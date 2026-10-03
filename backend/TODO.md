# Backend TODO List

## Future tasks

### Security hardening and deployment

- [ ] Validate the hosted deployment before public production (after VPS/staging exists).

  - Local Docker development verified 2026-10-03: health/HTTPS redirect, closed host ports for app and Redis, private NGINX status/exporter, auth-initiation 302, throttling 429 with `Retry-After`, and health after throttling.
  - Local checks passed: backend suite (146 passed, 1 skipped), real-Redis integration (6 passed), mocked Playwright E2E (28 passed), and operations docs build.
  - Forwarded-header spoofing did not change the configured callback error redirect.
  - Production-mode local smoke check: HTTPS health returned 200 with HSTS; public NGINX status remained hidden. The configured API origin did not resolve from this host, so real login E2E could not reach the callback.
  - Live E2E attempted twice: Google blocked automated sign-in; the password flow did not complete. No account deletion or linking mutation was run.
  - No hosted staging or production deployment exists yet; VPS hosting is deferred. Before public production, provision isolated staging and verify compose/network/firewall behavior, real Auth0 login/logout and account lifecycle flows, JWT/refresh-token handling, deletion, pagination, and error contracts.
  - Keep this item open until hosted staging results, production configuration, runbooks, and residual risks are recorded.
