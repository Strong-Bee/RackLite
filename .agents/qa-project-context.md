# QA Project Context — RackLite Panel

> Single source of truth for all QA skills. Replace bracketed placeholders with evidenced values.

---

## Product

**Name:** RackLite Panel

**Description:** A lightweight Linux server management panel built with Next.js 15 (App Router), TypeScript, SQLite (better-sqlite3), and a custom WebSocket server. Targets <150 MB idle RAM as an ultra-lightweight alternative to cPanel/aaPanel/CyberPanel.

**Type:** Internal tool / Server management panel (self-hosted)

**URLs:**
- Development: `http://localhost:3000`
- Production: Self-hosted on user VPS (Ubuntu/Debian), no fixed URL

**Critical User Journeys (5–10):**
1. **Login & Authentication** — Admin logs in with username/password, optional TOTP 2FA, receives JWT in httpOnly cookie
2. **Dashboard Real-time Monitoring** — Views live CPU, memory, disk, network, process metrics via SSE (3s interval)
3. **File Management** — Browse, upload, download, edit, create, delete, zip/unzip, chmod/chown files in allowed roots
4. **Service Management** — Start/stop/restart/enable/disable systemd services (nginx, mariadb, postgresql, php-fpm)
5. **Website Management** — Create/edit/delete Nginx vhosts, issue/renew Let's Encrypt SSL certificates via Certbot
6. **Database Management** — Create/delete MariaDB and PostgreSQL databases/users, import/export SQL dumps
7. **Terminal Access** — Web-based terminal (xterm.js + WebSocket PTY) for admin shell access
8. **Backup & Restore** — Create tar.gz backups of websites/databases, optional S3 upload, restore from backup
9. **Firewall Management** — View/add/delete UFW rules, view open listening ports
10. **Cron Job Management** — Create/edit/delete cron jobs with expression validator, sync to system crontab

---

## Tech Stack

### Frontend
- **Framework:** Next.js 15.5.29 (App Router)
- **Language:** TypeScript 5.9.3
- **UI:** React 19.2.1, Tailwind CSS v4 (via @tailwindcss/postcss), lucide-react icons
- **State/Context:** React Context (Providers.tsx) for theme, language, notifications
- **Real-time:** Server-Sent Events (SSE) for metrics, WebSocket for terminal

### Backend
- **Runtime:** Node.js (tsx for dev, standalone output for prod)
- **API:** Next.js Route Handlers (App Router) + custom HTTP server (`server.ts`)
- **WebSocket:** `ws` 8.23.0 on `/ws/terminal` (same process as Next.js)
- **Auth:** JWT (HS256) in httpOnly cookie, bcryptjs 3.0.3, TOTP via otpauth 9.6.0
- **Database:** SQLite (better-sqlite3 13.2.0) — WAL mode, FK enabled, singleton via globalThis
- **Validation:** Zod 4.6.7 schemas on all API routes

### System Integration
- **Command Execution:** `execFile` only (no shell), binary whitelist (27 allowed binaries)
- **Linux:** df, ps, ss, uname, chmod, chown, tar, nginx, certbot, systemctl, journalctl, crontab, ufw, mysql, mysqldump, psql, pg_dump, which
- **Windows:** wmic, powershell (for metrics: Get-CimInstance, Get-NetAdapterStatistics, Get-Process, Get-CimInstance Win32_LogicalDisk)
- **File Ops:** Path traversal protection, restricted to PANEL_FILE_ROOTS (/var/www, /home, /opt, /data/workspace on Linux)

### Infrastructure
- **Hosting:** Self-hosted VPS (Ubuntu/Debian) or Docker
- **Process Manager:** systemd (scripts/panel.service) or Docker
- **Reverse Proxy:** Nginx (managed by panel)
- **SSL:** Let's Encrypt via Certbot (managed by panel)
- **Monitoring:** Built-in metrics SSE, panel logs to SQLite + console

### Package Manager
- **Lockfile:** bun.lock (Bun 1.x) — but runs on Node.js 20+ in production

---

## Test Stack

### E2E / Integration
- **Framework:** None selected yet — Playwright recommended (see playwright-automation)
- **Config Location:** N/A
- **Test Directory:** N/A

### Unit / Component
- **Framework:** None selected yet — Vitest recommended (see unit-testing)
- **Config Location:** N/A
- **Test Directory:** N/A

### API Testing
- **Framework:** None selected yet — Playwright APIRequestContext or Supertest recommended

### Visual Regression
- **Framework:** None selected yet

### Performance / Load
- **Framework:** None selected yet — k6 recommended (see performance-testing)

### Security Testing
- **Framework:** None selected yet — OWASP ZAP + Semgrep recommended (see security-testing)

### Accessibility
- **Framework:** None selected yet — axe-core + Playwright recommended (see accessibility-testing)

### Notes
- Zero test infrastructure exists. No test configs, no test files, no CI test runs.
- Default recommendations per Core Principle 3: Playwright (E2E), Vitest (unit).

---

## CI/CD

**Platform:** None configured (no `.github/workflows`, no `.gitlab-ci.yml`, no Jenkinsfile)

**When Tests Run:** N/A

**Sharding/Parallelism:** N/A

**Deploy Blockers:** None — manual deployment via `scripts/install.sh` on VPS or `docker build/run`

**Artifacts Saved:** None

**Notes:**
- Project uses `npm run build` → `npm run start` (production) or `npm run dev` (development)
- Docker build available: `docker build -t racklite-panel .`
- systemd service file at `scripts/panel.service`

---

## Environments

| Environment | URL | Infra Parity | Data | Third-party |
|-------------|-----|--------------|------|-------------|
| Development | `http://localhost:3000` | Windows host (dev machine) | SQLite file `data/panel.db`, workspace `data/workspace/` | None (mockable) |
| Production | Self-hosted VPS | Ubuntu/Debian Linux, systemd, Nginx, Certbot | SQLite on disk, real system services | Real: MariaDB, PostgreSQL, Nginx, Certbot, UFW, systemd, S3 |

**Parity Gaps:**
- Development runs on Windows (PowerShell metrics), production on Linux (`/proc`, `systemctl`)
- Windows dev: no systemd, no UFW, no Nginx/Certbot/MariaDB/PostgreSQL — services API returns "systemd tidak tersedia"
- File roots differ: Windows uses `./data/workspace`, Linux uses `/var/www`, `/home`, `/opt`, `/data/workspace`
- WebSocket terminal: Windows uses PowerShell PTY fallback, Linux uses node-pty or `script` command

**Mock Strategy:** No mock services configured. System calls go to real OS (or return "not available" on Windows).

---

## Quality Goals

| Metric | Current | Target (Early-stage) | Measurement |
|--------|---------|---------------------|-------------|
| Unit coverage | 0% | 60% on business logic (auth, crypto, validators, cron, s3, security) | Istanbul/V8 via Vitest |
| E2E coverage | 0% | Top 5 critical flows (login, dashboard SSE, files CRUD, terminal WS, websites CRUD) | Playwright |
| Flakiness rate | N/A | <2% over rolling 30-day window | CI test runs |
| Unit suite duration | N/A | <3 min | CI |
| E2E suite duration | N/A | <15 min with 4 shards | CI |
| TypeScript strict | ✅ Enabled | Maintain | `tsc --noEmit` |
| ESLint | ✅ Configured | Zero warnings | `npm run lint` |

**Maturity:** Early-stage startup (new project, no QA yet)

---

## Risk Areas

| Area | Risk Level | Business Impact | Likelihood | Notes |
|------|------------|-----------------|------------|-------|
| Authentication (JWT, bcrypt, TOTP, rate limit) | **Critical** | Catastrophic (full panel takeover) | Medium | Custom auth implementation; rate limiter in-memory (resets on restart) |
| Command Execution (execFile whitelist) | **Critical** | RCE if bypassed | Low | 27 binaries whitelisted; no shell interpolation; path traversal guards |
| WebSocket Terminal (admin only, PTY) | **Critical** | Full shell access as panel user | Low | Requires admin + JWT + IP whitelist; PTY runs in same process |
| File Operations (traversal, chmod/chown) | **Critical** | Data loss, privilege escalation | Medium | PANEL_FILE_ROOTS restricts roots; validation in lib/system/files.ts |
| Settings Persistence (SMTP, IP whitelist, JWT secret) | **High** | Lockout, config loss, weak secret | Low | JWT secret auto-generated if missing; stored in `.jwt-secret` file |
| Database Migrations (SQLite schema changes) | **High** | Data corruption, startup failure | Low | No migration system — schema in lib/db.ts init only |
| Cross-platform Metrics (Windows vs Linux) | **High** | Wrong metrics shown, dashboard broken | High | Two code paths in metrics.ts; Windows uses PowerShell, Linux uses /proc |
| Backup/Restore (tar, S3, encryption) | **Medium** | Data loss, incomplete restore | Medium | Custom tar.gz + S3 SigV4; no encryption at rest |
| Certificate Management (Certbot, Let's Encrypt) | **Medium** | HTTPS broken, cert expiry | Low | Runs certbot via exec; depends on DNS/port 80 |
| IP Whitelist / CSRF Protection | **Medium** | Bypass auth, lockout admin | Low | Middleware + WS check; CSRF via Origin/Referer headers |

**Scoring Method:** Impact × Likelihood (Critical = High×High/Med, Important = High×Low, Monitor = Low×High, Backlog = Low×Low)

**Evidence Gaps:**
- No production incident history (new project)
- Rate limiter persistence not verified (in-memory Map)
- WebSocket re-auth on reconnect not implemented
- CIDR validation edge cases not tested

---

## Team

**QA Engineers:** 0 (solo developer project)

**Developers:** 1

**Dev:QA Ratio:** Effectively infinite (solo)

**Methodology:** Informal / self-directed

**QA Engagement:** Developer owns all tests (strategy + critical-path E2E + unit)

**Automation Ownership Model:** Solo dev model — devs write all tests; lean on low-barrier automation (Playwright + Vitest) and CI gates when added.

---

## Conventions

**Test File Naming:** Not established yet. Recommended: `*.test.ts` (unit), `*.spec.ts` (E2E), co-located with source or in `tests/`

**Test Directory Structure:** Not established. Recommended:
```
tests/
  e2e/           # Playwright E2E
  unit/          # Vitest unit
  fixtures/      # Shared test data
```

**Branching Strategy:** Not enforced. Recommended: trunk-based with short-lived feature branches, PR required for main

**PR Requirements:** Not enforced. Recommended: lint + typecheck + unit tests pass; E2E on staging

**Selector Strategy (E2E):** Not established. Recommended: `data-testid` (kebab-case) for stability — e.g., `data-testid="login-submit-button"`, `data-testid="dashboard-cpu-chart"`

**Test Data Strategy:** Not established. Recommended: API-per-test for E2E (create via API, cleanup after), fixtures for unit, seeded SQLite for integration

**Naming Conventions:** Not established. Recommended: `describe("feature")` → `it("should behavior when condition")` for Vitest; `test("user can flow", async ({page}) => {})` for Playwright

---

## Verification Checklist

- [x] Product: 10 critical flows identified from codebase
- [x] Tech Stack: All detected from package.json, next.config.ts, server.ts, lib/
- [x] Test Stack: Explicitly "None selected yet" with defaults noted
- [x] CI/CD: Confirmed none (no workflow files)
- [x] Environments: Dev (Windows) vs Prod (Linux) parity gaps documented
- [x] Quality Goals: Numeric targets set for early-stage maturity
- [x] Risk Areas: 10 entries with Impact×Likelihood, evidence gaps noted
- [x] Team: Solo dev model documented
- [x] Conventions: Recommendations provided for future adoption

**Next Skill:** `test-strategy` (define test pyramid, tool selection, quality gates)