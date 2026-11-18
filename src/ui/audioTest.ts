import { h } from './dom';
import { voice } from './voice';
import './audioTest.css';

/**
 * Settings → Voice → "Audio test (for music)". An on-phone experiment: with Spotify (or any app)
 * playing, does our sound PAUSE, DUCK or MIX with the music? It tries three sources under a
 * chosen WebKit Audio Session type (`navigator.audioSession.type`):
 *   - speechSynthesis (what the coach uses today; the session type may not apply to it),
 *   - a generated Web Audio beep (the type does apply to Web Audio / media elements),
 *   - the camera on (getUserMedia video only), which may change how iOS treats the other two.
 * Nothing is recorded, stored or sent: the camera preview is a live <video> only, and the beep is
 * an OscillatorNode (no audio files, no network).
 */

export const AUDIO_SESSION_TYPES = [
  'auto',
  'ambient',
  'transient',
  'transient-solo',
  'playback',
] as const;
export type AudioSessionType = (typeof AUDIO_SESSION_TYPES)[number];

export const TEST_PHRASE = 'Twelve. Slow the lowering.';

export function isAudioSessionType(x: unknown): x is AudioSessionType {
  return typeof x === 'string' && (AUDIO_SESSION_TYPES as readonly string[]).includes(x);
}

/** What WebKit says each type should do to other apps' audio (one short line). */
export function typeHint(t: AudioSessionType): string {
  switch (t) {
    case 'auto':
      return 'auto: Safari decides (the default).';
    case 'ambient':
      return 'ambient: should mix with music. Muted in Silent mode.';
    case 'transient':
      return 'transient: should mix or duck music. Muted in Silent mode.';
    case 'transient-solo':
      return 'transient-solo: should pause music while it plays.';
    case 'playback':
      return 'playback: like a music app, likely pauses music.';
  }
}

/** The two-tone beep: start offset and length in seconds, frequency in Hz. */
export type Tone = { freq: number; at: number; dur: number };
export const BEEP_TONES: readonly Tone[] = [
  { freq: 880, at: 0, dur: 0.12 },
  { freq: 1320, at: 0.16, dur: 0.14 },
];

/** Seconds from the first tone's start to the last tone's end. */
export function beepLength(tones: readonly Tone[] = BEEP_TONES): number {
  return tones.reduce((end, t) => Math.max(end, t.at + t.dur), 0);
}

export type AudioTestStatus = {
  /** null when the browser has no navigator.audioSession. */
  type: string | null;
  last: string | null;
  camera: 'off' | 'starting' | 'on' | 'blocked';
};

export function statusText(s: AudioTestStatus): string {
  const session = s.type === null ? 'not supported' : s.type;
  return `Session: ${session}. Played: ${s.last ?? 'nothing yet'}. Camera: ${s.camera}.`;
}

// ---------------------------------------------------------------------------------------------

type AudioSessionLike = { type: string };

function audioSession(): AudioSessionLike | null {
  const nav = navigator as unknown as { audioSession?: AudioSessionLike };
  return 'audioSession' in navigator && nav.audioSession ? nav.audioSession : null;
}

function audioContextCtor(): (new () => AudioContext) | null {
  const w = window as unknown as {
    AudioContext?: new () => AudioContext;
    webkitAudioContext?: new () => AudioContext;
  };
  return w.AudioContext ?? w.webkitAudioContext ?? null;
}

export type AudioTestHandle = { el: HTMLElement; dispose(): void };

export function createAudioTest(): AudioTestHandle {
  const session = audioSession();
  let chosen: AudioSessionType = 'auto';
  let disposed = false;
  let ctx: AudioContext | null = null;
  let suspendTimer: number | undefined;
  let stream: MediaStream | null = null;
  let camToken = 0;
  const status: AudioTestStatus = {
    type: session ? session.type : null,
    last: null,
    camera: 'off',
  };

  const statusLine = h('p', {
    class: 'audio-test-status',
    role: 'status',
    'data-audio-status': true,
  });
  const hintLine = h('p', { class: 'muted audio-test-hint' }, typeHint(chosen));
  const show = (patch: Partial<AudioTestStatus>) => {
    Object.assign(status, patch);
    statusLine.textContent = statusText(status);
  };

  /** Sets the chosen type right before something plays; reads back what the browser kept. */
  function applyType(): void {
    if (!session) return;
    try {
      session.type = chosen;
    } catch {
      // Unknown type in this WebKit: the read-back below shows what stuck.
    }
    status.type = session.type;
  }

  // ---- session type choice ----
  const segButtons = AUDIO_SESSION_TYPES.map((t) =>
    h(
      'button',
      {
        type: 'button',
        class: `audio-seg-btn${t === chosen ? ' active' : ''}`,
        'aria-pressed': t === chosen ? 'true' : 'false',
        'data-session-type': t,
        onclick: () => {
          chosen = t;
          for (const b of segButtons) {
            const on = b.dataset.sessionType === t;
            b.classList.toggle('active', on);
            b.setAttribute('aria-pressed', on ? 'true' : 'false');
          }
          hintLine.textContent = typeHint(t);
        },
      },
      t,
    ),
  );
  const typeChoice = session
    ? h(
        'div',
        { class: 'audio-seg', role: 'group', 'aria-label': 'Audio session type' },
        ...segButtons,
      )
    : h(
        'p',
        { class: 'audio-test-note', 'data-audio-unsupported': true },
        'Audio session type: not supported in this browser. The buttons still work.',
      );

  // ---- speech ----
  function speak(): void {
    if (disposed) return;
    applyType();
    const u = voice.speak(TEST_PHRASE, { kind: 'cue' });
    if (!u) {
      show({ last: 'speech (not supported)' });
      return;
    }
    show({ last: 'speech' });
    u.addEventListener('start', () => show({ last: 'speech (speaking)' }));
    u.addEventListener('end', () => show({ last: 'speech (done)' }));
    u.addEventListener('error', () => show({ last: 'speech (error)' }));
  }

  // ---- beep ----
  function beep(): void {
    if (disposed) return;
    applyType();
    const Ctor = audioContextCtor();
    if (!Ctor) {
      show({ last: 'beep (no Web Audio)' });
      return;
    }
    ctx ??= new Ctor();
    // resume() inside the tap (iOS needs the gesture); tones are scheduled on the context clock
    // so they play as soon as it runs.
    if (ctx.state !== 'running') void ctx.resume().catch(() => undefined);
    const t0 = ctx.currentTime + 0.05;
    for (const tone of BEEP_TONES) {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.value = tone.freq;
      const start = t0 + tone.at;
      const end = start + tone.dur;
      gain.gain.setValueAtTime(0, start);
      gain.gain.linearRampToValueAtTime(0.35, start + 0.01);
      gain.gain.linearRampToValueAtTime(0, end);
      osc.connect(gain).connect(ctx.destination);
      osc.start(start);
      osc.stop(end + 0.02);
    }
    // Suspend after the beep so the audio session can end and paused music can come back.
    window.clearTimeout(suspendTimer);
    const c = ctx;
    suspendTimer = window.setTimeout(
      () => {
        if (c.state === 'running') void c.suspend().catch(() => undefined);
      },
      (beepLength() + 0.4) * 1000,
    );
    show({ last: 'beep' });
  }

  // ---- camera ----
  const preview = h('video', {
    class: 'audio-test-preview',
    muted: true,
    playsinline: true,
    autoplay: true,
    'aria-hidden': 'true',
    hidden: true,
  });
  preview.muted = true;
  const camBtn = h(
    'button',
    {
      type: 'button',
      class: 'audio-test-btn',
      'aria-pressed': 'false',
      'data-audio-camera': true,
      onclick: () => (stream || status.camera === 'starting' ? stopCamera() : void startCamera()),
    },
    'Camera on',
  );

  function setCamUi(on: boolean): void {
    camBtn.textContent = on ? 'Camera off' : 'Camera on';
    camBtn.setAttribute('aria-pressed', on ? 'true' : 'false');
    preview.hidden = !on;
  }

  async function startCamera(): Promise<void> {
    if (disposed) return;
    const md = navigator.mediaDevices;
    if (!md?.getUserMedia) {
      show({ camera: 'blocked' });
      return;
    }
    const token = ++camToken;
    show({ camera: 'starting' });
    setCamUi(true);
    try {
      const s = await md.getUserMedia({ video: { facingMode: 'user' }, audio: false });
      if (token !== camToken || disposed) {
        for (const t of s.getTracks()) t.stop();
        return;
      }
      stream = s;
      preview.srcObject = s;
      void preview.play().catch(() => undefined);
      show({ camera: 'on' });
    } catch {
      if (token !== camToken) return;
      setCamUi(false);
      show({ camera: 'blocked' });
    }
  }

  function stopCamera(): void {
    camToken++; // a getUserMedia still pending is stopped when it resolves
    if (stream) for (const t of stream.getTracks()) t.stop();
    stream = null;
    preview.srcObject = null;
    setCamUi(false);
    if (status.camera !== 'blocked') show({ camera: 'off' });
  }

  const onVisibility = () => {
    if (document.visibilityState === 'hidden') stopCamera();
  };
  document.addEventListener('visibilitychange', onVisibility);

  const el = h(
    'details',
    { class: 'audio-test', 'data-audio-test': true },
    h('summary', { class: 'audio-test-summary' }, 'Audio test (for music)'),
    h(
      'div',
      { class: 'audio-test-body' },
      h(
        'p',
        { class: 'audio-test-note' },
        'Play music in another app, then try each button. Note: paused, quieter, or plays over it.',
      ),
      typeChoice,
      session ? hintLine : null,
      h(
        'button',
        { type: 'button', class: 'audio-test-btn', 'data-audio-speak': true, onclick: speak },
        'Speak a phrase',
      ),
      h(
        'button',
        { type: 'button', class: 'audio-test-btn', 'data-audio-beep': true, onclick: beep },
        'Play a beep',
      ),
      h('div', { class: 'audio-test-cam' }, camBtn, preview),
      statusLine,
      h('p', { class: 'muted audio-test-privacy' }, 'Nothing is recorded or sent anywhere.'),
    ),
  );
  el.addEventListener('toggle', () => {
    if (!el.open) stopCamera();
  });
  show({});

  return {
    el,
    dispose(): void {
      if (disposed) return;
      stopCamera();
      disposed = true;
      document.removeEventListener('visibilitychange', onVisibility);
      window.clearTimeout(suspendTimer);
      if (ctx && ctx.state !== 'closed') void ctx.close().catch(() => undefined);
      ctx = null;
      if (session) {
        try {
          session.type = 'auto';
        } catch {
          // ignore
        }
      }
    },
  };
}

// Settings re-renders often (toggles, async loads): keep one live panel per Settings visit so the
// open section, chosen type and camera survive a re-render.
let current: AudioTestHandle | null = null;

/** The panel to mount under "Test voice". Same element until disposeAudioTest(). */
export function audioTestPanel(): HTMLElement {
  current ??= createAudioTest();
  return current.el;
}

/** Call when leaving Settings: stops the camera, closes the beep context, type back to 'auto'. */
export function disposeAudioTest(): void {
  current?.dispose();
  current = null;
}
