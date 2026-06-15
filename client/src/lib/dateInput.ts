// Flexible DD/MM/YY date entry for the prescription Date field. The doctor can
// type the 6-digit shorthand DDMMYY (e.g. 030626 → 03/06/2026), or a slashed
// date (03/06/26, 3-6-2026). Stored internally as ISO "YYYY-MM-DD".

export function parseFlexibleDate(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  let dd: number, mm: number, yy: number;

  if (/[/.\-]/.test(s)) {
    const parts = s.split(/[/.\-]/).map((p) => p.trim()).filter(Boolean);
    if (parts.length < 3) return null;
    dd = +parts[0]; mm = +parts[1];
    const y = +parts[2];
    yy = y < 100 ? 2000 + y : y;
  } else {
    const digits = s.replace(/\D/g, "");
    if (digits.length === 6) {
      dd = +digits.slice(0, 2); mm = +digits.slice(2, 4); yy = 2000 + +digits.slice(4, 6);
    } else if (digits.length === 8) {
      dd = +digits.slice(0, 2); mm = +digits.slice(2, 4); yy = +digits.slice(4, 8);
    } else {
      return null;
    }
  }

  if (!dd || !mm || dd > 31 || mm > 12 || Number.isNaN(yy)) return null;
  return `${yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

// ISO "2026-06-03" → "03/06/2026". Returns the input unchanged if not ISO.
export function isoToDdmmyyyy(iso: string): string {
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : iso;
}
