// Turns whatever a pose-model load rejected with into a short readable reason.
// MediaPipe's wasm loader appends a <script> and rejects with the raw error *Event* when it fails,
// so `(err as Error).message` was undefined ("Pose model failed to load: undefined", Checkpoint J).

function fileName(url: string): string {
  const path = url.split(/[?#]/)[0] ?? url;
  return path.slice(path.lastIndexOf('/') + 1) || path;
}

/** A readable reason for a pose-model load failure; never "undefined". */
export function describeLoadError(err: unknown): string {
  if (err === undefined || err === null) return 'unknown error';
  if (typeof err === 'string') return err || 'unknown error';
  if (typeof err !== 'object') return `error ${String(err)}`;
  if (err instanceof Error) return err.message || err.name || 'unknown error';
  const o = err as { type?: unknown; target?: unknown; message?: unknown };
  if (typeof o.message === 'string' && o.message) return o.message;
  if (typeof o.type === 'string' && 'target' in o) {
    const t = o.target as { src?: unknown; href?: unknown } | null;
    const src = typeof t?.src === 'string' ? t.src : typeof t?.href === 'string' ? t.href : '';
    return src ? `couldn't load ${fileName(src)}` : `couldn't load a pose file (${o.type} event)`;
  }
  return 'unknown error';
}

/** "couldn't load <file> (<reason>)" for our own fetches. */
export function fileLoadError(url: string, reason: string): Error {
  return new Error(`couldn't load ${fileName(url)} (${reason})`);
}
