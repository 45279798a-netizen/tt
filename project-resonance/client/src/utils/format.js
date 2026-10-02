// 數字通膨顯示：過萬自動轉 K / M / B / T，再往上用 aa、ab、ac…
const UNITS = ['', 'K', 'M', 'B', 'T'];

export function fmt(n) {
  if (!Number.isFinite(n)) return '∞';
  const neg = n < 0;
  n = Math.abs(n);
  if (n < 10_000) return (neg ? '-' : '') + Math.floor(n).toLocaleString();

  const tier = Math.floor(Math.log10(n) / 3);
  let unit;
  if (tier < UNITS.length) {
    unit = UNITS[tier];
  } else {
    const i = tier - UNITS.length; // aa, ab, … az, ba …
    unit = String.fromCharCode(97 + Math.floor(i / 26)) + String.fromCharCode(97 + (i % 26));
  }
  const scaled = n / 1000 ** tier;
  const digits = scaled < 10 ? 2 : scaled < 100 ? 1 : 0;
  return (neg ? '-' : '') + scaled.toFixed(digits) + unit;
}

export function fmtRate(n) {
  return n < 10 ? n.toFixed(1) : fmt(n);
}

export function vibrate(pattern) {
  try { navigator.vibrate?.(pattern); } catch { /* iOS 不支援，忽略 */ }
}
