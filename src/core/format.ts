const pad = (n: number) => String(n).padStart(2, '0');

/** Rest clock: "1:30" counting down, "+0:12" once past target. */
export function formatRest(remainingMs: number): string {
  if (remainingMs >= 0) {
    const s = Math.ceil(remainingMs / 1000);
    return `${Math.floor(s / 60)}:${pad(s % 60)}`;
  }
  const s = Math.floor(-remainingMs / 1000);
  return `+${Math.floor(s / 60)}:${pad(s % 60)}`;
}

export function formatKg(kg: number): string {
  return kg.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

export function formatDuration(sec: number): string {
  const min = Math.max(1, Math.round(sec / 60));
  return min < 60 ? `${min} min` : `${Math.floor(min / 60)} h ${min % 60} min`;
}
