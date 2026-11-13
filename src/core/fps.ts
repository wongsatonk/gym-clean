/** Rolling frames-per-second over the last second of `tick(t)` calls (t in ms). */
export class FpsMeter {
  private times: number[] = [];

  tick(t: number): void {
    this.times.push(t);
    while (this.times.length > 0 && (this.times[0] ?? t) < t - 1000) this.times.shift();
  }

  get fps(): number {
    const n = this.times.length;
    if (n < 2) return 0;
    const span = (this.times[n - 1] ?? 0) - (this.times[0] ?? 0);
    return span > 0 ? ((n - 1) * 1000) / span : 0;
  }
}
