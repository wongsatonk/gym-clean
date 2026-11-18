// Saves a file the user asked for (backup, Coach eval report, developer log, gym kit, share image).
// The iPhone app's WKWebView ignores an <a download> click, so the system share sheet comes first
// whenever it takes files (Save to Files, AirDrop, …); desktop browsers fall back to a download
// link. Nothing is uploaded: no fetch, no new origin.

export type SaveResult = 'shared' | 'downloaded' | 'cancelled';

export type SaveEnv = {
  nav?: Pick<Navigator, 'share' | 'canShare'> | undefined;
  doc?: Pick<Document, 'createElement' | 'body'> | undefined;
  createObjectURL?: ((b: Blob) => string) | undefined;
  revokeObjectURL?: ((url: string) => void) | undefined;
};

/**
 * The share sheet when it can share this file, else a download. A cancelled share sheet is
 * 'cancelled' (no download behind his back); any other share error downloads instead.
 */
export async function saveFile(
  blob: Blob,
  name: string,
  title: string,
  env: SaveEnv = {},
): Promise<SaveResult> {
  const nav = 'nav' in env ? env.nav : typeof navigator === 'undefined' ? undefined : navigator;
  const FileCtor = (globalThis as { File?: typeof File }).File;
  if (nav && typeof nav.share === 'function' && typeof nav.canShare === 'function' && FileCtor) {
    const file = new FileCtor([blob], name, { type: blob.type });
    const data = { files: [file], title };
    let ok: boolean;
    try {
      ok = nav.canShare(data);
    } catch {
      ok = false;
    }
    if (ok) {
      try {
        await nav.share(data);
        return 'shared';
      } catch (e) {
        if ((e as { name?: string } | null)?.name === 'AbortError') return 'cancelled';
      }
    }
  }
  const doc = env.doc ?? document;
  const toUrl = env.createObjectURL ?? ((b: Blob) => URL.createObjectURL(b));
  const revoke = env.revokeObjectURL ?? ((u: string) => URL.revokeObjectURL(u));
  const url = toUrl(blob);
  const a = doc.createElement('a');
  a.href = url;
  a.download = name;
  a.rel = 'noopener';
  doc.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => revoke(url), 10_000);
  return 'downloaded';
}
