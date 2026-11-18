/**
 * utils.js — Format & utilitas global
 * Monstar Burgers Order Manager
 */

/**
 * Format angka ke Rupiah: Rp32.000
 */
export function formatRupiah(angka) {
  const n = Number(angka) || 0;
  return 'Rp' + n.toLocaleString('id-ID');
}

/**
 * Format ISO timestamp ke tampilan Indonesia, zona Asia/Jakarta.
 * Contoh: "Sen, 17 Nov 2026 · 14:35"
 */
export function formatWaktu(isoString) {
  if (!isoString) return '—';
  try {
    const d = new Date(isoString);
    return d.toLocaleString('id-ID', {
      timeZone: 'Asia/Jakarta',
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

/**
 * Format menit ke "5 mnt" atau "1 j 5 mnt"
 */
export function formatMenit(menit) {
  if (menit < 60) return `${menit} mnt`;
  const j = Math.floor(menit / 60);
  const m = menit % 60;
  return m > 0 ? `${j} j ${m} mnt` : `${j} j`;
}

/**
 * Escape HTML untuk interpolasi aman ke innerHTML.
 */
export function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Format tanggal ISO ke "YYYY-MM-DD" zona Jakarta.
 */
export function toDateStr(isoString) {
  if (!isoString) return '';
  const d = new Date(isoString);
  return d.toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' }); // YYYY-MM-DD
}

/**
 * Tanggal hari ini di zona Jakarta dalam format "YYYY-MM-DD".
 */
export function todayStr() {
  return new Date().toLocaleDateString('sv-SE', { timeZone: 'Asia/Jakarta' });
}

/**
 * Tampilkan toast. (Wrapper — implementasi asli di app.js)
 * Diekspor di sini juga untuk kemudahan import sirkular.
 */
// showToast diexport dari app.js, bukan utils.js — jangan duplikat di sini.
