// M12 slice 2 task 21: hold-to-talk in the iPhone app, end to end at 390×844 with a fake
// `GymSpeech` (and a fake `GymBrain`) on `window.Capacitor.Plugins` (e2e/native-fakes.ts). Hold
// → the live words in the text box → release sends them (marked as said with the mic) → Apple's
// reply is spoken only per Speak replies (default Mic only; Off; Always also speaks typed
// questions). The microphone permission is asked on the first hold only, never at launch; a
// denied permission leaves a plain line and typing. No mic in the PWA, during a set or on the
// camera; between sets (Pause → Coach) it's there. speechSynthesis is stubbed. No request leaves
// the dev server (route-asserted).
import { expect, test, type Locator, type Page } from './fixtures';
import {
  animationsSettled,
  at,
  coachTab,
  expectTapTargets,
  getRows,
  guardNetwork,
  noHorizontalOverflow,
  openApp,
  record,
} from './app.helpers';
import {
  DEFAULT_BRAIN_TEXT,
  brainState,
  installGymBrain,
  installGymSpeech,
  speechEmit,
  speechFinishInstall,
  speechState,
} from './native-fakes';
import { openPause } from './workout.helpers';

/** Fri 13 Nov 2026, 18:00: a training day (Push A). */
const NOW = at(13, 18);

const userBubbles = (scope: Locator) => scope.locator('.cs-msg-user');
const coachItems = (scope: Locator) => scope.locator('li.chat-item-coach');
const spoken = (page: Page) => page.evaluate(() => window.__spoken);

async function openNative(page: Page, speech: Parameters<typeof installGymSpeech>[1] = {}) {
  await installGymBrain(page);
  await installGymSpeech(page, speech);
  await openApp(page, NOW);
}

async function goCoach(page: Page) {
  await page.locator('[data-tab="coach"]').click();
  await expect(coachTab(page)).toBeVisible();
}

/**
 * Holds the mic in `scope`, plays the partial words, sets the final text, releases on the button
 * and waits for the coach's answer.
 */
async function holdAndSay(page: Page, scope: Locator, partials: string[], final: string) {
  const mine = await userBubbles(scope).count();
  const hold = scope.locator('[data-mic-hold]');
  await expect(scope.locator('[data-mic]')).toHaveAttribute('data-mic-state', 'idle');
  await animationsSettled(page);
  const b = await hold.boundingBox();
  if (!b) throw new Error('no mic button');
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await expect(scope.locator('[data-mic]')).toHaveAttribute('data-mic-state', 'listening');
  await expect(hold).toHaveAttribute('aria-pressed', 'true');
  await expect.poll(async () => (await speechState(page)).calls).toContain('start');
  const box = scope.getByLabel('Ask the coach');
  for (const words of partials) {
    await speechEmit(page, 'partial', { text: words });
    await expect(box).toHaveValue(words);
  }
  await speechEmit(page, 'level', { rms: 0.6 });
  await expect(scope.locator('[data-mic-hint]')).toBeVisible();
  await page.evaluate((t) => {
    window.__gymSpeech.final = t;
  }, final);
  await page.mouse.up();
  await expect(userBubbles(scope)).toHaveCount(mine + 1);
  await expect(userBubbles(scope).last()).toContainText(final);
  // Answered: the newest item in the thread is the coach's.
  await expect(scope.locator('li.chat-item').last()).toHaveClass(/chat-item-coach/);
  await expect(scope.locator('[data-chat-typing]')).toHaveCount(0);
  await expect(scope.locator('[data-mic]')).toHaveAttribute('data-mic-state', 'idle');
}

/** Types and sends `text` (retrying if a re-render swapped the box), waits for the answer. */
async function typeAndSend(scope: Locator, text: string) {
  const replies = await coachItems(scope).count();
  const mine = await userBubbles(scope).count();
  await expect(async () => {
    if ((await userBubbles(scope).count()) === mine) {
      await scope.getByLabel('Ask the coach').fill(text);
      await scope.getByRole('button', { name: 'Send' }).click();
    }
    await expect(userBubbles(scope)).toHaveCount(mine + 1, { timeout: 1000 });
  }).toPass({ timeout: 10_000 });
  await expect(coachItems(scope)).toHaveCount(replies + 1);
  await expect(scope.locator('[data-chat-typing]')).toHaveCount(0);
}

async function setSpeakReplies(page: Page, v: 'mic' | 'always' | 'off') {
  await page.locator('[data-tab="settings"]').click();
  await page.locator('[data-coach-settings-open]').click();
  const screen = page.locator('main[data-screen="coach-settings"]');
  const opt = screen.locator(`[data-speak-replies="${v}"]`);
  await opt.click();
  await expect(opt).toHaveAttribute('aria-pressed', 'true');
  await screen.getByRole('button', { name: 'Back', exact: true }).click();
  await expect(page.locator('[data-tab="coach"]')).toBeVisible();
}

test('hold → live words → release sends; the reply is spoken (Mic only); permission asked on the first hold only', async ({
  page,
}, testInfo) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  await openNative(page);
  await goCoach(page);
  const tab = coachTab(page);
  await expect(tab.locator('[data-mic]')).toHaveAttribute('data-mic-state', 'idle');
  await expect(tab.getByRole('button', { name: 'Hold to talk' })).toBeVisible();
  // Nothing was asked at launch: the app only checked whether the mic can work.
  let s = await speechState(page);
  expect(s.calls.every((c) => c === 'availability')).toBe(true);
  expect(s.prompts).toBe(0);
  await expectTapTargets(page, '[data-screen="coach"]');
  await noHorizontalOverflow(page);

  const prewarmsBefore = (await brainState(page)).prewarms;
  const replies = await coachItems(tab).count();
  const hold = tab.locator('[data-mic-hold]');
  await animationsSettled(page);
  const b = await hold.boundingBox();
  if (!b) throw new Error('no mic button');
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await expect(tab.locator('[data-mic]')).toHaveAttribute('data-mic-state', 'listening');
  // The button stays exactly under the finger while listening (Send hides but keeps its space),
  // so letting go where it went down sends.
  // (The pressed button may shrink a little for feedback; its centre must stay inside it.)
  const cx = b.x + b.width / 2;
  const cy = b.y + b.height / 2;
  await expect
    .poll(async () => {
      const n = await hold.boundingBox();
      return !!n && cx > n.x && cx < n.x + n.width && cy > n.y && cy < n.y + n.height;
    })
    .toBe(true);
  await speechEmit(page, 'partial', { text: 'how is' });
  await expect(tab.getByLabel('Ask the coach')).toHaveValue('how is');
  await speechEmit(page, 'partial', { text: 'how is my week' });
  await expect(tab.getByLabel('Ask the coach')).toHaveValue('how is my week');
  await expect(tab.locator('[data-mic-hint]')).toBeVisible();
  // Longer words: the narrow text box shows only their tail, so they also show whole above the
  // row, wrapping across the full width, and the button is still under the finger.
  const longWords = 'how is my week looking and can we move push to thursday please';
  await speechEmit(page, 'partial', { text: longWords });
  const live = tab.locator('[data-mic-live]');
  await expect(live).toBeVisible();
  await expect(live).toHaveText(longWords);
  const liveBox = await live.evaluate((el) => {
    const r = el.getBoundingClientRect();
    const row = el.parentElement?.querySelector('.cs-typing-row')?.getBoundingClientRect();
    const fs = parseFloat(getComputedStyle(el).fontSize);
    return {
      width: r.width,
      rowWidth: row?.width ?? 0,
      above: !!row && r.bottom <= row.top + 1,
      lines: Math.round(r.height / (fs * 1.3)),
      fits: el.scrollWidth <= el.clientWidth + 1,
      fs,
    };
  });
  expect(liveBox.width).toBeGreaterThanOrEqual(liveBox.rowWidth - 1);
  expect(liveBox.above).toBe(true);
  expect(liveBox.lines).toBeGreaterThanOrEqual(2);
  expect(liveBox.fits).toBe(true);
  expect(liveBox.fs).toBeGreaterThanOrEqual(20);
  {
    const n = await hold.boundingBox();
    expect(!!n && cx > n.x && cx < n.x + n.width && cy > n.y && cy < n.y + n.height).toBe(true);
  }
  await noHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('m12s2-mic-listening.png') });
  // Mic down is a strong signal a question follows: Apple's model is warmed.
  expect((await brainState(page)).prewarms).toBeGreaterThan(prewarmsBefore);
  await page.evaluate(() => {
    window.__gymSpeech.final = 'How is my week';
  });
  await page.mouse.up();
  await expect(userBubbles(tab).last()).toContainText('How is my week');
  await expect(coachItems(tab)).toHaveCount(replies + 1);
  await expect(coachItems(tab).last().locator('.cs-msg-coach')).toContainText(DEFAULT_BRAIN_TEXT);
  // Said with the mic → spoken (Speak replies: Mic only, the default).
  await expect.poll(() => spoken(page)).toEqual([DEFAULT_BRAIN_TEXT]);
  // Stored as said with the mic.
  const msgs = await getRows<{ role: string; text: string; viaMic?: boolean }>(
    page,
    'chatMessages',
  );
  expect(msgs.find((m) => m.role === 'user' && m.text === 'How is my week')?.viaMic).toBe(true);
  s = await speechState(page);
  expect(s.prompts).toBe(1);
  expect(s.calls.filter((c) => c === 'start')).toHaveLength(1);
  expect(s.calls.filter((c) => c === 'stop')).toHaveLength(1);

  // A typed question: shown, not spoken.
  await typeAndSend(tab, 'And my food?');
  expect(await spoken(page)).toEqual([DEFAULT_BRAIN_TEXT]);

  // The second hold doesn't ask again.
  await holdAndSay(page, tab, ['next'], 'Next session?');
  expect((await speechState(page)).prompts).toBe(1);
  await expect.poll(async () => (await spoken(page)).length).toBe(2);

  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});

test('Speak replies: Off keeps mic replies quiet; Always also speaks typed ones', async ({
  page,
}) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  await openNative(page);

  await setSpeakReplies(page, 'off');
  await goCoach(page);
  const tab = coachTab(page);
  await holdAndSay(page, tab, ['plan for'], 'Plan for tomorrow');
  await expect(coachItems(tab).last().locator('.cs-msg-coach')).toContainText(DEFAULT_BRAIN_TEXT);
  expect(await spoken(page)).toEqual([]);

  await setSpeakReplies(page, 'always');
  await goCoach(page);
  await typeAndSend(tab, 'Anything else?');
  await expect.poll(() => spoken(page)).toEqual([DEFAULT_BRAIN_TEXT]);

  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});

test('let go off the button → nothing is sent', async ({ page }) => {
  const offsite = await guardNetwork(page);
  await openNative(page);
  await goCoach(page);
  const tab = coachTab(page);
  await expect(tab.locator('[data-mic]')).toHaveAttribute('data-mic-state', 'idle');
  await animationsSettled(page);
  const b = await tab.locator('[data-mic-hold]').boundingBox();
  if (!b) throw new Error('no mic button');
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await expect(tab.locator('[data-mic]')).toHaveAttribute('data-mic-state', 'listening');
  await speechEmit(page, 'partial', { text: 'never mind' });
  await page.mouse.move(195, 120); // up over the thread
  await page.mouse.up();
  await expect(tab.locator('[data-mic]')).toHaveAttribute('data-mic-state', 'idle');
  await expect(userBubbles(tab)).toHaveCount(0);
  expect((await brainState(page)).requests).toEqual([]);
  expect(await spoken(page)).toEqual([]);
  expect(offsite).toEqual([]);
});

test('permission denied → a plain line, typing still works', async ({ page }, testInfo) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  await openNative(page, { grant: false });
  await goCoach(page);
  const tab = coachTab(page);
  await animationsSettled(page);
  const b = await tab.locator('[data-mic-hold]').boundingBox();
  if (!b) throw new Error('no mic button');
  await page.mouse.move(b.x + b.width / 2, b.y + b.height / 2);
  await page.mouse.down();
  await page.mouse.up();
  await expect(tab.locator('[data-mic-unavailable="permissionDenied"]')).toBeVisible();
  await expect(tab.locator('[data-mic-hold]')).toHaveCount(0);
  expect((await speechState(page)).prompts).toBe(1);
  await expect(userBubbles(tab)).toHaveCount(0);
  await noHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('m12s2-mic-denied.png') });
  await typeAndSend(tab, 'Typing still works');
  await expect(coachItems(tab).last().locator('.cs-msg-coach')).toContainText(DEFAULT_BRAIN_TEXT);
  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});

// Checkpoint J: on his iPhone the speech model was never offered ("isn't on this iPhone yet").
// FIXME(main): remove `.fixme` once app.ts wires `micInstall` (set mic 'downloading', await
// GymSpeech.installModel(), then re-check availability → idle, or unavailable 'installFailed').
test.fixme('speech model not on the phone → Download speech for the mic → downloading → Talk', async ({
  page,
}, testInfo) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  await openNative(page, { availability: { available: false, reason: 'modelNotInstalled' } });
  await goCoach(page);
  const tab = coachTab(page);
  const install = tab.locator('[data-mic-install]');
  await expect(install).toHaveText('Download speech for the mic');
  await expect(tab.locator('[data-mic-install-note]')).toContainText('No audio is sent');
  await expect(tab.locator('[data-mic-hold]')).toHaveCount(0);
  await expectTapTargets(page, '.cs-typing');
  await noHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('checkpoint-j-mic-download.png') });

  // A failed download: a retry line and the button again.
  await install.click();
  await expect(tab.locator('[data-mic-downloading]')).toHaveText(
    'Downloading speech… you can keep typing.',
  );
  await page.screenshot({ path: testInfo.outputPath('checkpoint-j-mic-downloading.png') });
  // Typing still works while it downloads.
  await typeAndSend(tab, 'Typing while it downloads');
  await speechFinishInstall(page, false);
  await expect(tab.locator('[data-mic-unavailable="installFailed"]')).toBeVisible();
  await expect(tab.locator('[data-mic-install]')).toBeVisible();

  // The second try lands: the Talk button.
  await tab.locator('[data-mic-install]').click();
  await expect(tab.locator('[data-mic-downloading]')).toBeVisible();
  await speechFinishInstall(page, true);
  await expect(tab.locator('[data-mic]')).toHaveAttribute('data-mic-state', 'idle');
  await expect(tab.locator('[data-mic-hold]')).toBeVisible();
  expect((await speechState(page)).installs).toBe(2);
  // Shown, never spoken: nothing to react to mid-set (the Coach tab only).
  expect(await spoken(page)).toEqual([]);
  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});

test('the PWA: no mic, no source badge, and the plugins are never called', async ({ page }) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  await installGymBrain(page, { native: false });
  await installGymSpeech(page, { native: false });
  await openApp(page, NOW);
  await goCoach(page);
  const tab = coachTab(page);
  await expect(tab.getByLabel('Ask the coach')).toBeVisible();
  await expect(tab.locator('[data-mic], [data-mic-unavailable]')).toHaveCount(0);
  await typeAndSend(tab, 'How is my week?');
  await expect(tab.locator('[data-chat-source]')).toHaveCount(0);
  expect((await speechState(page)).calls).toEqual([]);
  const brain = await brainState(page);
  expect(brain.availabilityCalls).toBe(0);
  expect(brain.requests).toEqual([]);
  expect(await spoken(page)).toEqual([]);
  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});

test('no mic during a set; between sets (Pause → Coach) it is there', async ({ page }) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  await openNative(page);
  // The Coach tab once first: the app checks the mic's availability when that tab opens.
  await goCoach(page);
  await page.locator('[data-tab="today"]').click();
  await page.locator('[data-hero="push-a"] [data-start]').click();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await expect(page.locator('[data-screen="exercise"]')).toBeVisible();
  // During a set: no chat, no mic.
  await expect(page.locator('[data-mic], [data-mic-hold], input')).toHaveCount(0);

  await openPause(page);
  await page.locator('[data-pause="coach"]').click();
  const sheet = page.getByRole('dialog', { name: 'Coach' });
  await expect(sheet).toBeVisible();
  await expect(sheet.locator('[data-mic]')).toHaveAttribute('data-mic-state', 'idle');
  await expectTapTargets(page, '[data-coach-sheet]');
  await noHorizontalOverflow(page);
  await holdAndSay(page, sheet, ['lighter'], 'Make the rest lighter');
  await sheet.getByRole('button', { name: 'Close' }).click();
  await expect(sheet).toHaveCount(0);
  // Resumed: no mic again.
  await page
    .getByRole('dialog', { name: 'Paused' })
    .getByRole('button', { name: 'Resume' })
    .click();
  await expect(page.locator('[data-screen="exercise"]')).toBeVisible();
  await expect(page.locator('[data-mic], [data-mic-hold]')).toHaveCount(0);
  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});

test('no mic on the camera', async ({ page }) => {
  test.setTimeout(60_000);
  const offsite = await guardNetwork(page);
  await openNative(page);
  await page
    .getByRole('button', { name: /Pull A/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await expect(page.getByRole('heading', { name: 'One-Arm Dumbbell Row' })).toBeVisible();
  await page.getByRole('button', { name: 'Camera', exact: true }).click();
  const cam = page.getByRole('dialog', { name: 'Camera' });
  await expect(cam).toBeVisible();
  await expect(page.locator('[data-mic], [data-mic-hold], [data-chat]')).toHaveCount(0);
  await expect(cam.getByLabel('Ask the coach')).toHaveCount(0);
  // The mic was never started.
  expect((await speechState(page)).calls).not.toContain('start');
  expect(offsite).toEqual([]);
});
