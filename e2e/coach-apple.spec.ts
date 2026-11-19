// M12 slice 2 task 21: Apple's on-device coach in the iPhone app, end to end at 390×844 with a
// fake `GymBrain` on `window.Capacitor.Plugins` (e2e/native-fakes.ts; made-up replies). Free text
// → Apple's reply with the "On-device AI" badge; a tool call → a proposal card → Apply → Undo
// (nothing changes without his tap); a read-only tool → an answer from the tool result, no card;
// each unavailable reason → quick replies + its plain note once; a failed reply → quick replies +
// a one-line note every time; the M12-q1 setting `appleCardReasons: false` → the "Lighter today?"
// reasons never reach the model. Replies to typed messages are shown, not spoken. No request
// leaves the dev server (route-asserted).
import { expect, test, type Page } from './fixtures';
import {
  at,
  coachTab,
  expectTapTargets,
  getSetting,
  guardNetwork,
  noHorizontalOverflow,
  openApp,
  putSetting,
  record,
  revealNotice,
} from './app.helpers';
import {
  DEFAULT_BRAIN_TEXT,
  type FakeBrainAvailability,
  brainState,
  installGymBrain,
  queueBrain,
  setBrainAvailability,
} from './native-fakes';

/** Fri 13 Nov 2026, 18:00: a training day (Push A) on a fresh plan. */
const NOW = at(13, 18);

const userBubbles = (page: Page) => coachTab(page).locator('.cs-msg-user');
const coachItems = (page: Page) => coachTab(page).locator('li.chat-item-coach');
const box = (page: Page) => coachTab(page).getByLabel('Ask the coach');

async function goCoach(page: Page) {
  await page.locator('[data-tab="coach"]').click();
  await expect(coachTab(page)).toBeVisible();
}

/** Types `text`, sends it, and waits for the coach's answer; returns that message item. */
async function ask(page: Page, text: string) {
  const before = await coachItems(page).count();
  const mine = await userBubbles(page).count();
  // The chat re-renders once just after it opens (the mic check), which can swap the text box
  // out between fill and Send: an empty Send sends nothing, so type again until it lands.
  await expect(async () => {
    if ((await userBubbles(page).count()) === mine) {
      await box(page).fill(text);
      await coachTab(page).getByRole('button', { name: 'Send' }).click();
    }
    await expect(userBubbles(page)).toHaveCount(mine + 1, { timeout: 1000 });
  }).toPass({ timeout: 10_000 });
  await expect(userBubbles(page).last()).toContainText(text);
  await expect(coachItems(page)).toHaveCount(before + 1);
  await expect(coachTab(page).locator('[data-chat-typing]')).toHaveCount(0);
  return coachItems(page).last();
}

/** The notes' copy, read from src/data/brain/notes.ts through the dev server (one source). */
async function noteCopy(page: Page) {
  return page.evaluate(async () => {
    const path = '/src/data/brain/notes.ts';
    const m = (await import(/* @vite-ignore */ path)) as {
      UNAVAILABLE_COPY: Record<string, { status: string; note: string }>;
      errorNote: (code: string, failed: string, answered: string) => string;
    };
    const routerPath = '/src/data/brain/router.ts';
    const r = (await import(/* @vite-ignore */ routerPath)) as {
      BRAIN_LABEL: Record<string, string>;
    };
    return {
      unavailable: m.UNAVAILABLE_COPY,
      // The router's generic line when the check failed (no reason to name).
      generic: `Answered by quick replies: ${r.BRAIN_LABEL.apple ?? ''} isn't available.`,
      timeout: m.errorNote('timeout', 'apple', 'rules'),
      guardrail: m.errorNote('guardrail', 'apple', 'rules'),
    };
  });
}

async function openNative(page: Page) {
  await installGymBrain(page);
  await openApp(page, NOW);
  // The app checks Apple's model once its plugin has loaded.
  await expect.poll(async () => (await brainState(page)).availabilityCalls).toBeGreaterThan(0);
}

test('free text → Apple answers with the "On-device AI" badge; shown, not spoken', async ({
  page,
}, testInfo) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  await openNative(page);
  await goCoach(page);

  // Open chat (the rules read it as help), so it reaches the model. Since 1.15.2 a message the
  // rules read as a change ("What should I focus on…" → focus block) never does, and since
  // 1.16.2 nor does a question about his own numbers ("What am I training today?" → facts).
  // An opinion question like this one is a guard that the facts route stays narrow.
  const reply = await ask(page, 'Any thoughts on how today should go?');
  await expect(reply.locator('.cs-msg-coach')).toContainText(DEFAULT_BRAIN_TEXT);
  await expect(reply.locator('[data-chat-source="apple"]')).toHaveText('Answered by On-device AI');
  await expect(reply.locator('[data-chat-note]')).toHaveCount(0);
  await expect(coachTab(page).locator('[data-proposal]')).toHaveCount(0);

  // What the model got: the instructions, his words as the last turn, the plan in the context,
  // and the read-only tool results.
  const [req] = (await brainState(page)).requests;
  expect(req?.instructions.length).toBeGreaterThan(0);
  expect(req?.messages.at(-1)).toEqual({
    role: 'user',
    text: 'Any thoughts on how today should go?',
  });
  expect(req?.context).toContain("Today's plan");
  expect(Object.keys(req?.toolResults ?? {})).toEqual(
    expect.arrayContaining(['weekSummary', 'progressSummary', 'foodIdeas']),
  );

  await expectTapTargets(page, '[data-screen="coach"]');
  await noHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('m12s2-apple-reply.png') });

  // Typed, so Speak replies (default: Mic only) keeps it silent.
  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});

test('a tool call → a proposal card → Apply → Undo; nothing changes before the tap', async ({
  page,
}, testInfo) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  await openNative(page);
  await expect(page.locator('[data-hero="push-a"]')).toBeVisible();
  await goCoach(page);

  await queueBrain(page, {
    text: 'A lighter day makes sense.',
    toolCalls: [{ name: 'lighterToday', args: {} }],
  });
  // Open chat the rules leave as help (a plain "easier today" is a rules change since 1.15.2).
  const reply = await ask(page, 'What do you think, should I hold back a bit today?');
  await expect(reply.locator('.cs-msg-coach')).toContainText('A lighter day makes sense.');
  await expect(reply.locator('[data-chat-source="apple"]')).toBeVisible();
  const card = reply.locator('[data-proposal]');
  await expect(card).toBeVisible();
  await expect(card.getByRole('button', { name: 'Apply' })).toBeVisible();
  // While it waits: no text box, so Apply stays on screen.
  await expect(box(page)).toHaveCount(0);
  await expectTapTargets(page, '[data-screen="coach"]');
  await noHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('m12s2-apple-proposal.png') });

  // Nothing applied yet: no change in the plan's log.
  const changesBefore = await page.evaluate(
    () =>
      new Promise<number>((resolve) => {
        const open = indexedDB.open('gym-clean');
        open.onsuccess = () => {
          const d = open.result;
          const req = d.transaction('planChanges', 'readonly').objectStore('planChanges').count();
          req.onsuccess = () => {
            d.close();
            resolve(req.result);
          };
          req.onerror = () => resolve(-1);
        };
        open.onerror = () => resolve(-1);
      }),
  );
  expect(changesBefore).toBe(0);

  await card.getByRole('button', { name: 'Apply' }).click();
  await expect(card.locator('[data-card-status="applied"]')).toContainText('Applied.');
  await card.getByRole('button', { name: 'Undo' }).click();
  await expect(card.locator('[data-card-status="undone"]')).toBeVisible();

  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});

// 1.15.2 "Coach acts" (src/core/trainer/brain/route.ts): a message the rules read as a change
// goes straight to the rules' proposal (the chips' Apply card) with the quick-replies badge;
// Apple's model is not asked at all.
test("a rule-matched change → the rules' proposal card, quick-replies badge, model not asked", async ({
  page,
}, testInfo) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  await openNative(page);
  await expect(page.locator('[data-hero="push-a"]')).toBeVisible();
  await goCoach(page);

  const reply = await ask(page, 'Make today lighter');
  await expect(reply.locator('[data-chat-source="rules"]')).toHaveText('Answered by Quick replies');
  await expect(reply.locator('[data-chat-source="apple"]')).toHaveCount(0);
  await expect(reply.locator('[data-chat-note]')).toHaveCount(0);
  const card = reply.locator('[data-proposal]');
  await expect(card).toBeVisible();
  await expect(card.getByRole('button', { name: 'Apply' })).toBeVisible();
  await expectTapTargets(page, '[data-screen="coach"]');
  await noHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('m1152-rules-proposal.png') });

  // The model got no respond request for it.
  expect((await brainState(page)).requests).toEqual([]);

  await card.getByRole('button', { name: 'Apply' }).click();
  await expect(card.locator('[data-card-status="applied"]')).toContainText('Applied.');
  await card.getByRole('button', { name: 'Undo' }).click();
  await expect(card.locator('[data-card-status="undone"]')).toBeVisible();

  expect((await brainState(page)).requests).toEqual([]);
  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});

// 1.16.2 (src/core/trainer/brain/facts.ts): a question about his own numbers is answered by the
// rules from saved data, even with Apple's model ready; the model is not asked.
test("an own-numbers question → the rules' facts answer, quick-replies badge, model not asked", async ({
  page,
}) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  await openNative(page);
  await expect(page.locator('[data-hero="push-a"]')).toBeVisible();
  await goCoach(page);

  const reply = await ask(page, 'What am I training today?');
  await expect(reply.locator('[data-chat-source="rules"]')).toHaveText('Answered by Quick replies');
  await expect(reply.locator('[data-chat-source="apple"]')).toHaveCount(0);
  await expect(reply.locator('[data-chat-note]')).toHaveCount(0);
  // Today (Fri 13 Nov) is Push A on the fresh plan.
  await expect(reply.locator('.cs-msg-coach')).toContainText('Push A');
  await expect(reply.locator('.cs-msg-coach')).not.toContainText(DEFAULT_BRAIN_TEXT);
  await expect(coachTab(page).locator('[data-proposal]')).toHaveCount(0);
  await noHorizontalOverflow(page);

  expect((await brainState(page)).requests).toEqual([]);
  // Typed, so it stays silent.
  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});

test('a read-only tool answers from its result, with no card', async ({ page }) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  await openNative(page);
  await goCoach(page);

  await queueBrain(page, { echo: 'weekSummary', toolCalls: [{ name: 'weekSummary', args: {} }] });
  // Open chat that reaches the model (since 1.16.2 "How is my week going?" is a facts question
  // the rules answer); the fake's queued tool call still reads the week.
  const reply = await ask(page, 'Any thoughts on my training lately?');
  const req = (await brainState(page)).requests.at(-1);
  const week = req?.toolResults.weekSummary ?? '';
  expect(week.length).toBeGreaterThan(0);
  const first = (/^[^.!?]*[.!?]/.exec(week)?.[0] ?? week).trim();
  await expect(reply.locator('.cs-msg-coach')).toContainText(first);
  await expect(reply.locator('[data-chat-source="apple"]')).toBeVisible();
  await expect(coachTab(page).locator('[data-proposal]')).toHaveCount(0);
  // The text box is back for the next question.
  await expect(box(page)).toBeVisible();
  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});

test('each unavailable reason → quick replies + its note once; Settings → Coach says why', async ({
  page,
}, testInfo) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  await installGymBrain(page, {
    availability: { available: false, reason: 'appleIntelligenceNotEnabled' },
  });
  await openApp(page, NOW);
  const copy = await noteCopy(page);
  await goCoach(page);

  const reasons = [
    'appleIntelligenceNotEnabled',
    'modelNotReady',
    'deviceNotEligible',
    'unsupported',
  ] as const;
  for (const [i, reason] of reasons.entries()) {
    await setBrainAvailability(page, { available: false, reason });
    const note = copy.unavailable[reason]?.note ?? '';
    expect(note.length).toBeGreaterThan(0);
    const first = await ask(page, `Any tips for today ${i}?`);
    await expect(first.locator('[data-chat-source="rules"]')).toHaveText(
      'Answered by Quick replies',
    );
    await expect(first.locator('[data-chat-note]')).toHaveText(note);
    if (i === 0) {
      // "I can help with:" never dangles: its own chips sit right under its bubble, and the
      // dock doesn't repeat them.
      await expect(first.locator('.cs-msg-coach')).toContainText('I can help with:');
      await expect(first.locator('[data-chat-offers] [data-coach-chip]').first()).toBeVisible();
      await expect(coachTab(page).locator('.chat-dock [data-coach-chip]')).toHaveCount(0);
      await expectTapTargets(page, '[data-screen="coach"]');
      await noHorizontalOverflow(page);
      await page.screenshot({ path: testInfo.outputPath('m12s2-apple-off-note.png') });
    }
    // The same reason again: no second note.
    const second = await ask(page, `And tomorrow ${i}?`);
    await expect(second.locator('[data-chat-source="rules"]')).toBeVisible();
    await expect(second.locator('[data-chat-note]')).toHaveCount(0);
    await expect(coachTab(page).locator('[data-chat-note]', { hasText: note })).toHaveCount(1);
  }
  // Remembered on the phone (settings 'coach' → brainNotes), so a reload shows no note again.
  const notes = ((await getSetting(page, 'coach')) as { brainNotes?: Record<string, number> })
    .brainNotes;
  expect(Object.keys(notes ?? {}).sort()).toEqual([...reasons].sort());
  // The model was never asked.
  expect((await brainState(page)).requests).toEqual([]);

  // Settings → Coach: quick replies answer, with the reason.
  await page.locator('[data-tab="settings"]').click();
  await page.locator('[data-coach-settings-open]').click();
  const status = page.locator('main[data-screen="coach-settings"] [data-brain-status]');
  await expect(status).toHaveAttribute('data-brain-status', 'rules');
  await expect(status).toHaveAttribute('data-brain-reason', 'unsupported');
  await noHorizontalOverflow(page);

  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});

test('a failed reply → quick replies + a one-line note, every time', async ({ page }) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  await openNative(page);
  const copy = await noteCopy(page);
  await goCoach(page);

  await queueBrain(page, { error: 'timeout' }, { error: 'timeout' }, { error: 'guardrail' });
  // Advice requests reach the model (a guard that the 1.16.2 facts route stays narrow).
  for (const [text, note] of [
    ['Plan my week please', copy.timeout],
    ['Plan my week again', copy.timeout],
    ['Something odd', copy.guardrail],
  ] as const) {
    const reply = await ask(page, text);
    await expect(reply.locator('[data-chat-source="rules"]')).toBeVisible();
    await expect(reply.locator('[data-chat-note]')).toHaveText(note);
  }
  expect((await brainState(page)).requests).toHaveLength(3);
  // Back to normal: Apple answers, no note.
  const ok = await ask(page, 'Thanks');
  await expect(ok.locator('[data-chat-source="apple"]')).toBeVisible();
  await expect(ok.locator('[data-chat-note]')).toHaveCount(0);
  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});

test('appleCardReasons false → the "Lighter today?" reasons never reach the model', async ({
  page,
}) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  await openNative(page);

  // Feel today (low energy + a sore area) makes the "Lighter today?" card without Health.
  const feel = page.locator('[data-feel-today]');
  await feel.locator('[data-feel-open]').click();
  await feel.locator('[data-feel-energy="2"]').click();
  await feel.locator('[data-feel-sore="chest"]').click();
  await feel.locator('[data-feel-save]').click();
  await revealNotice(page, page.locator('[data-readiness="lighter"]'));

  await goCoach(page);
  // The readiness question the Lighter-today reasons exist for; it reaches the model (a guard
  // that the 1.16.2 facts route stays narrow).
  await ask(page, 'Should I train hard today?');
  let ctx = (await brainState(page)).requests.at(-1)?.context ?? '';
  // Default (setting unset): the reason sentences, never numbers.
  expect(ctx).toContain('Lighter today? card:');
  expect(ctx).toContain('You said your energy is low today.');

  // The M12-q1 decision step's setting, merged into settings 'coach' (read on every ask).
  const row = ((await getSetting(page, 'coach')) as Record<string, unknown> | undefined) ?? {};
  await putSetting(page, 'coach', { ...row, appleCardReasons: false });
  await ask(page, 'Any tips to sleep better?');
  ctx = (await brainState(page)).requests.at(-1)?.context ?? '';
  expect(ctx).not.toContain('Lighter today? card');
  expect(ctx).not.toContain('energy is low');
  expect(ctx).not.toMatch(/\bsore\b/i);
  // Nor in the turns the model sees.
  const turns = (await brainState(page)).requests.at(-1)?.messages ?? [];
  expect(JSON.stringify(turns)).not.toContain('energy is low');

  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});

// Task 23 review: the availability check itself failing (plugin rejection, or no answer within
// the app's timeout) is not a reason. Settings → Coach must not stay on "Checking…": it says it
// couldn't check, with Check again on; the chat answers with quick replies + the generic note,
// and nothing goes into coach.brainNotes (a failed check is not a once-only reason).
for (const [label, availability] of [
  ['rejects', { reject: true }],
  ['hangs past 4 s', { hang: true }],
] as const satisfies readonly (readonly [string, FakeBrainAvailability])[]) {
  test(`the availability check ${label} → "couldn't check" + Check again; chat on quick replies`, async ({
    page,
  }, testInfo) => {
    const offsite = await guardNetwork(page);
    const { errors } = record(page);
    await installGymBrain(page, { availability });
    await openApp(page, NOW);
    await expect.poll(async () => (await brainState(page)).availabilityCalls).toBeGreaterThan(0);
    // Past the app's 4 s status timeout (fast-forward; a rejection needs none).
    await page.clock.runFor(5000);
    const copy = await noteCopy(page);

    // The chat still answers, with quick replies and the generic note.
    await goCoach(page);
    const before = await coachItems(page).count();
    const mine = await userBubbles(page).count();
    await expect(async () => {
      if ((await userBubbles(page).count()) === mine) {
        await box(page).fill('Any tips for today?');
        await coachTab(page).getByRole('button', { name: 'Send' }).click();
      }
      await expect(userBubbles(page)).toHaveCount(mine + 1, { timeout: 1000 });
    }).toPass({ timeout: 10_000 });
    await expect(async () => {
      await page.clock.runFor(5000);
      await expect(coachItems(page)).toHaveCount(before + 1, { timeout: 500 });
    }).toPass({ timeout: 15_000 });
    const reply = coachItems(page).last();
    await expect(reply.locator('[data-chat-source="rules"]')).toHaveText(
      'Answered by Quick replies',
    );
    await expect(reply.locator('[data-chat-note]')).toHaveText(copy.generic);
    // The model was never asked, and no once-only note was remembered.
    expect((await brainState(page)).requests).toEqual([]);
    const coach = (await getSetting(page, 'coach')) as
      { brainNotes?: Record<string, number> } | undefined;
    expect(Object.keys(coach?.brainNotes ?? {})).toEqual([]);

    await page.locator('[data-tab="settings"]').click();
    await page.locator('[data-coach-settings-open]').click();
    const status = page.locator('main[data-screen="coach-settings"] [data-brain-status]');
    await page.clock.runFor(5000);
    await expect(status).toHaveAttribute('data-brain-status', 'unknown');
    await expect(status.locator('[data-brain-why]')).toHaveText(
      "Couldn't check Apple Intelligence just now. Quick replies answer until it can.",
    );
    const recheck = status.locator('[data-brain-recheck]');
    await expect(recheck).toHaveText('Check again');
    await expect(recheck).toBeEnabled();
    await expectTapTargets(page, '[data-screen="coach-settings"]');
    await noHorizontalOverflow(page);
    await page.screenshot({
      path: testInfo.outputPath(
        `m12s2-brain-unknown-${'hang' in availability ? 'hang' : 'reject'}.png`,
      ),
    });

    // Check again: asks again, then back to "couldn't check" (never stuck on Checking…).
    const calls = (await brainState(page)).availabilityCalls;
    await recheck.click();
    await expect
      .poll(async () => (await brainState(page)).availabilityCalls)
      .toBeGreaterThan(calls);
    await page.clock.runFor(5000);
    await expect(recheck).toHaveText('Check again');
    await expect(recheck).toBeEnabled();
    await expect(status).toHaveAttribute('data-brain-status', 'unknown');

    expect(offsite).toEqual([]);
    expect(errors).toEqual([]);
  });
}
