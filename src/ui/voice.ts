// Spoken prompts via the Web Speech API. Silently does nothing where unsupported.

function synth(): SpeechSynthesis | null {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
    ? window.speechSynthesis
    : null;
}

export const voice = {
  /** iOS only allows speech after a user gesture: call from a tap handler. */
  unlock(): void {
    const s = synth();
    if (!s) return;
    const u = new SpeechSynthesisUtterance('');
    u.volume = 0;
    s.speak(u);
  },

  speak(text: string): void {
    const s = synth();
    if (!s) return;
    const u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 1;
    s.speak(u);
  },
};
