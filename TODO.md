Before actual VPS deployment, supply the manual `backend-directory` input for an operator-provisioned checkout at the release commit, with clean tracked deployment configuration and independently provisioned secrets/certificates. No registry publish, FTP upload, or VPS deployment was performed for this verification.

## Product and Release Roadmap

- [ ] **Complete the public website.** Define the intended content for each route, replace selected placeholders, and deliberately hide or label unfinished sections. Track content, navigation, metadata, and user-facing acceptance checks in the [Sanny TODO](apps/frontend/sanny/TODO.md).
- [ ] **Provision and deploy isolated hosted environments.** Establish staging and production configuration/secret boundaries, VPS access, DNS/TLS, private service networking, and monitoring. Complete clean-host deployment, health checks, rollback, and restore evidence before production promotion. Coordinate workflow work here with the [backend TODO](apps/backend/TODO.md).
- [ ] **Complete authentication acceptance.** Resolve the [Auth TODO](apps/frontend/auth/TODO.md), including recovery, cancellation, retry, popup lifecycle, localization, and supported-browser acceptance. Do not expand the supported identity-provider set without an explicit product decision.
- [ ] **Complete shared UX and documentation readiness.** Resolve the [shared packages TODO](shared/packages/TODO.md) and [documentation TODO](apps/documentation/TODO.md), including accessibility evidence, preference resilience, bilingual accuracy, and clean-checkout instructions.

## Backlog and Release Ownership

Unchecked items describe remaining work, not proof of a confirmed defect. Keep implementation decisions and optional optimizations distinct from release blockers. Mark an item complete only when its acceptance checks pass; attach dated, sanitized evidence for hosted checks. Preserve historical results without presenting them as current revision sign-off. Cross-area items have one primary owner TODO and link to dependent work rather than requiring duplicate implementations.

- [ ] Confirm the supported browser/device, hosting, accessibility, and content scope for the first production release; document intentional deferrals so readiness has a finite acceptance boundary.
- [ ] Configure GitHub branch/environment protection outside workflow YAML: require the intended CI checks, restrict production deployment permissions, and confirm secret access and any required approval policy with the actual repository settings.
- [ ] Establish recurring npm, container-image, and Action update/security review, including development-server exposure and production image scanning. Record remediation or explicit risk acceptance; do not treat one clean audit as permanent coverage.
- [ ] Define a release checklist and incident owner covering coordinated backend/Auth0/frontend changes, secret/certificate rotation, backup/restore and rollback responsibilities, and post-deployment smoke checks. Keep operational credentials and private evidence outside the repository.

## Repository Audit Follow-Up (2026-10-22)

The audit assessed the current working tree without implementing fixes. Block production promotion until the critical/high backend findings and deployment defects are resolved. Existing completed checkboxes above are historical, not evidence that the current revision passes.

Area-specific findings are tracked in [Backend](apps/backend/TODO.md), [Sanny](apps/frontend/sanny/TODO.md), [Auth](apps/frontend/auth/TODO.md), [Shared Packages](shared/packages/TODO.md), and [Documentation](apps/documentation/TODO.md).

### Deployment Correctness

- [x] **High: align published and deployed backend image tags.** [deploy-backend.yml](.github/workflows/deploy-backend.yml) now publishes the same bare full commit SHA selected by deployment. The regression contract checks publisher/consumer wiring; no registry was contacted.
- [x] **High: repair backend deployment configuration delivery and paths.** The manual `backend-directory` input selects an operator-provisioned matching checkout; the script rejects missing/wrong/dirty configuration, uses the backend project directory, validates Compose silently, and waits for backend health. Simulated shell tests cover rejection, failure short-circuiting, and success. Actual host provisioning remains in the release roadmap.
- [x] **Medium: repair test-site staging paths.** [deploy-to-test.yml](.github/workflows/deploy-to-test.yml) now stages builds/access-control files in the same directories the upload matrix selects. The actual staging shell passes with synthetic builds and credentials in a fresh temporary directory.

### Dependencies and Verification

- [ ] **Review dependency advisories with exposure-specific upgrades.** The 2026-10-22 full-workspace `npm audit` reported 54 affected packages: 15 critical, 17 high, and 22 moderate. These include propagated dependency chains, not 54 independently exploitable production flaws. Root Vite/Vitest development-server advisories need targeted review; documentation dependencies are tracked separately. The backend production-only audit reported zero advisories. Do not apply forced upgrades blindly.
- [x] **Restore the current CI gate.** The formatting/translation-review blockers and a neighboring stale Compose assertion are resolved. `npm run test:ci` passed; final workflow/translation follow-ups passed 54/54 tooling contracts. See the refactor verification record above for scope and remaining skips.
- [ ] **Close verification gaps before release.** Backend unit tests passed 155 with one skipped; frontend/shared suites passed 28 tests. The audit did not complete browser suites, Docker integration, builds, or live Auth0 gates. Add regression coverage for the reproduced authorization/session defects, cross-host CSRF behavior, and clean-checkout deployment commands. Track hosted tenant, infrastructure access-control, and backup/restore evidence separately from local results.

### Regression Test Requirements

A reproducible critical/high finding is not complete until a committed behavioral regression test fails against the vulnerable implementation and passes with the fix. Record the failing assertion and focused passing command when implementing each fix. Existing green tests, source-string checks, or an ad hoc audit probe alone are not regression coverage. Tests reduce recurrence risk; they do not guarantee the absence of future defects.

- [ ] Add regression tests alongside every critical/high fix, using existing test files/helpers where practical. Include rejected misuse with no unauthorized side effects and a legitimate success case; test the actual route/guard/service boundary instead of mocking away the behavior being fixed. Follow the concrete matrix in the [backend TODO](apps/backend/TODO.md).
- [ ] Ensure security regressions run in the appropriate required CI suite without production credentials, live Auth0 accounts, or implicit developer environment files. Keep backend behavior in backend tests, repository/deployment contracts in [tooling contracts](shared/tests/contracts/config.test.mjs), and browser workflows in `shared/tests/e2e`; use isolated services when mocks cannot validate the relevant behavior.
- [x] Add executable clean-directory staging and configuration/tag-resolution checks for deployment fixes. Four contracts now cover actual staging, actual Compose model resolution, image/input wiring, and simulated remote execution with rejection/failure/success assertions; no live deployment is needed.
- [ ] Do not replace a missing security regression with `skip`, expected failure, or weaker assertions merely to get a green gate. If a scenario cannot be automated safely, document why, retain automated coverage for the reproducible local boundary, and keep the external verification item open until reviewed evidence exists.

### Optimization, Leanness, and Developer Experience

- [ ] Reuse verified frontend build artifacts for deployment instead of reinstalling/rebuilding the same revision in each release job; retain explicit environment-specific build inputs and artifact provenance.
- [ ] Preserve Docker layer caching for routine development builds; review the backend build command's unconditional `--no-cache` and reserve clean rebuilds for explicit use.
- [ ] Consider optional monitoring Compose profiles so daily API/frontend work does not require the entire observability stack. Keep full integration/CI coverage explicit.
- [ ] Verify clean-checkout onboarding, including Prisma client generation, external MariaDB provisioning, certificates, Auth0 prerequisites, and Node.js 24/npm 11.6.3. Keep setup instructions aligned with actual mount paths and commands.
- [ ] Decide whether the Git-ignored `games/` directory is maintained product source or local experimentation. Maintained games need a reproducible source/deployment/test boundary; local-only games must not be implied to ship from a clean checkout.

### Scope and Sign-Off

- [ ] Complete an exhaustive manual read if required: the audit scanned 411 eligible files, including 376 text files, and manually traced critical runtime/configuration paths, but did not manually review every line. Environment files, secret contents, dependencies, and generated trees were excluded from source inspection. Do not treat the audit as security certification or hosted deployment sign-off.
