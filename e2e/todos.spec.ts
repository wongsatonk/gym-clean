// M12 slice 1c task 14: to-do guides + the one Copy report, in the real app at 390×844 (SPEC M12
// "What's New tour + To-do guides", goals 2–3). Today card → list (iPhone-only topics labelled and
// left out of the count on the web) → a topic's step-by-step guide; an auto step ticks from the
// app's own data (a question asked in the Coach tab) and its Try it deep-links; ask answers + a
// note survive a reload; a decision step writes its setting; Skip this topic; Copy report shows a
// preview (version in the header; never his name, a Health value or a key), copies through the
// clipboard, marks the answers sent ("Nothing new" → Copy all again; the next report has only
// newer answers). The card hides when everything is done or skipped, and to-dos never show or
// speak during a workout. No request leaves the dev server (route-asserted).
import { expect, test, type Page } from './fixtures';
import {
  APP_RELEASE,
  at,
  expectTapTargets,
  getSetting,
  guardNetwork,
  noHorizontalOverflow,
  openApp,
  record,
  todoReady,
} from './app.helpers';

/** Topics for the web app (platform 'any'); the 4 iPhone-only ones don't count here. */
const WEB_TOTAL = 9; // 1.13.0 adds "Trainer kit at the gym"
const NOW = at(16, 18);

const card = (page: Page) => page.locator('[data-todo-card]');
const list = (page: Page) => page.locator('main[data-screen="todos"]');
const guide = (page: Page) => page.locator('main[data-screen="todo-guide"]');
const row = (page: Page, id: string) => list(page).locator(`li[data-todo-topic="${id}"]`);

async function openTopic(page: Page, id: string) {
  await row(page, id).locator('button').click();
  await expect(guide(page)).toHaveAttribute('data-topic', id);
}

/** Settings → To-dos (the way in that is always there). */
async function openListFromSettings(page: Page) {
  await page.locator('[data-tab="settings"]').click();
  await page.locator('[data-todos-open]').click();
  await expect(list(page)).toBeVisible();
}

/** Puts rows into one IndexedDB store of the app (after Dexie created it). */
async function putRows(page: Page, store: string, rows: unknown[]) {
  await expect
    .poll(() =>
      page.evaluate(
        ({ store, rows }) =>
          new Promise<boolean>((resolve) => {
            const open = indexedDB.open('gym-clean');
            open.onerror = () => resolve(false);
            open.onsuccess = () => {
              const d = open.result;
              if (!d.objectStoreNames.contains(store)) {
                d.close();
                return resolve(false);
              }
              const tx = d.transaction(store, 'readwrite');
              for (const r of rows) tx.objectStore(store).put(r);
              tx.oncomplete = () => {
                d.close();
                resolve(true);
              };
              tx.onerror = () => resolve(false);
            };
          }),
        { store, rows },
      ),
    )
    .toBe(true);
}

/** The stored to-do answers (id, kind, sentAt). */
async function answers(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{ id: string; kind: string; stepId: string; note?: string; sentAt?: number }[]>(
        (resolve) => {
          const open = indexedDB.open('gym-clean');
          open.onsuccess = () => {
            const d = open.result;
            const req = d.transaction('todoAnswers').objectStore('todoAnswers').getAll();
            req.onsuccess = () => {
              d.close();
              resolve(
                req.result as {
                  id: string;
                  kind: string;
                  stepId: string;
                  note?: string;
                  sentAt?: number;
                }[],
              );
            };
          };
        },
      ),
  );
}

test('Today card → list → guide; asking the coach ticks the auto step; Try it deep-links', async ({
  page,
}, testInfo) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  await openApp(page, NOW);

  await expect(card(page)).toBeVisible();
  await expect(card(page).locator('[data-todo-count]')).toHaveText(
    `To-dos: 0 of ${WEB_TOTAL} done`,
  );
  await expect(card(page).locator('[data-todo-next]')).toHaveText('Next: Coach tab and Calendar');
  expect((await card(page).boundingBox())?.height ?? 0).toBeGreaterThanOrEqual(56);
  // Below the Start card: it never pushes Start down.
  const start = await page.locator('[data-start]').first().boundingBox();
  const cardBox = await card(page).boundingBox();
  expect(cardBox?.y ?? 0).toBeGreaterThan(start?.y ?? Infinity);
  await noHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('m12-1c-today-card.png') });

  await card(page).click();
  await expect(list(page)).toBeVisible();
  await expect(list(page).locator('[data-todo-summary]')).toContainText(`0 of ${WEB_TOTAL} done`);
  // iPhone-only topics: labelled, in their own group, not counted.
  for (const id of ['health-week', 'iphone-week', 'resign']) {
    await expect(row(page, id)).toHaveAttribute('data-state', 'native');
    await expect(row(page, id)).toContainText('In the iPhone app');
  }
  await expect(row(page, 'coach-calendar')).toHaveAttribute('data-state', 'open');
  await expect(list(page).locator('[data-copy-report]')).toBeVisible();
  await expectTapTargets(page, 'main[data-screen="todos"]');
  await noHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('m12-1c-todo-list.png'), fullPage: true });

  await openTopic(page, 'coach-calendar');
  await expect(guide(page).locator('[data-step-count]')).toHaveText('Step 1 of 8');
  await expect(guide(page).locator('[data-auto-state]')).toHaveAttribute('data-auto-state', 'todo');
  await expectTapTargets(page, 'main[data-screen="todo-guide"]');
  await page.screenshot({ path: testInfo.outputPath('m12-1c-auto-todo.png') });

  // Try it → the Coach tab; ask one question there.
  await guide(page).locator('[data-try-it="coach"]').click();
  await expect(page.locator('[data-screen="coach"]')).toBeVisible();
  await page.locator('[data-coach-starter="week"]').click();
  await expect(page.locator('[data-screen="coach"] .cs-msg-coach')).toHaveCount(1);

  // Back on Today, the card counts the tick into the topic: the guide shows it done.
  await page.locator('[data-tab="today"]').click();
  await card(page).click();
  await expect(row(page, 'coach-calendar')).toContainText('1 of 8');
  await openTopic(page, 'coach-calendar');
  // It opens on the first step not done yet (step 2); Back shows step 1 ticked.
  await expect(guide(page).locator('[data-step-count]')).toHaveText('Step 2 of 8');
  await guide(page).locator('[data-guide-back]').click();
  await expect(guide(page).locator('[data-step-count]')).toHaveText('Step 1 of 8');
  await expect(guide(page).locator('[data-auto-state]')).toHaveAttribute('data-auto-state', 'done');
  await page.screenshot({ path: testInfo.outputPath('m12-1c-auto-done.png') });
  expect((await answers(page)).filter((a) => a.kind === 'auto').map((a) => a.stepId)).toEqual([
    'asked',
  ]);

  // A settings deep link: the hands-free topic's dev-log step opens Settings at the dev log.
  await guide(page).getByRole('button', { name: 'To-dos', exact: true }).click();
  await openTopic(page, 'hands-free');
  const devlogStep = guide(page).locator('[data-try-it="settings/devlog"]');
  while ((await devlogStep.count()) === 0) await guide(page).locator('[data-guide-next]').click();
  await devlogStep.click();
  await expect(page.locator('[data-section="devlog"]')).toBeInViewport();

  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});

test('ask answers + a note survive a reload; a decision sets its setting; Skip this topic', async ({
  page,
}, testInfo) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  await openApp(page, NOW);
  await openListFromSettings(page);
  await openTopic(page, 'coach-calendar');
  for (let i = 0; i < 3; i++) await guide(page).locator('[data-guide-next]').click();
  await expect(guide(page).locator('[data-step-count]')).toHaveText('Step 4 of 8');
  const something = guide(page).locator('[data-option="something"]');
  await something.click();
  await expect(something).toHaveAttribute('aria-checked', 'true');
  await guide(page).locator('[data-note]').fill('The ring felt slow on rest days');
  await expect(guide(page).locator('[data-note-count]')).toContainText('31');
  await expectTapTargets(page, 'main[data-screen="todo-guide"]');
  await noHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('m12-1c-ask-note.png') });
  await guide(page).locator('[data-guide-next]').click(); // saves the note first
  await expect(guide(page).locator('[data-step-count]')).toHaveText('Step 5 of 8');
  await expect
    .poll(async () => (await answers(page)).find((a) => a.stepId === 'felt-off')?.note)
    .toBe('The ring felt slow on rest days');

  await page.reload();
  await expect(page.locator('[data-cal]').first()).toBeVisible();
  await openListFromSettings(page);
  await openTopic(page, 'coach-calendar');
  for (let i = 0; i < 3; i++) await guide(page).locator('[data-guide-next]').click();
  await expect(guide(page).locator('[data-option="something"]')).toHaveAttribute(
    'aria-checked',
    'true',
  );
  await expect(guide(page).locator('[data-option="nothing"]')).toHaveAttribute(
    'aria-checked',
    'false',
  );
  await expect(guide(page).locator('[data-note]')).toHaveValue('The ring felt slow on rest days');

  // Decision M12-q1: "No" writes coach.appleCardReasons = false (other coach fields kept).
  await guide(page).getByRole('button', { name: 'To-dos', exact: true }).click();
  await openTopic(page, 'apple-card');
  await guide(page).locator('[data-option="no"]').click();
  await expect(guide(page).locator('[data-decision]')).toContainText('No');
  await page.screenshot({ path: testInfo.outputPath('m12-1c-decision.png') });
  await expect
    .poll(() => getSetting(page, 'coach'))
    .toEqual(expect.objectContaining({ appleCardReasons: false }));
  // Claude: "Not now" → coach.claudeWanted only; the earlier decision stays.
  await guide(page).getByRole('button', { name: 'To-dos', exact: true }).click();
  await openTopic(page, 'claude');
  await guide(page).locator('[data-option="later"]').click();
  await expect
    .poll(() => getSetting(page, 'coach'))
    .toEqual(expect.objectContaining({ appleCardReasons: false, claudeWanted: 'later' }));
  await guide(page).getByRole('button', { name: 'To-dos', exact: true }).click();
  await expect(row(page, 'apple-card')).toHaveAttribute('data-state', 'done');
  await expect(row(page, 'claude')).toHaveAttribute('data-state', 'done');

  // Skip this topic takes two taps.
  await openTopic(page, 'food-photos');
  const skip = guide(page).locator('[data-skip-topic]');
  await skip.click();
  await expect(skip).toHaveAttribute('data-armed', 'true');
  await skip.click();
  await expect(guide(page).locator('[data-topic-skipped]')).toBeVisible();
  await guide(page).getByRole('button', { name: 'To-dos', exact: true }).click();
  await expect(row(page, 'food-photos')).toHaveAttribute('data-state', 'skipped');
  await expect(list(page).locator('[data-todo-summary]')).toContainText(`3 of ${WEB_TOTAL} done`);

  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});

test('Copy report: preview without private data → clipboard → marked sent → only newer next time', async ({
  page,
  context,
  baseURL,
}, testInfo) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], {
    origin: baseURL ?? 'https://localhost',
  });
  await openApp(page, NOW);
  // A Health weigh-in with a distinctive value: it must never reach the report.
  await putRows(page, 'weighIns', [{ date: '2026-11-15', kg: 83.7, source: 'health' }]);

  await openListFromSettings(page);
  await openTopic(page, 'coach-calendar');
  for (let i = 0; i < 3; i++) await guide(page).locator('[data-guide-next]').click();
  await guide(page).locator('[data-option="something"]').click();
  await guide(page)
    .locator('[data-note]')
    .fill('Ring slow sk-ant-api03-AbCdEfGhIjKlMnOpQrStUvWxYz0123456789 here');
  await guide(page).locator('[data-guide-next]').click();
  await guide(page).getByRole('button', { name: 'To-dos', exact: true }).click();
  await openTopic(page, 'apple-card');
  await guide(page).locator('[data-option="yes"]').click();
  await guide(page).getByRole('button', { name: 'To-dos', exact: true }).click();

  await list(page).locator('[data-copy-report]').click();
  const sheet = page.locator('[data-report-sheet]');
  await expect(sheet).toBeVisible();
  const preview = sheet.locator('[data-report-text]');
  await expect(preview).toContainText(`Version ${APP_RELEASE} (build`);
  await expect(preview).toContainText('Coach tab and Calendar');
  await expect(preview).toContainText('Something, see my note');
  await expect(preview).toContainText('Ring slow [key removed] here');
  await expect(preview).toContainText("Apple's coach and the Health card");
  const text = (await preview.textContent()) ?? '';
  expect(text).not.toContain('sk-ant');
  expect(text).not.toContain('Wongsaton');
  expect(text).not.toContain('83.7');
  await expectTapTargets(page, '[data-report-sheet]');
  await noHorizontalOverflow(page);
  await page.screenshot({ path: testInfo.outputPath('m12-1c-report-preview.png') });

  await sheet.locator('[data-report-copy]').click();
  await expect(sheet.locator('[data-report-copied]')).toContainText(
    'Copied. Paste it where you want.',
  );
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(text);
  await expect
    .poll(async () => (await answers(page)).filter((a) => a.sentAt === undefined).length)
    .toBe(0);

  // Nothing new → Copy all again rebuilds with every answer.
  await sheet.locator('[data-report-close]').click();
  await expect(sheet).toHaveCount(0);
  await list(page).locator('[data-copy-report]').click();
  await expect(sheet.locator('[data-report-empty]')).toHaveText(
    'Nothing new since your last copy.',
  );
  await sheet.locator('[data-report-copy-all]').click();
  await expect(sheet.locator('[data-report-text]')).toContainText('Ring slow [key removed] here');
  await sheet.locator('[data-report-close]').click();

  // A newer answer: the next report has only it.
  await openTopic(page, 'coach-calendar');
  while ((await guide(page).locator('[data-option="right"]').count()) === 0)
    await guide(page).locator('[data-guide-next]').click();
  await guide(page).locator('[data-option="right"]').first().click();
  await guide(page).getByRole('button', { name: 'To-dos', exact: true }).click();
  await list(page).locator('[data-copy-report]').click();
  await expect(sheet.locator('[data-report-text]')).toContainText('Just right');
  await expect(sheet.locator('[data-report-text]')).not.toContainText('Ring slow');
  await expect(sheet.locator('[data-report-text]')).not.toContainText("Apple's coach");

  expect(await page.evaluate(() => window.__spoken)).toEqual([]);
  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});

test('nothing during a workout; the card hides when every web topic is done or skipped', async ({
  page,
}) => {
  const offsite = await guardNetwork(page);
  const { errors } = record(page);
  await openApp(page, NOW);
  await expect(card(page)).toBeVisible();

  await page.locator('[data-start]').first().click();
  await page.getByRole('button', { name: 'Start workout' }).click();
  await expect(page.locator('[data-screen="exercise"]')).toBeVisible();
  await expect(card(page)).toHaveCount(0);
  // (The tour over a workout / its preview is covered in whats-new.spec.ts with an unseen release.)
  const spoken = await page.evaluate(() => window.__spoken);
  expect(spoken.filter((s) => /to-do|report|what's new/i.test(s))).toEqual([]);

  // Every web topic skipped (stored rows), then a fresh open: no card; Settings still opens it.
  await page.goto('/');
  const ids = [
    'coach-calendar',
    'trainer-kit-gym',
    'coach-gym',
    'hands-free',
    'camera',
    'food-photos',
    'apple-card',
    'trainer-kit',
    'claude',
  ];
  await putRows(
    page,
    'todoAnswers',
    ids.map((topicId) => ({
      id: `skip:${topicId}:${NOW}`,
      topicId,
      stepId: '',
      kind: 'skip',
      at: NOW,
      release: APP_RELEASE,
    })),
  );
  await page.reload();
  await expect(page.locator('[data-cal]').first()).toBeVisible();
  await todoReady(page);
  await expect(card(page)).toHaveCount(0);
  await openListFromSettings(page);
  await expect(list(page).locator('[data-todo-summary]')).toContainText(
    `${WEB_TOTAL} of ${WEB_TOTAL} done`,
  );

  expect(offsite).toEqual([]);
  expect(errors).toEqual([]);
});
