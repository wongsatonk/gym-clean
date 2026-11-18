// M12 slice 1c task 11: copy the to-do report to the system clipboard. Nothing is sent anywhere:
// the text only goes to the clipboard, on his tap.
//
// `copyText` uses the async Clipboard API. When it is missing or refuses (no permission, not a
// secure context, no user gesture), it returns false and the report sheet shows the fallback: a
// read-only text box with the whole report and "Select all", which selects it and tries the old
// `execCommand('copy')` (`selectAllAndCopy`).

type ClipboardLike = { writeText?: (text: string) => Promise<void> };
type NavigatorLike = { clipboard?: ClipboardLike | undefined } | undefined;

/** True when the text reached the clipboard through `navigator.clipboard.writeText`. */
export async function copyText(
  text: string,
  nav: NavigatorLike = (globalThis as { navigator?: NavigatorLike }).navigator,
): Promise<boolean> {
  const write = nav?.clipboard?.writeText;
  if (typeof write !== 'function') return false;
  try {
    await write.call(nav?.clipboard, text);
    return true;
  } catch {
    return false;
  }
}

type SelectableLike = {
  focus?: () => void;
  select?: () => void;
  setSelectionRange?: (start: number, end: number) => void;
  value?: string;
};
type DocLike = { execCommand?: (cmd: string) => boolean } | undefined;

/**
 * Selects all text in `box` (also on iOS, which needs setSelectionRange) and tries the legacy
 * copy command. True only when the browser says the copy worked; the text stays selected either
 * way so he can use the system Copy.
 */
export function selectAllAndCopy(
  box: SelectableLike,
  doc: DocLike = (globalThis as { document?: DocLike }).document,
): boolean {
  box.focus?.();
  box.select?.();
  box.setSelectionRange?.(0, (box.value ?? '').length);
  const exec = doc?.execCommand;
  if (typeof exec !== 'function') return false;
  try {
    return exec.call(doc, 'copy') === true;
  } catch {
    return false;
  }
}
