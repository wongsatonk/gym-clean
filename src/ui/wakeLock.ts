// Keeps the screen on during a session. The browser drops the lock when the page is hidden,
// so it is re-requested when the page becomes visible again.

let sentinel: WakeLockSentinel | null = null;
let wanted = false;

async function acquire(): Promise<void> {
  if (!wanted || sentinel || !('wakeLock' in navigator)) return;
  try {
    sentinel = await navigator.wakeLock.request('screen');
    sentinel.addEventListener('release', () => {
      sentinel = null;
    });
  } catch {
    // Denied (e.g. low battery mode) — not fatal.
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void acquire();
});

export const wakeLock = {
  async hold(): Promise<void> {
    wanted = true;
    await acquire();
  },
  async release(): Promise<void> {
    wanted = false;
    const s = sentinel;
    sentinel = null;
    await s?.release();
  },
};
