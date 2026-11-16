import { getDb } from '@/lib/db';

interface LoginAttempt {
  ipAddress: string;
  username?: string;
  success: boolean;
  userAgent?: string;
}

interface BlockedIP {
  id: number;
  ip_address: string;
  reason: string;
  threat_score: number;
  attempts_count: number;
  blocked_at: string;
  expires_at: string | null;
  is_permanent: number;
  created_by: string;
}

interface SecurityEvent {
  id: number;
  event_type: string;
  severity: 'info' | 'warning' | 'critical';
  ip_address: string | null;
  username: string | null;
  details: string;
  raw_data: string | null;
  created_at: string;
}

interface ThreatIntel {
  id: number;
  indicator_type: 'ip' | 'cidr' | 'asn' | 'country';
  indicator_value: string;
  source: string;
  confidence: number;
  tags: string | null;
  first_seen: string;
  last_seen: string;
  is_active: number;
}

const THREAT_THRESHOLD = 70;
const MAX_FAILED_ATTEMPTS = 10;
const BLOCK_DURATION_HOURS = 24;
const PERMANENT_BLOCK_THRESHOLD = 100;

/**
 * Catat percobaan login untuk deteksi ancaman
 */
export async function recordLoginAttempt(attempt: LoginAttempt): Promise<void> {
  const db = getDb();
  const threatScore = calculateThreatScore(attempt);

  db.prepare(`
    INSERT INTO login_attempts (ip_address, username, success, user_agent, threat_score)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    attempt.ipAddress,
    attempt.username || null,
    attempt.success ? 1 : 0,
    attempt.userAgent || null,
    threatScore
  );

  // Jika gagal, cek apakah perlu auto-block
  if (!attempt.success) {
    await checkAndAutoBlock(attempt.ipAddress, threatScore);
  }

  // Jika skor ancaman tinggi, catat security event
  if (threatScore >= THREAT_THRESHOLD) {
    await recordSecurityEvent({
      event_type: 'HIGH_THREAT_LOGIN',
      severity: threatScore >= PERMANENT_BLOCK_THRESHOLD ? 'critical' : 'warning',
      ip_address: attempt.ipAddress,
      username: attempt.username || null,
      details: `Login attempt with high threat score: ${threatScore}`,
      raw_data: JSON.stringify({ ...attempt, threatScore }),
    });
  }
}

/**
 * Hitung skor ancaman berdasarkan berbagai faktor
 */
function calculateThreatScore(attempt: LoginAttempt): number {
  let score = 0;

  // Faktor dasar: percobaan gagal
  if (!attempt.success) score += 10;

  // Cek user agent mencurigakan
  if (attempt.userAgent) {
    const ua = attempt.userAgent.toLowerCase();
    const suspiciousPatterns = [
      'bot', 'crawler', 'spider', 'scanner', 'hack', 'exploit',
      'sqlmap', 'nikto', 'nessus', 'burp', 'zap', 'w3af',
      'dirb', 'gobuster', 'feroxbuster', 'ffuf', 'wfuzz',
      'hydra', 'medusa', 'patator', 'john', 'hashcat',
      'nmap', 'masscan', 'zmap', 'shodan', 'censys',
      'curl', 'wget', 'python-requests', 'go-http-client',
      'java/', 'perl/', 'ruby/', 'php/', 'powershell'
    ];

    for (const pattern of suspiciousPatterns) {
      if (ua.includes(pattern)) {
        score += 20;
        break;
      }
    }

    // User agent kosong atau terlalu pendek
    if (attempt.userAgent.length < 20) {
      score += 15;
    }
  }

  // Cek apakah IP sudah pernah diblokir
  const db = getDb();
  const blocked = db.prepare('SELECT * FROM blocked_ips WHERE ip_address = ? AND (expires_at IS NULL OR expires_at > datetime(\'now\')) AND is_active = 1').get(attempt.ipAddress) as BlockedIP | undefined;
  if (blocked) {
    score += 50;
  }

  // Cek threat intelligence
  const intel = db.prepare('SELECT * FROM threat_intel WHERE indicator_type = ? AND indicator_value = ? AND is_active = 1').get('ip', attempt.ipAddress) as ThreatIntel | undefined;
  if (intel) {
    score += intel.confidence;
  }

  // Cek percobaan gagal terbaru dari IP yang sama
  const recentFailures = db.prepare(`
    SELECT COUNT(*) as count FROM login_attempts
    WHERE ip_address = ? AND success = 0
    AND created_at > datetime('now', '-1 hour')
  `).get(attempt.ipAddress) as { count: number };

  score += Math.min(recentFailures.count * 5, 50);

  // Cek percobaan dengan username berbeda (credential stuffing)
  const uniqueUsers = db.prepare(`
    SELECT COUNT(DISTINCT username) as count FROM login_attempts
    WHERE ip_address = ? AND username IS NOT NULL
    AND created_at > datetime('now', '-1 hour')
  `).get(attempt.ipAddress) as { count: number };

  if (uniqueUsers.count > 5) {
    score += 30;
  }

  return Math.min(score, 100);
}

/**
 * Cek dan auto-block IP berbahaya
 */
async function checkAndAutoBlock(ipAddress: string, threatScore: number): Promise<void> {
  const db = getDb();

  // Hitung total percobaan gagal dalam 24 jam
  const totalFailures = db.prepare(`
    SELECT COUNT(*) as count FROM login_attempts
    WHERE ip_address = ? AND success = 0
    AND created_at > datetime('now', '-24 hours')
  `).get(ipAddress) as { count: number };

  // Jika sudah terlalu banyak gagal atau skor sangat tinggi, blokir
  if (totalFailures.count >= MAX_FAILED_ATTEMPTS || threatScore >= PERMANENT_BLOCK_THRESHOLD) {
    const isPermanent = threatScore >= PERMANENT_BLOCK_THRESHOLD || totalFailures.count >= MAX_FAILED_ATTEMPTS * 2;

    const expiresAt = isPermanent ? null : new Date(Date.now() + BLOCK_DURATION_HOURS * 60 * 60 * 1000).toISOString();

    db.prepare(`
      INSERT OR REPLACE INTO blocked_ips (ip_address, reason, threat_score, attempts_count, expires_at, is_permanent, created_by)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      ipAddress,
      `Auto-blocked: ${totalFailures.count} failed attempts, threat score ${threatScore}`,
      threatScore,
      totalFailures.count,
      expiresAt,
      isPermanent ? 1 : 0,
      'auto'
    );

    await recordSecurityEvent({
      event_type: 'AUTO_BLOCK_IP',
      severity: isPermanent ? 'critical' : 'warning',
      ip_address: ipAddress,
      username: null,
      details: `IP auto-blocked: ${totalFailures.count} failed attempts, threat score ${threatScore}, permanent: ${isPermanent}`,
      raw_data: JSON.stringify({ ipAddress, totalFailures: totalFailures.count, threatScore, isPermanent }),
    });
  }
}

/**
 * Cek apakah IP diblokir
 */
export function isIpBlocked(ipAddress: string): { blocked: boolean; reason?: string; expiresAt?: string } {
  const db = getDb();
  const blocked = db.prepare(`
    SELECT * FROM blocked_ips
    WHERE ip_address = ?
    AND (expires_at IS NULL OR expires_at > datetime('now'))
  `).get(ipAddress) as BlockedIP | undefined;

  if (blocked) {
    return {
      blocked: true,
      reason: blocked.reason,
      expiresAt: blocked.expires_at || undefined,
    };
  }
  return { blocked: false };
}

/**
 * Blokir IP manual
 */
export function blockIpManually(ipAddress: string, reason: string, permanent: boolean = false, createdBy: string = 'admin'): void {
  const db = getDb();
  const expiresAt = permanent ? null : new Date(Date.now() + BLOCK_DURATION_HOURS * 60 * 60 * 1000).toISOString();

  db.prepare(`
    INSERT OR REPLACE INTO blocked_ips (ip_address, reason, threat_score, attempts_count, expires_at, is_permanent, created_by)
    VALUES (?, ?, ?, 0, ?, ?, ?)
  `).run(ipAddress, reason, 80, expiresAt, permanent ? 1 : 0, createdBy);
}

/**
 * Unblock IP
 */
export function unblockIp(ipAddress: string): void {
  const db = getDb();
  db.prepare('DELETE FROM blocked_ips WHERE ip_address = ?').run(ipAddress);
}

/**
 * Catat security event
 */
async function recordSecurityEvent(event: Omit<SecurityEvent, 'id' | 'created_at'>): Promise<void> {
  const db = getDb();
  db.prepare(`
    INSERT INTO security_events (event_type, severity, ip_address, username, details, raw_data)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(event.event_type, event.severity, event.ip_address, event.username, event.details, event.raw_data);
}

/**
 * Dapatkan security events untuk dashboard
 */
export function getSecurityEvents(limit: number = 50): SecurityEvent[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM security_events
    ORDER BY created_at DESC
    LIMIT ?
  `).all(limit) as SecurityEvent[];
}

/**
 * Dapatkan IP terblokir
 */
export function getBlockedIps(): BlockedIP[] {
  const db = getDb();
  return db.prepare(`
    SELECT * FROM blocked_ips
    ORDER BY blocked_at DESC
  `).all() as BlockedIP[];
}

/**
 * Dapatkan statistik keamanan
 */
export function getSecurityStats(): {
  totalAttempts: number;
  failedAttempts: number;
  blockedIps: number;
  criticalEvents: number;
  warningEvents: number;
  topAttackerIps: Array<{ ip: string; attempts: number; threatScore: number }>;
} {
  const db = getDb();

  const totalAttempts = db.prepare('SELECT COUNT(*) as count FROM login_attempts').get() as { count: number };
  const failedAttempts = db.prepare('SELECT COUNT(*) as count FROM login_attempts WHERE success = 0').get() as { count: number };
  const blockedIps = db.prepare('SELECT COUNT(*) as count FROM blocked_ips WHERE expires_at IS NULL OR expires_at > datetime(\'now\')').get() as { count: number };
  const criticalEvents = db.prepare('SELECT COUNT(*) as count FROM security_events WHERE severity = \'critical\' AND created_at > datetime(\'now\', \'-24 hours\')').get() as { count: number };
  const warningEvents = db.prepare('SELECT COUNT(*) as count FROM security_events WHERE severity = \'warning\' AND created_at > datetime(\'now\', \'-24 hours\')').get() as { count: number };

  const topAttackerIps = db.prepare(`
    SELECT ip_address as ip, COUNT(*) as attempts, MAX(threat_score) as threatScore
    FROM login_attempts
    WHERE success = 0 AND created_at > datetime('now', '-24 hours')
    GROUP BY ip_address
    ORDER BY attempts DESC
    LIMIT 10
  `).all() as Array<{ ip: string; attempts: number; threatScore: number }>;

  return {
    totalAttempts: totalAttempts.count,
    failedAttempts: failedAttempts.count,
    blockedIps: blockedIps.count,
    criticalEvents: criticalEvents.count,
    warningEvents: warningEvents.count,
    topAttackerIps,
  };
}

/**
 * Bersihkan data lama (dijalankan via cron)
 */
export function cleanupOldSecurityData(): void {
  const db = getDb();

  // Hapus login attempts > 30 hari
  db.prepare('DELETE FROM login_attempts WHERE created_at < datetime(\'now\', \'-30 days\')').run();

  // Hapus security events > 90 hari
  db.prepare('DELETE FROM security_events WHERE created_at < datetime(\'now\', \'-90 days\')').run();

  // Hapus expired blocks
  db.prepare('DELETE FROM blocked_ips WHERE expires_at IS NOT NULL AND expires_at < datetime(\'now\')').run();
}

/**
 * Update threat intelligence dari feed eksternal
 */
export function updateThreatIntel(indicators: Array<{ type: 'ip' | 'cidr' | 'asn' | 'country'; value: string; source: string; confidence: number; tags?: string }>): void {
  const db = getDb();
  const insert = db.prepare(`
    INSERT OR REPLACE INTO threat_intel (indicator_type, indicator_value, source, confidence, tags, last_seen)
    VALUES (?, ?, ?, ?, ?, datetime('now'))
  `);

  for (const indicator of indicators) {
    insert.run(indicator.type, indicator.value, indicator.source, indicator.confidence, indicator.tags || null);
  }
}