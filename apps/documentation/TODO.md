# Documentation TODO

## CI Findings and Reverification

- [x] **Fix formatting in both testing pages.** The original audit's `npm run test:ci` stopped at Prettier warnings for [English testing](docs/general-info/testing.mdx) and [German testing](i18n/de/docusaurus-plugin-content-docs/current/general-info/testing.mdx). After the user's formatting run, a focused Prettier check passed for both pages on 2026-10-22. This does not establish a green repository formatting/CI gate.
- [x] **Review and refresh two stale translation hashes.** Reviewed and corrected both languages for `backend/local-testing/monitoring-integration-testing.mdx` and `general-info/testing.mdx`, including actual alert-state checks and explicitly scoped credential fallbacks. Recorded reviewed hashes through the repository command; final tooling contracts pass 54/54. The changed deployment guides were also reviewed and recorded.

## Accuracy and Setup

- [ ] Align backend setup documentation with the real development and production TLS mount paths, including the `secret/certs` directories. Verify the documented commands from a clean checkout with dummy configuration and record external MariaDB/Auth0/certificate prerequisites explicitly.
- [ ] Update session lifetime documentation only alongside the backend fix: the current code does not enforce the stated 30-minute idle/eight-hour absolute guarantees. Keep both languages and expiry-warning behavior consistent.
- [ ] Correct the Auth0 tenant contract's statement that self-service password reset requires no MFA step-up; the current route requires email-OTP authentication. Review the complete factor/recovery policy in both languages against code and hosted behavior.
- [x] Update deployment paths, staging layout, and immutable image-tag descriptions after the workflow fixes. Both languages now document matching artifact directories, bare commit tags, manual `backend-directory`, operator-provisioned configuration, explicit Compose project paths, and health-gated rollout. The staging smoke check uses synthetic inputs only.
- [ ] Document actual Loki deletion/retention and application/NGINX log rotation after those controls are implemented. `retention_period: 168h` alone does not enable Compactor retention.

## Dependency and Release Evidence

- [ ] Review Docusaurus and transitive build-tool advisories reported by the workspace audit, choose compatible targeted upgrades, and rebuild both locales. Distinguish build/development exposure from the deployed static site's runtime exposure; avoid blind forced upgrades or downgrades suggested by propagated audit chains.
- [ ] Keep tenant OTP requirements, Action deployment versions, proxy/TLS controls, backups/restore, and rollback evidence explicitly external to local test results. Do not claim full functionality, security certification, or staging sign-off from static checks and mocks.
- [ ] After reviewed documentation changes, refresh the relevant source hashes and rerun formatting, tooling contracts, documentation checks/builds, and the repository CI gate. The audit's byte-difference comparison passed but did not establish reviewed translation parity.

## General Documentation Completion

- [ ] Verify a new contributor can follow the root/workspace entry points through installation, Prisma generation/schema provisioning, certificates, external services, and a first successful app run without undocumented local state. Keep command/configuration ownership explicit and avoid copying credentials into examples.
- [ ] Review public and workspace instructions for stale relocated paths, command aliases, environment names, unsupported feature promises, and local-versus-hosted assumptions. Keep current release blockers linked to their owning TODO rather than duplicating historical results as present-tense guarantees.
- [ ] Complete release, rollback, restore, secret/certificate rotation, alert-response, and maintenance runbooks with clear owner/evidence requirements. Document approved procedures and intentional limitations; never invent hosted verification or publish restricted operational details.
- [ ] Verify both locale builds, sidebar/internal links, code examples, assets, direct routes, and accessible mobile navigation after documentation changes. Record reviewed English/German parity and intended unsupported/out-of-scope behavior separately from automated size/hash checks.
