# QA Strategy — RackLite Panel

**Version:** 1.0  
**Owner:** Solo Developer  
**Last Updated:** 2026-11-16  
**Review Cadence:** Quarterly (next: 2027-02-16)  
**Status:** Active — Phase 1 Foundation

---

### 1. Scope & Objectives

**In Scope:**
- All 10 critical user journeys (login/auth, dashboard SSE, files CRUD, services, websites, databases, terminal WS, backups, firewall, cron)
- Next.js 15 frontend (React 19, Tailwind v4, TypeScript)
- Custom Node.js backend (Route Handlers + `server.ts` WebSocket)
- SQLite persistence (better-sqlite3), system command execution via binary whitelist
- Cross-platform metrics (Windows dev / Linux prod)
- Self-hosted deployment (VPS Ubuntu/Debian, Docker, systemd)

**Out of Scope:**
- Third-party services (MariaDB, PostgreSQL, Nginx, Certbot, UFW, systemd, S3) — tested only at contract/integration boundary via panel APIs
- Host OS kernel, hardware, network infrastructure
- Mobile browsers (panel targets desktop admin usage)
- Legacy browser support (modern evergreen only)

**Objectives (Q1 2027):**
1. Reduce defect escape rate from unknown baseline to <5% by establishing CI gates
2. Achieve 60% unit coverage on business logic (auth, crypto, validators, cron, s3, security)
3. Cover top 5 critical flows with automated E2E (login, dashboard SSE, files CRUD, terminal WS, websites CRUD)
4. Establish CI pipeline with PR gate (<3 min), merge gate (<10 min), nightly full suite (<30 min)
5. Document and enforce test conventions (selectors, naming, data strategy)

---

### 2. Test Levels & Types

| Level | What It Validates | Owner | Framework | Target Count | Run Frequency |
|-------|-------------------|-------|-----------|-------------|---------------|
| **Unit** | Pure functions: auth (JWT, bcrypt, TOTP, rate limiter), crypto (S3 SigV4), validators (security.ts), cron utils, i18n, security regex, API guards | Developer | Vitest | ~200 tests (70-80%) | Every commit (PR) |
| **Integration** | API routes + SQLite (auth, settings, websites, databases, backups, cron, firewall, audit), system command wrappers (exec.ts, metrics.ts, backup.ts, nginx.ts, database.ts) | Developer | Vitest + Testcontainers (SQLite in-memory) | ~50 tests (15-20%) | Every PR |
| **E2E** | Critical user journeys via browser: login → dashboard SSE → files CRUD → terminal WS → websites CRUD | Developer | Playwright | ~15 tests (5-10%) | Pre-deploy + nightly |
| **API** | All 27+ route handlers: schema validation, auth guards, error codes, rate limits | Developer | Playwright APIRequestContext | Per endpoint | Every PR |
| **Visual** | Dashboard charts (SVG), modal dialogs, tables, responsive breakpoints | Developer | Playwright screenshots | ~10 key pages | Nightly |
| **Performance** | SSE latency (<500ms), WebSocket terminal keystroke latency (<100ms), panel RSS <150MB idle, build time | Developer | k6 + Lighthouse CI | Critical paths | Weekly + pre-release |
| **Security** | OWASP Top 10 scan, dependency vulns (npm audit), auth bypass attempts, command injection attempts, path traversal | Developer | OWASP ZAP + Semgrep + npm audit | Per release | Pre-release + monthly scheduled |
| **Accessibility** | WCAG 2.2 AA on login, dashboard, files, terminal, settings | Developer | axe-core + Playwright | Key flows | Every PR |

---

### 3. Test Pyramid Analysis

**Current State:** Hourglass → Zero tests at all levels (new project, no QA yet)

| Level | Current Count | Current % | Target % | Target Count |
|-------|--------------|-----------|----------|-------------|
| Unit | 0 | 0% | 75% | ~200 |
| Integration | 0 | 0% | 18% | ~50 |
| E2E | 0 | 0% | 7% | ~15 |
| **Total** | **0** | **0%** | **100%** | **~265** |

**CI Duration Targets:**
- Unit + Integration: <3 min (PR gate)
- E2E Smoke: <5 min (merge gate)
- Full E2E + Visual + Perf: <30 min (nightly)

**Flakiness Target:** <2% over rolling 30-day window

**Action Plan (Hourglass → Healthy Pyramid):**
1. **Phase 1 (Weeks 1-2):** Set up Vitest + Playwright configs, CI pipeline. Write unit tests for top 5 highest-risk modules (auth, security, s3, cron, validators).
2. **Phase 2 (Weeks 3-4):** Add integration tests for all API routes using in-memory SQLite. Target 60% unit coverage on business logic.
3. **Phase 3 (Weeks 5-8):** Write E2E tests for top 5 critical flows. Add visual regression for dashboard and key modals.
3. **Phase 4 (Weeks 9-12):** Implement all four quality gates (PR, merge, deploy, nightly). Add performance benchmarks and security scans.
4. **Ongoing:** Quarterly pyramid ratio audit; freeze E2E growth if ratio drifts >10% from target.

---

### 4. Risk Assessment Matrix

From `.agents/qa-project-context.md` Risk Areas, scored Impact (1-5) × Likelihood (1-5):

| Feature Area | Impact | Likelihood | Score | Level | Testing Approach |
|-------------|--------|------------|-------|-------|-----------------|
| Authentication (JWT, bcrypt, TOTP, rate limit) | 5 | 3 | 15 | **CRITICAL** | Unit (all branches) + Integration (login flow) + E2E (login + session) + Security scan |
| Command Execution (execFile whitelist) | 5 | 2 | 10 | **HIGH** | Unit (whitelist bypass attempts) + Integration (exec.ts) + Security (injection attempts) |
| WebSocket Terminal (admin only, PTY) | 5 | 2 | 10 | **HIGH** | Integration (WS auth) + E2E (terminal session) + Security (privilege escalation) |
| File Operations (traversal, chmod/chown) | 5 | 3 | 15 | **CRITICAL** | Unit (path validation) + Integration (files API) + E2E (file CRUD) + Security (traversal) |
| Settings Persistence (SMTP, IP whitelist, JWT secret) | 4 | 2 | 8 | **MEDIUM** | Unit (settings validation) + Integration (settings API) + E2E (settings save) |
| Database Migrations (SQLite schema) | 4 | 2 | 8 | **MEDIUM** | Unit (schema init) + Integration (migration simulation) |
| Cross-platform Metrics (Windows vs Linux) | 4 | 4 | 16 | **CRITICAL** | Unit (metrics.ts both paths) + Integration (metrics API) + E2E (dashboard SSE) |
| Backup/Restore (tar, S3, encryption) | 3 | 3 | 9 | **MEDIUM** | Unit (backup.ts, s3.ts) + Integration (backup API) + E2E (create/restore) |
| Certificate Management (Certbot) | 3 | 2 | 6 | **MEDIUM** | Integration (website SSL API) + E2E (cert issue/renew) |
| IP Whitelist / CSRF Protection | 3 | 2 | 6 | **MEDIUM** | Unit (security.ts) + Integration (middleware + WS) + E2E (login from blocked IP) |

**Risk Level Actions:**
- **CRITICAL (15-25):** Full automation mandatory every commit, real-time monitoring
- **HIGH (10-14):** Full automation mandatory every PR, daily dashboard review
- **MEDIUM (5-9):** Happy-path automation + key error cases, weekly review
- **LOW (1-4):** Manual verification, no automation required

---

### 5. Environment Strategy

| Environment | Purpose | Test Types | Data | Deploy Trigger |
|------------|---------|------------|------|---------------|
| **Local** | Developer feedback loop | Unit, Integration (in-memory SQLite), Lint, Typecheck | Mocked / seeded via fixtures | On save (watch mode) |
| **CI (GitHub Actions)** | Automated validation gate | Unit, Integration, API, SAST, Typecheck, Lint | Ephemeral SQLite (Testcontainers or :memory:) | On push/PR |
| **Staging (Preview)** | Pre-production validation | E2E Smoke, Visual, Accessibility | Production-like (anonymized), real MariaDB/PostgreSQL if available | On merge to main (Vercel preview or VPS staging) |
| **Production** | Monitoring & smoke | Synthetic monitoring, Smoke tests, Health checks | Live | On deploy (manual or tagged release) |

**Parity Mitigation:**
- Windows dev cannot test systemd, UFW, Nginx, Certbot, MariaDB, PostgreSQL → these paths covered only in CI (Linux runner) and Staging
- Metrics dual-path tested via unit tests mocking both `os.platform()` returns
- WebSocket terminal: PowerShell PTY on Windows, node-pty on Linux → test both in CI matrix

**Test Data:**
- Unit: fixtures in `tests/fixtures/`
- Integration: seeded SQLite via `scripts/seed.ts` + per-test transactions (rollback)
- E2E: API-per-test (create via API, cleanup in `afterEach`), dedicated test users
- Staging: anonymized production dump (scripts to be written)

---

### 6. Tool Selection Rationale

| Criteria (weight) | **Vitest** | **Jest** | **Playwright** | **Cypress** | **k6** | **OWASP ZAP** |
|-------------------|------------|----------|----------------|-------------|--------|---------------|
| Fits tech stack (25%) | 5 (Vite/TS native, Next.js compat) | 4 (needs config) | 5 (Next.js, TS, multi-browser) | 3 (no native TS, heavier) | 5 (CLI, scriptable) | 4 (Docker, API) |
| Team familiarity (20%) | 5 (solo, modern) | 3 (legacy) | 5 (solo, modern) | 2 (none) | 4 (known) | 3 (learning) |
| Community & docs (15%) | 5 (excellent) | 5 (mature) | 5 (excellent) | 5 (excellent) | 4 (good) | 4 (good) |
| CI integration (15%) | 5 (native) | 4 (mature) | 5 (GitHub Actions native) | 4 (GitHub Actions) | 5 (CLI) | 3 (Docker) |
| Maintenance cost (10%) | 4 (fast, low) | 3 (slower) | 4 (browser updates) | 3 (browser + deps) | 4 (binary) | 3 (Docker) |
| Speed of execution (10%) | 5 (parallel, V8) | 3 (slower) | 3 (browser overhead) | 3 (browser overhead) | 5 (native) | 2 (slow) |
| License cost (5%) | 5 (MIT) | 5 (MIT) | 5 (Apache 2.0) | 5 (MIT) | 5 (AGPL) | 5 (Apache 2.0) |
| **Weighted Total** | **4.85** | **3.85** | **4.55** | **3.40** | **4.55** | **3.55** |

**Selected Stack:**
- **Unit + Integration:** Vitest (Vite-native, TypeScript-first, fast, built-in coverage)
- **E2E + API + Visual + Accessibility:** Playwright (single tool for browser, API, visual, a11y; TypeScript-first; GitHub Actions native)
- **Performance:** k6 (scriptable, CI-friendly, Prometheus output)
- **Security:** OWASP ZAP (DAST) + Semgrep (SAST) + npm audit (supply chain)

**Deviations from Common Stack:**
- No Testing Library (React component testing not a priority — panel is server-rendered + client islands)
- No MSW (system integration tests hit real OS commands; mocking at exec.ts boundary instead)
- No Testcontainers initially — SQLite `:memory:` sufficient; add for MariaDB/PostgreSQL integration later

---

### 7. CI Scaling Levers

| Lever | When to Pull | Target Efficiency |
|-------|--------------|-------------------|
| **Sharding** | E2E > 10 min | Playwright `--shard=1/4` → 4x parallel, efficiency >3x |
| **Test Impact Analysis** | PR suite > 5 min | Vitest `--changed` + Playwright affected-files (via Nx or custom) |
| **Caching** | Always | `node_modules`, `.next`, Playwright browsers, k6 binary |
| **Selective E2E** | PR feedback > 5 min | Smoke E2E (5 tests) on PR, full E2E on merge/nightly |
| **Parallel Unit** | Unit > 2 min | Vitest `pool: 'threads'`, `poolOptions.threads.maxThreads: 4` |

**Metrics to Track:**
- **CI-minutes-per-PR** — target flat or decreasing
- **Parallel Efficiency** = Summed test time ÷ Wall-clock time — target >3x on 4 shards
- **Flakiness Rate** — target <2%, quarantine >3 flakes/week

---

### 8. Entry/Exit Criteria

**Unit (every commit):**
- Entry: `tsc --noEmit` passes, function has documented JSDoc/types
- Exit: All branches covered, edge cases tested (empty, zero, negative, overflow, Unicode), no `test.skip`, coverage ≥60% on business logic modules

**Integration (every PR):**
- Entry: Unit tests pass, SQLite `:memory:` available, test seed data loaded
- Exit: All API routes tested (happy path + 400/401/403/404/500), error paths validated, no flaky tests, no console errors

**E2E (pre-deploy + nightly):**
- Entry: Integration tests pass, staging deployed, test users provisioned, SSE/WS reachable
- Exit: All 5 critical flows pass, no P0/P1 defects, SSE latency <500ms, WS keystroke <100ms, panel RSS <150MB idle

**Release (tagged deploy):**
- Entry: All test levels pass, no CRITICAL/HIGH defects open, release notes drafted, rollback plan verified
- Exit: Smoke tests pass in production (health, login, dashboard), monitoring shows no anomalies for 30 min bake, rollback tested in staging

---

### 9. Quality Gates & Definition of Done

**PR Gate (every push/PR):**
- ✅ `npm run lint` — zero warnings
- ✅ `npx tsc --noEmit` — zero errors
- ✅ Unit tests pass (`vitest run`)
- ✅ Integration tests pass (`vitest run --project=integration`)
- ✅ Coverage does not decrease (or meets 60% on business logic)
- ✅ SAST (Semgrep) — no new high/critical
- ✅ Bundle size (Next.js) — within 10% of baseline

**Merge Gate (merge to main):**
- ✅ All PR gate checks pass
- ✅ E2E Smoke Suite passes (5 critical flows) against preview deployment
- ✅ Visual regression — no unexpected diffs on key pages
- ✅ Accessibility scan (axe) — zero critical/serious violations
- ✅ No merge conflicts, branch up to date with main

**Deploy Gate (before production deploy):**
- ✅ Full E2E suite passes on staging (all 15 tests)
- ✅ Performance benchmarks within range (SSE <500ms, WS <100ms, RSS <150MB)
- ✅ Security scan passes (ZAP baseline + npm audit moderate+)
- ✅ Feature flags configured (if any)
- ✅ Rollback plan documented and tested in staging

**Nightly Gate (scheduled 02:00 UTC):**
- ✅ Full E2E including edge cases (invalid inputs, network failures)
- ✅ Visual regression full suite
- ✅ Performance/load test (k6: 50 VU, 5 min, SSE + WS)
- ✅ Accessibility full scan
- ✅ Dependency vulnerability scan (npm audit + OSV-Scanner)
- ✅ Results reviewed next morning; flaky tests quarantined

**Gate Enforcement:** All gates implemented as required GitHub Actions checks — cannot be bypassed without admin override (audited).

---

### 10. Metrics & KPIs

| Metric | Definition | Target | Cadence |
|--------|-----------|--------|---------|
| **Code Coverage** | Lines/branches covered by unit + integration on business logic | >60% business logic, >40% overall | Per PR |
| **Test Pyramid Ratio** | Unit:Integration:E2E split by test count | 75:18:7 (±10% tolerance) | Monthly |
| **Flakiness Rate** | % of CI runs with non-deterministic failures | <2% over 30-day rolling | Weekly |
| **Defect Escape Rate** | % of defects found in prod vs. total reported | <5% | Per release |
| **MTTR** | Detection to fix deployed | <4h P0, <24h P1, <1w P2 | Per incident |
| **CI Pipeline Duration** | Push to green/red signal | <3 min PR, <5 min merge, <30 min nightly | Weekly |
| **CI Parallel Efficiency** | Summed test time ÷ wall-clock time | >3x on 4 shards | Weekly |
| **CI-Minutes-per-PR** | Billed GitHub Actions minutes per PR | Flat or decreasing | Monthly |
| **Defect Density** | Defects per 1000 LOC (business logic only) | Decreasing trend | Monthly |
| **Automation Rate** | % of test cases automated (regression suite) | >80% | Quarterly |
| **False Positive Rate** | % of CI failures that are not real bugs | <5% | Weekly |
| **SSE Latency (P95)** | Server-sent event delivery time | <500ms | Nightly |
| **WS Keystroke Latency (P95)** | Terminal input to echo | <100ms | Nightly |
| **Panel RSS (idle)** | Process memory at rest | <150 MB | Nightly |

---

### 11. Timeline & Milestones

| Phase | Weeks | Focus | Exit Criteria |
|-------|-------|-------|---------------|
| **1 — Foundation** | 1-4 | Risk assessment ✅, CI pipeline, Vitest + Playwright setup, unit tests top 5 risk modules, baseline metrics | CI runs unit+integration on every PR, baseline metrics documented, 60% coverage on auth/security/s3/cron/validators |
| **2 — Coverage Expansion** | 5-10 | Integration tests all API routes, E2E top 5 critical flows, visual regression key pages, test data management, nightly runs | All critical paths have E2E coverage, integration covers all 27+ API routes, visual regression on 10 pages |
| **3 — Quality Gates** | 11-14 | Coverage gates on PRs, performance benchmarks in CI, security scanning (ZAP + Semgrep), monitoring dashboards | All 4 gates (PR, merge, deploy, nightly) active and enforced, no gate bypasses |
| **4 — Optimization** | 15-20 | Flake quarantine, CI scaling (sharding, caching, impact analysis), synthetic monitoring prod, first quarterly review | CI <3 min PR, flakiness <2%, first strategy revision published |

**Ongoing:** Quarterly strategy review (revise risk matrix, pyramid targets, tool choices); monthly metrics review; continuous maintenance (refactor, de-flake, retire obsolete tests).

---

### 12. Dependencies & Blockers

| Dependency | Status | Mitigation |
|------------|--------|------------|
| GitHub Actions (CI) | Not configured | Phase 1: create `.github/workflows/ci.yml` |
| Staging environment | Not provisioned | Phase 1: Vercel preview or VPS staging via Docker |
| Testcontainers / SQLite `:memory:` | Available | Use `better-sqlite3` in-memory for integration |
| Playwright browsers | Auto-install in CI | `npx playwright install --with-deps chromium` |
| k6 binary | Available in CI | GitHub Actions `grafana/k6-action` |
| OWASP ZAP | Docker image | `zaproxy/zap-stable` weekly scan |
| Semgrep rules | Community ruleset | `semgrep --config=auto` in CI |

---

### 13. Revision History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 1.0 | 2026-11-16 | Solo Developer | Initial strategy from qa-project-context.md |

---

**Next Skill:** `test-planning` (build first sprint test plan with feature-to-test-case mapping)