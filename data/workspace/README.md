# RackLite — Panel Manajemen Server Linux Ringan

Panel kontrol server Linux minimalis berbasis **Next.js (App Router)**, **TypeScript**, **SQLite (`better-sqlite3`)**, dan **custom server WebSocket (`server.ts`)**. Dirancang sebagai alternatif ultra-ringan dari cPanel / aaPanel / CyberPanel dengan target konsumsi RAM idle di bawah **150 MB**.

---

## 1. Daftar Fitur Lengkap

1. **Autentikasi & Multi-User (`lib/auth.ts`, `/users`)**
   - Login/Logout dengan session **JWT** di cookie `httpOnly` + `SameSite=Lax`.
   - Hash kata sandi menggunakan `bcryptjs`.
   - Dukungan **2FA TOTP** (Google Authenticator / Authy) lengkap dengan generator QR Code.
   - Rate limiter percobaan login gagal (maksimal 5 kali per 5 menit per IP + username).
   - Multi-user dengan peran `admin` (akses penuh + Web Terminal) dan `user` (terbatas).
2. **Dashboard Monitoring (`/dashboard`)**
   - Pembacaan langsung dari kernel Linux (`/proc/stat`, `/proc/meminfo`, `/proc/net/dev`, `df`, `ps`).
   - Pemantauan **CPU, RAM, Swap, Disk, Network RX/TX, Load Average, Uptime**, dan **Proses Teratas**.
   - Pembaruan realtime melalui **Server-Sent Events (SSE)** setiap 3 detik (fallback polling otomatis) + grafik SVG tanpa library chart berat.
3. **File Manager (`/files`)**
   - Browse direktori terizinkan (`PANEL_FILE_ROOTS`), upload (hingga 50 MB), download, editor kode inline, rename, hapus, `chmod`, `chown` (admin), serta kompresi/ekstraksi **ZIP** dengan proteksi **Zip-Slip** & **Path Traversal**.
4. **Web Terminal (`/terminal`)**
   - Terminal interaktif berbasis **xterm.js** melalui WebSocket `/ws/terminal` pada `server.ts`.
   - Terautentikasi ketat via cookie JWT + verifikasi peran `admin`.
   - Mendukung `node-pty` maupun fallback PTY native Linux (`util-linux script`).
5. **Website Manager (`/websites`)**
   - Pembuatan & penghapusan virtual host **Nginx** (Static, PHP-FPM, Reverse Proxy).
   - Penerbitan sertifikat SSL **Let’s Encrypt (`certbot`)** + konfigurasi auto-renew timer & redirect HTTP ke HTTPS.
6. **Database Manager (`/databases`)**
   - Manajemen **MariaDB/MySQL** dan **PostgreSQL**: buat database, buat user, atur hak akses (`ALL PRIVILEGES`, Read/Write, Read Only), dan dump SQL.
7. **Service Manager (`/services`)**
   - Kontrol `systemctl` (`start`, `stop`, `restart`, `enable`, `disable`) untuk `nginx`, `mariadb`, `postgresql`, `php8.2-fpm`, `docker`, `ufw`, `ssh`, `cron` + pembacaan log `journalctl`.
8. **Cron Manager (`/cron`)**
   - Tambah/edit/hapus jadwal cron per user Linux lengkap dengan validator ekspresi cron dan sinkronisasi ke `crontab -u <user>`.
9. **Firewall & Open Ports (`/firewall`)**
   - Manajemen aturan **UFW** (`allow`/`deny` port, protokol, dan IP/CIDR) serta daftar port *listening* langsung dari `ss -tulnp`.
10. **Backup & Restore (`/backups`)**
    - Backup arsip `tar.gz` untuk berkas atau dump database ke penyimpanan lokal maupun **S3-Compatible Object Storage** (AWS SigV4 murni tanpa SDK berat), disertai fitur restore.
11. **Log Viewer (`/logs`)**
    - Pemantauan tail realtime (`panel.log`, Nginx access/error log, `syslog`) dengan filter kata kunci dan batas baca memori aman.
12. **Settings (`/settings`) & Audit Log (`/audit`)**
    - Pengaturan port panel, domain panel, IP whitelist (IPv4/CIDR), tema Gelap/Terang, bahasa Indonesia/Inggris, serta konfigurasi S3.
    - Pencatatan seluruh aksi kritis di tabel `audit_logs` (siapa, kapan, aksi, target, status, dan alamat IP).

---

## 2. Cara Menjalankan (Mode Development)

```bash
# 1. Salin berkas environment
cp .env.example .env

# 2. Pasang dependensi
npm install

# 3. Jalankan custom server (Next.js + WebSocket Terminal) di port 3000
npm run dev
```

Buka `http://localhost:3000` dan masuk dengan kredensial bawaan:
- **Username**: `admin`
- **Password**: `admin12345`

---

## 3. Cara Install di VPS (Ubuntu / Debian)

```bash
git clone <repo-url> racklite-panel
cd racklite-panel
sudo bash scripts/install.sh
```

Atau jalankan menggunakan **Docker**:

```bash
docker build -t racklite-panel .
docker run -d \
  --name racklite \
  -p 3000:3000 \
  -e PANEL_JWT_SECRET="$(openssl rand -hex 32)" \
  -v racklite_data:/app/data \
  racklite-panel
```

---

## 4. Catatan Keamanan

- **Zero String-Concat Shell Execution**: Seluruh perintah sistem dijalankan melalui `execFile`/`spawn` dengan array argumen dan whitelist biner di `lib/system/exec.ts`.
- **Validasi Input Ketat**: Setiap route handler API memvalidasi payload menggunakan **Zod** dan pola regex ketat (`lib/security.ts`).
- **Proteksi API & WebSocket**: Seluruh route `/api/*` dan WebSocket `/ws/terminal` memeriksa IP whitelist, CSRF Origin/Referer, cookie JWT `httpOnly`, status aktif user di SQLite, serta hak akses role.
- **Segera Ganti Kredensial Bawaan**: Ganti password `admin` dan atur `PANEL_JWT_SECRET` acak minimal 32 karakter sebelum mempublikasikan panel ke internet.

---

## 5. Roadmap

- [ ] Dukungan multi-node agent (monitoring beberapa VPS dari satu dashboard).
- [ ] Notifikasi peringatan resource (CPU/RAM/Disk penuh) via Telegram & Webhook.
- [ ] Manajemen Docker Container & Compose langsung dari UI.
- [ ] Penjadwalan otomatis backup cron internal di proses background panel.
