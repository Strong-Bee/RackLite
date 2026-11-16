# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**RackLite Panel** — A lightweight Linux server management panel built with Next.js 15 (App Router), TypeScript, SQLite (`better-sqlite3`), and a custom WebSocket server (`server.ts`). Designed as an ultra-lightweight alternative to cPanel/aaPanel/CyberPanel targeting <150 MB idle RAM.

## Common Development Commands

```bash
# Development (runs Next.js + WebSocket server on port 3000)
npm run dev

# Production build
npm run build

# Production start
npm run start

# Lint
npm run lint

# Clean Next.js cache
npm run clean
```

## High-Level Architecture

```
racklite-server-panel/
├── app/                          # Next.js App Router
│   ├── (panel)/                  # Protected panel routes (requires auth)
│   │   ├── audit/                # Audit log viewer
│   │   ├── backups/              # Backup & restore
│   │   ├── cron/                 # Cron job manager
│   │   ├── dashboard/            # System metrics (SSE real-time)
│   │   ├── databases/            # MariaDB/PostgreSQL manager
│   │   ├── files/                # File manager (browse, upload, edit, ZIP)
│   │   ├── firewall/             # UFW rules + open ports
│   │   ├── logs/                 # Log viewer (tail -f)
│   │   ├── services/             # systemctl manager
│   │   ├── settings/             # Panel settings (port, domain, IP whitelist, S3)
│   │   ├── terminal/             # Web terminal (xterm.js + WebSocket)
│   │   ├── users/                # User management
│   │   └── websites/             # Nginx vhost manager + Let's Encrypt
│   ├── api/                      # API routes
│   │   ├── auth/                 # login, logout, me, password, totp
│   │   ├── audit/                # GET audit logs
│   │   ├── backups/              # CRUD backups
│   │   ├── cron/                 # CRUD cron jobs
│   │   ├── databases/            # CRUD databases
│   │   ├── files/                # File operations (upload, download, delete)
│   │   ├── firewall/             # UFW rules
│   │   ├── health/               # Health check
│   │   ├── logs/                 # Log streaming
│   │   ├── metrics/              # System metrics (SSE + polling)
│   │   ├── services/             # systemctl operations
│   │   ├── settings/             # Panel settings
│   │   ├── users/                # User CRUD
│   │   └── websites/             # Website CRUD
│   ├── globals.css               # Tailwind v4 + custom styles
│   ├── layout.tsx                # Root layout
│   ├── login/page.tsx            # Login page
│   └── page.tsx                  # Redirects to /dashboard
├── components/                   # React components
│   ├── audit/                    # AuditClient
│   ├── backups/                  # BackupsClient
│   ├── cron/                     # CronClient
│   ├── dashboard/                # DashboardClient, MetricChart (SVG charts)
│   ├── databases/                # DatabasesClient
│   ├── files/                    # FileManagerClient
│   ├── firewall/                 # FirewallClient
│   ├── layout/                   # PanelShell, Providers, usePanel (context)
│   ├── logs/                     # LogsClient
│   ├── services/                 # ServicesClient
│   ├── settings/                 # SettingsClient
│   ├── terminal/                 # TerminalClient (xterm.js)
│   ├── ui/                       # Card, ConfirmDialog, EmptyState, Modal, Skeleton, TableSkeleton, DataTable, ToastItem, ToastContainer
│   ├── users/                    # UsersClient
│   └── websites/                 # WebsitesClient
├── hooks/
│   └── use-mobile.ts             # Mobile detection hook
├── lib/                          # Core utilities
│   ├── api-guard.ts              # Auth guard, rate limiting, audit logging
│   ├── auth.ts                   # JWT sessions, bcrypt, TOTP 2FA, rate limiter
│   ├── cron-utils.ts             # Cron expression validator/describer
│   ├── db.ts                     # SQLite init, schema, seed, logging
│   ├── i18n.ts                   # Translations (id/en)
│   ├── s3.ts                     # AWS SigV4 S3 upload (no SDK)
│   ├── security.ts               # Input validation regex, IP whitelist, CSRF
│   ├── system/                   # System operation modules
│   │   ├── backup.ts             # tar.gz backup/restore + S3
│   │   ├── cron.ts               # crontab sync
│   │   ├── database.ts           # MariaDB/PostgreSQL ops
│   │   ├── exec.ts               # Safe execFile with binary whitelist
│   │   ├── files.ts              # File ops with path traversal protection
│   │   ├── firewall.ts           # UFW management
│   │   ├── logs.ts               # Log tailing
│   │   ├── metrics.ts            # /proc parsing for system metrics
│   │   ├── nginx.ts              # Nginx vhost + certbot
│   │   └── services.ts           # systemctl wrapper
│   └── utils.ts                  # cn() className helper
├── middleware.ts                 # Auth middleware, security headers, IP whitelist
├── server.ts                     # Custom server: Next.js + WebSocket (/ws/terminal)
├── scripts/
│   ├── install.sh                # VPS installation script
│   ├── panel.service             # systemd service
│   └── seed.ts                   # Database seeding
├── .env.example                  # Environment template
├── next.config.ts                # Next.js config (standalone output)
├── tsconfig.json                 # TypeScript config
└── package.json                  # Dependencies
```

## Key Technical Decisions

### 1. Security-First Execution
- **Zero string-concat shell execution**: All system commands use `execFile`/`spawn` with argument arrays
- **Binary whitelist** (`lib/system/exec.ts:ALLOWED_BINARIES`): Only 27 allowed binaries
- **Strict input validation**: Zod schemas + regex patterns in `lib/security.ts`
- **IP whitelist** at middleware + WebSocket level
- **CSRF protection** via Origin/Referer/Sec-Fetch-Site headers
- **JWT in httpOnly cookie** with 12hr TTL, SameSite=Lax

### 2. Authentication Flow
- Login: `/api/auth/login` → validates credentials, checks rate limit (5 attempts/5min), verifies TOTP if enabled
- Session: JWT signed with HS256, secret from `PANEL_JWT_SECRET` env or auto-generated `.jwt-secret` file
- Middleware protects all routes except `/login`, `/api/auth/login`, `/api/health`
- WebSocket `/ws/terminal` requires admin role + valid JWT + IP whitelist

### 3. System Operations Pattern
Each system module in `lib/system/` follows:
```typescript
// Safe execution via exec.ts
const result = await runSystemCommand('binary', ['arg1', 'arg2']);
// Returns { ok, stdout, stderr, code, missingBinary }
```

### 4. Real-time Updates
- **Dashboard metrics**: Server-Sent Events (`/api/metrics/stream`) every 3s, fallback polling
- **Web Terminal**: WebSocket on custom `server.ts` with xterm.js frontend
- **Logs**: Polling with keyword filter and memory-safe limits

### 5. Database (SQLite + better-sqlite3)
- WAL mode, foreign keys enabled
- Tables: `users`, `settings`, `audit_logs`, `websites`, `databases`, `cron_jobs`, `firewall_rules`, `backups`
- Auto-seeds admin user (`admin`/`admin12345`) and default settings on first run

### 6. Internationalization
- `lib/i18n.ts` with `translations` object (id/en)
- `usePanel()` context provides `t` (translate) and `language`/`setLanguage`

## Important Files to Understand

| File | Purpose |
|------|---------|
| `server.ts` | Custom HTTP+WebSocket server, terminal PTY management |
| `middleware.ts` | Auth gate, security headers, IP whitelist enforcement |
| `lib/auth.ts` | JWT, bcrypt, TOTP 2FA, login rate limiter |
| `lib/security.ts` | Regex validators, IP/CIDR check, CSRF verification |
| `lib/system/exec.ts` | Safe command execution with binary whitelist |
| `lib/db.ts` | SQLite init, schema, seeding, panel logging |
| `lib/api-guard.ts` | `withAuth()` HOF for API routes, audit logging |
| `components/layout/Providers.tsx` | React context for theme, language, notifications |
| `app/(panel)/layout.tsx` | Server-side session validation, wraps PanelShell |

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | 3000 |
| `HOSTNAME` | Bind address | 0.0.0.0 |
| `PANEL_JWT_SECRET` | JWT signing secret (min 24 chars) | Auto-generated |
| `PANEL_ADMIN_USER` | Initial admin username | admin |
| `PANEL_ADMIN_PASS` | Initial admin password | admin12345 |
| `PANEL_DATA_DIR` | Data directory | ./data |
| `APP_URL` | Public URL for CSRF checks | - |
| `PANEL_STRICT_FRAME` | Enable X-Frame-Options | false |

## Deployment

### VPS (Ubuntu/Debian)
```bash
git clone <repo> racklite-panel
cd racklite-panel
sudo bash scripts/install.sh
```

### Docker
```bash
docker build -t racklite-panel .
docker run -d --name racklite -p 3000:3000 \
  -e PANEL_JWT_SECRET="$(openssl rand -hex 32)" \
  -v racklite_data:/app/data \
  racklite-panel
```

## Default Credentials (CHANGE IMMEDIATELY)
- **Username**: `admin`
- **Password**: `admin12345`

## Testing & Verification

```bash
# Run lint
npm run lint

# Type check
npx tsc --noEmit

# Build verification
npm run build
```

## Common Tasks

### Adding a New API Route
1. Create `app/api/<feature>/route.ts`
2. Use `withAuth()` from `lib/api-guard.ts` for protected routes
3. Validate input with Zod
4. Use `runSystemCommand()` from `lib/system/exec.ts` for system ops
5. Log audit via `recordAudit()`

### Adding a New Panel Page
1. Create `app/(panel)/<feature>/page.tsx`
2. Create client component in `components/<feature>/<Feature>Client.tsx`
3. Add navigation entry in `components/layout/PanelShell.tsx` navGroups
4. Use `usePanel()` for theme, language, notifications

### Adding a System Operation
1. Add binary to `ALLOWED_BINARIES` in `lib/system/exec.ts` if new
2. Create module in `lib/system/<feature>.ts` using `runSystemCommand()`
3. Expose via API route with proper validation

## Risk Areas & Gotchas

1. **WebSocket server** (`server.ts`) runs in same process as Next.js — terminal sessions persist across hot reloads in dev
2. **SQLite connections** are singleton via `globalThis.__rackliteDb` — no connection pooling needed
3. **Binary whitelist** must be updated when adding new system commands
4. **IP whitelist** empty = allow all; loopback always allowed
5. **File operations** restricted to `PANEL_FILE_ROOTS` (default: `/var/www`, `/home`, `/opt`, `/data/workspace`)
6. **TOTP 2FA** uses RFC 6238 with 30s period, 6 digits, SHA1 — compatible with Google Authenticator/Authy

## What I Skipped / Did Not Check

- Did not run `npm install` or verify dependency resolution
- Did not execute the build or test the dev server startup
- Did not verify the `scripts/install.sh` works on target Linux distros
- Did not audit the complete Zod validation schemas across all API routes
- The custom `server.ts` disables HMR in certain environments — behavior not verified