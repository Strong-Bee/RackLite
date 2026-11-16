const FIELD_LIMITS: Array<{ name: string; min: number; max: number }> = [
  { name: 'menit', min: 0, max: 59 },
  { name: 'jam', min: 0, max: 23 },
  { name: 'tanggal', min: 1, max: 31 },
  { name: 'bulan', min: 1, max: 12 },
  { name: 'hari', min: 0, max: 7 },
];

const SPECIAL_MACROS = new Set([
  '@reboot',
  '@yearly',
  '@annually',
  '@monthly',
  '@weekly',
  '@daily',
  '@midnight',
  '@hourly',
]);

function isValidCronField(field: string, min: number, max: number): boolean {
  if (!field) return false;
  const parts = field.split(',');
  for (const part of parts) {
    if (!part) return false;
    const stepSplit = part.split('/');
    if (stepSplit.length > 2) return false;

    const [rangePart, stepPart] = stepSplit;
    if (stepPart !== undefined) {
      if (!/^\d+$/.test(stepPart)) return false;
      const step = Number(stepPart);
      if (step < 1 || step > max) return false;
    }

    if (rangePart === '*') continue;

    if (rangePart.includes('-')) {
      const bounds = rangePart.split('-');
      if (bounds.length !== 2) return false;
      if (!/^\d+$/.test(bounds[0]) || !/^\d+$/.test(bounds[1])) return false;
      const start = Number(bounds[0]);
      const end = Number(bounds[1]);
      if (start < min || end > max || start > end) return false;
    } else {
      if (!/^\d+$/.test(rangePart)) return false;
      const val = Number(rangePart);
      if (val < min || val > max) return false;
    }
  }
  return true;
}

/**
 * Validasi ekspresi cron 5-kolom standar atau macro @daily/@hourly/@reboot.
 */
export function validateCronExpression(expr: string): {
  valid: boolean;
  reason?: string;
} {
  const trimmed = expr.trim();
  if (!trimmed) {
    return { valid: false, reason: 'Ekspresi cron tidak boleh kosong.' };
  }
  if (SPECIAL_MACROS.has(trimmed)) {
    return { valid: true };
  }

  const tokens = trimmed.split(/\s+/);
  if (tokens.length !== 5) {
    return {
      valid: false,
      reason: 'Ekspresi cron harus terdiri dari 5 bagian (menit jam tanggal bulan hari).',
    };
  }

  for (let i = 0; i < 5; i++) {
    const { name, min, max } = FIELD_LIMITS[i];
    if (!isValidCronField(tokens[i], min, max)) {
      return {
        valid: false,
        reason: `Bagian ${name} ("${tokens[i]}") tidak valid (rentang ${min}-${max}).`,
      };
    }
  }

  return { valid: true };
}

/**
 * Ringkasan jadwal cron yang mudah dibaca manusia.
 */
export function describeCronExpression(expr: string): string {
  const t = expr.trim();
  if (t === '@reboot') return 'Setiap kali sistem booting';
  if (t === '@hourly' || t === '0 * * * *') return 'Setiap jam pada menit ke-0';
  if (t === '@daily' || t === '0 0 * * *') return 'Setiap hari pukul 00:00';
  if (t === '@weekly' || t === '0 0 * * 0') return 'Setiap Minggu pukul 00:00';
  if (t === '@monthly' || t === '0 0 1 * *') return 'Setiap tanggal 1 pukul 00:00';
  if (t === '* * * * *') return 'Setiap menit';
  const m = /^\*\/(\d+) \* \* \* \*$/.exec(t);
  if (m) return `Setiap ${m[1]} menit`;
  const h = /^0 \*\/(\d+) \* \* \*$/.exec(t);
  if (h) return `Setiap ${h[1]} jam`;
  return `Jadwal kustom (${t})`;
}
