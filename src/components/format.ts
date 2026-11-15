export const fmt = (n: number, d = 1) => (Number.isFinite(n) ? n.toFixed(d) : '—');
export const fmtDate = (t: number) => new Date(t).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
