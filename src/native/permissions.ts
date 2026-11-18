// M13: the app's real camera and microphone permission, read from iOS (GymSpeech.permissions()
// and GymSpeech.requestMic(), ios/App/App/Plugins/GymSpeech/GymSpeechPlugin.swift).
//
// Why: in the Capacitor WKWebView, `navigator.permissions.query({ name: 'camera' })` does not
// reflect the app's AVCaptureDevice authorization, so Self-check said "Not allowed yet" for a
// camera that was allowed.
//
// - Web first: on the PWA (or without the plugin) both calls return null; callers keep the web path.
// - Never throws. `nativePermissions()` never shows a prompt. `requestMicPermission()` shows the
//   iOS microphone prompt only while the mic is still undecided (iOS shows it once per install).
// - No `@capacitor/core` import (same reason as src/native/health.ts): the native call is used
//   directly, so it works even when the in-app plugin's header lands after the page started.
import { isNative, type CapacitorGlobal } from './health';
import { GYM_SPEECH_PLUGIN } from './speech';

export type NativePermissionState = 'granted' | 'denied' | 'prompt';
export type NativePermissions = { camera: NativePermissionState; mic: NativePermissionState };

/** How long `permissions()` may take before the plugin counts as missing (it never prompts). */
export const PERMISSIONS_TIMEOUT_MS = 4000;
/** Upper bound on the microphone prompt; a plugin that is missing never answers at all. */
export const REQUEST_MIC_TIMEOUT_MS = 120_000;

export type PermissionsCapacitor = CapacitorGlobal;
export type PermissionsEnv = { cap?: PermissionsCapacitor | undefined };

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Unknown answers are "denied": the app never claims a permission it can't confirm. */
export function mapPermissionState(v: unknown): NativePermissionState {
  return v === 'granted' || v === 'prompt' || v === 'denied' ? v : 'denied';
}

function globalCapacitor(): PermissionsCapacitor | undefined {
  return (globalThis as { Capacitor?: PermissionsCapacitor }).Capacitor;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('GymSpeech did not answer')), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e: unknown) => {
        clearTimeout(t);
        reject(e instanceof Error ? e : new Error(String(e)));
      },
    );
  });
}

/** Calls one GymSpeech method, or returns undefined when there's no native side to call. */
function callNative(
  env: PermissionsEnv,
  method: 'permissions' | 'requestMic',
): Promise<unknown> | undefined {
  const cap = 'cap' in env ? env.cap : globalCapacitor();
  if (!isNative(cap)) return undefined;
  const plugin = cap?.Plugins?.[GYM_SPEECH_PLUGIN];
  if (isObj(plugin) && typeof plugin[method] === 'function') {
    return (plugin[method] as () => Promise<unknown>)();
  }
  const call = cap?.nativePromise;
  if (typeof call !== 'function') return undefined;
  return call.call(cap, GYM_SPEECH_PLUGIN, method, {});
}

/**
 * The app's camera and microphone permission as iOS has it. Never prompts.
 * Null on the web, without the plugin, or on an older app build without the method.
 */
export async function nativePermissions(env: PermissionsEnv = {}): Promise<NativePermissions | null> {
  try {
    const pending = callNative(env, 'permissions');
    if (!pending) return null;
    const reply = await withTimeout(pending, PERMISSIONS_TIMEOUT_MS);
    if (!isObj(reply)) return null;
    return { camera: mapPermissionState(reply.camera), mic: mapPermissionState(reply.mic) };
  } catch {
    return null;
  }
}

/**
 * Asks iOS for the microphone (the system prompt shows only while it's undecided) and returns the
 * resulting state. Null on the web, without the plugin, or on a plugin error.
 */
export async function requestMicPermission(
  env: PermissionsEnv = {},
): Promise<{ mic: NativePermissionState } | null> {
  try {
    const pending = callNative(env, 'requestMic');
    if (!pending) return null;
    const reply = await withTimeout(pending, REQUEST_MIC_TIMEOUT_MS);
    if (!isObj(reply)) return null;
    return { mic: mapPermissionState(reply.mic) };
  } catch {
    return null;
  }
}
