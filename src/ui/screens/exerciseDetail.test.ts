// M13c task 13: the exercise detail screen (render + callbacks), made-up and real data.
import { describe, expect, it } from 'vitest';
import { cameraInfo, type CameraInfo } from '../../core/exercises';
import type { ExerciseHistory } from '../../core/history';
import { checkCopy } from '../../core/trainer/replies';
import { howToContent } from '../howToSheet';
import { FakeEl, asFake, useFakeDom } from './testDom';
import {
  DETAIL_LEARNING,
  GYM_HAS_IT,
  NOT_DONE_YET,
  NOT_IN_PLAN,
  bestSetParts,
  detailCopy,
  detailHistoryOf,
  exerciseDetailScreen,
  howToLabel,
  lastLine,
  planLine,
  setsRepsText,
  type ExerciseDetailActions,
  type ExerciseDetailProps,
} from './exerciseDetail';

useFakeDom();

const hook = (el: FakeEl, attr: string, value?: string) =>
  el.find((e) => e.hasAttribute(attr) && (value === undefined || e.getAttribute(attr) === value));
const one = (el: FakeEl, attr: string, value?: string): FakeEl => {
  const hit = hook(el, attr, value)[0];
  if (!hit) throw new Error(`no [${attr}${value ? `=${value}` : ''}]`);
  return hit;
};

const D = (day: number) => new Date(2026, 10, day, 18, 0).getTime(); // Nov 2026

const CAM: CameraInfo = {
  counts: 'Counts each curl from your elbow angle.',
  lines: ['Phone at waist height', 'Side-on'],
  view: 'side',
  facing: 'Side-on',
  distanceM: [1.5, 2],
  heightHint: 'Waist height',
  learning: false,
};

function setup(over: Partial<ExerciseDetailProps> = {}) {
  const calls: string[] = [];
  const actions: ExerciseDetailActions = {
    onBack: () => calls.push('back'),
    onBadge: (kind, id, opener) => calls.push(`badge:${kind}:${id}:${asFake(opener).tag}`),
    onHowTo: (opener) => calls.push(`howto:${asFake(opener).tag}`),
    onMyGym: () => calls.push('mygym'),
    onCameraInfo: (opener) => calls.push(`camera:${asFake(opener).tag}`),
    onHistory: () => calls.push('history'),
  };
  const props: ExerciseDetailProps = {
    exerciseId: 'Dumbbell_Bicep_Curl',
    name: 'Dumbbell Bicep Curl',
    tracking: 'pose',
    ruleStatus: 'tuned',
    content: {
      title: 'Dumbbell Bicep Curl',
      hasDemo: true,
      tempo: 'Lift 1 s · Lower 2 s',
      lines: ['Elbows by your sides.', 'Curl up, palms up.', 'Lower slowly.'],
      focus: 'Focus: biceps. Forearms help.',
      cue: 'Elbows pinned',
      primary: ['biceps'],
      secondary: ['forearms'],
    },
    equipment: 'Dumbbell',
    needs: [],
    camera: CAM,
    plan: [
      { day: 'Pull A', sets: 4, targetReps: [8, 12] },
      { day: 'Pull B', sets: 3, targetReps: [10, 10] },
    ],
    history: {
      last: {
        date: D(12),
        sets: [
          { reps: 10, weightKg: 12.5 },
          { reps: 8, weightKg: 12.5 },
        ],
      },
      best: { reps: 10, weightKg: 12.5 },
    },
    unit: 'kg',
    ...over,
  };
  return { el: asFake(exerciseDetailScreen(props, actions)), calls };
}

describe('pure helpers', () => {
  it('plan, sets × reps, how-to label', () => {
    expect(setsRepsText(4, [8, 12])).toBe('4 × 8–12 reps');
    expect(setsRepsText(3, [10, 10])).toBe('3 × 10 reps');
    expect(planLine({ day: 'Push A', sets: 4, targetReps: [8, 12] })).toBe(
      'Push A · 4 × 8–12 reps',
    );
    expect(howToLabel(true)).toBe('Watch 3D demo');
    expect(howToLabel(false)).toBe('How to');
  });

  it('best set parts (weighted, bodyweight, lb) and the last-time line', () => {
    expect(bestSetParts({ reps: 10, weightKg: 22.5 }, 'kg')).toEqual({
      num: '10 × 22.5',
      unit: 'reps × kg',
    });
    expect(bestSetParts({ reps: 15, weightKg: 0 }, 'kg')).toEqual({ num: '15', unit: 'reps' });
    expect(bestSetParts({ reps: 1, weightKg: 0 }, 'kg').unit).toBe('rep');
    expect(bestSetParts({ reps: 8, weightKg: 20 }, 'lb').unit).toBe('reps × lb');
    expect(
      lastLine(
        {
          date: D(12),
          sets: [
            { reps: 10, weightKg: 12.5 },
            { reps: 8, weightKg: 12.5 },
          ],
        },
        'kg',
      ),
    ).toBe('Thu 12 Nov · 10×12.5, 8×12.5 kg');
  });

  it('detailHistoryOf: latest session + best set; none → null', () => {
    const hist: ExerciseHistory = {
      exerciseId: 'x',
      sessions: [
        {
          sessionId: 's1',
          date: D(5),
          dayStart: D(5),
          sets: [{ reps: 8, weightKg: 15, focusScore: null }],
          topSet: { reps: 8, weightKg: 15 },
          volumeKg: 120,
          focusScores: [],
          avgFocus: null,
        },
        {
          sessionId: 's2',
          date: D(12),
          dayStart: D(12),
          sets: [
            { reps: 10, weightKg: 12.5, focusScore: 80 },
            { reps: 9, weightKg: 12.5, focusScore: null },
          ],
          topSet: { reps: 10, weightKg: 12.5 },
          volumeKg: 237.5,
          focusScores: [80],
          avgFocus: 80,
        },
      ],
      trend: {
        bestSet: { reps: 8, weightKg: 15, sessionId: 's1', date: D(5) },
        volumeChangeKg: 117.5,
        volumeChangePct: 98,
        avgFocus: 80,
      },
    };
    expect(detailHistoryOf(hist)).toEqual({
      last: {
        date: D(12),
        sets: [
          { reps: 10, weightKg: 12.5 },
          { reps: 9, weightKg: 12.5 },
        ],
      },
      best: { reps: 8, weightKg: 15 },
    });
    expect(detailHistoryOf(null)).toBeNull();
    expect(
      detailHistoryOf({
        exerciseId: 'x',
        sessions: [],
        trend: { bestSet: null, volumeChangeKg: null, volumeChangePct: null, avgFocus: null },
      }),
    ).toBeNull();
  });

  it('every string passes checkCopy and says "you", never he/she', () => {
    for (const s of [...detailCopy(), DETAIL_LEARNING, GYM_HAS_IT, NOT_IN_PLAN, NOT_DONE_YET]) {
      expect(checkCopy(s).ok, s).toBe(true);
      expect(s, s).not.toMatch(/\b(he|she|his|her|him)\b/i);
    }
  });
});

describe('Exercise detail screen', () => {
  it('tracked, in the plan, with history: every block', () => {
    const { el } = setup();
    expect(el.getAttribute('data-screen')).toBe('exercise-detail');
    expect(el.getAttribute('data-exercise')).toBe('Dumbbell_Bicep_Curl');
    expect(el.classes).toContain('mood-pro');
    expect(el.byTag('h1')[0]?.textContent).toBe('Dumbbell Bicep Curl');
    expect(one(el, 'data-detail-back').textContent).toBe('Library');
    expect(hook(el, 'data-badge-open').map((b) => b.getAttribute('data-badge-open'))).toEqual([
      '3d',
      'camera',
    ]);
    expect(one(el, 'data-detail-map').innerHTML).toContain('data-muscle="biceps"');
    const legend = one(el, 'data-detail-legend').textContent;
    expect(legend).toContain('Main');
    expect(legend).toContain('Biceps');
    expect(legend).toContain('Helpers');
    expect(legend).toContain('Forearms');
    expect(one(el, 'data-detail-howto').textContent).toBe('Watch 3D demo');
    expect(one(el, 'data-detail-tempo').textContent).toBe('Lift 1 s · Lower 2 s');
    expect(one(el, 'data-detail-lines').byTag('li')).toHaveLength(3);
    expect(one(el, 'data-detail-focus').textContent).toBe('Focus: biceps. Forearms help.');
    expect(one(el, 'data-cue-panel').textContent).toBe('Elbows pinned');
    expect(one(el, 'data-detail-gym').getAttribute('data-detail-gym')).toBe('has');
    expect(one(el, 'data-detail-gym').textContent).toBe(GYM_HAS_IT);
    const cam = one(el, 'data-detail-camera-block');
    expect(cam.textContent).toContain('Counts each curl from your elbow angle.');
    expect(hook(cam, 'data-detail-learning')).toHaveLength(0);
    expect(hook(el, 'data-detail-plan-row').map((r) => r.textContent)).toEqual([
      'Pull A · 4 × 8–12 reps',
      'Pull B · 3 × 10 reps',
    ]);
    expect(hook(el, 'data-detail-notplan')).toHaveLength(0);
    expect(one(el, 'data-detail-last').textContent).toContain('Thu 12 Nov · 10×12.5, 8×12.5 kg');
    const best = one(el, 'data-detail-best');
    expect(best.oneByClass('detail-best-num').textContent).toBe('10 × 12.5');
    expect(best.textContent).toContain('reps × kg');
    expect(hook(el, 'data-detail-new')).toHaveLength(0);
  });

  it('manual, not in the plan, never done, gym lacks kit, no demo', () => {
    const { el } = setup({
      // A made-up id: never in the demo registry, so the badge stays "Info" whatever 3D lands.
      exerciseId: 'Made_Up_Raise',
      name: 'Made Up Raise',
      tracking: 'manual',
      ruleStatus: null,
      content: { ...setupContent(), hasDemo: false },
      needs: ['Pull-up bar'],
      camera: null,
      plan: [],
      history: null,
    });
    expect(hook(el, 'data-badge-open').map((b) => b.getAttribute('data-badge-open'))).toEqual([
      'info',
    ]);
    expect(one(el, 'data-detail-howto').textContent).toBe('How to');
    expect(one(el, 'data-detail-gym').getAttribute('data-detail-gym')).toBe('needs');
    expect(one(el, 'data-detail-gym').textContent).toBe('Needs: Pull-up bar');
    expect(hook(el, 'data-detail-camera-block')).toHaveLength(0);
    expect(hook(el, 'data-detail-camera')).toHaveLength(0);
    expect(one(el, 'data-detail-notplan').textContent).toBe(NOT_IN_PLAN);
    expect(one(el, 'data-detail-new').textContent).toBe(NOT_DONE_YET);
    expect(hook(el, 'data-detail-best')).toHaveLength(0);
    expect(hook(el, 'data-detail-see-history')).toHaveLength(0);
  });

  it('a learning rule shows the learning line and the Learning badge', () => {
    const { el } = setup({ ruleStatus: 'learning', camera: { ...CAM, learning: true } });
    expect(one(el, 'data-detail-learning').textContent).toBe(DETAIL_LEARNING);
    expect(hook(el, 'data-badge-open').map((b) => b.getAttribute('data-badge-open'))).toContain(
      'learning',
    );
  });

  it('bodyweight best set shows reps as the number', () => {
    const { el } = setup({
      history: {
        last: { date: D(12), sets: [{ reps: 15, weightKg: 0 }] },
        best: { reps: 15, weightKg: 0 },
      },
    });
    expect(one(el, 'data-detail-best').oneByClass('detail-best-num').textContent).toBe('15');
    expect(one(el, 'data-detail-last').textContent).toContain('15 reps');
  });

  it('every button calls back (with its opener where a sheet opens); nothing else fires', () => {
    const { el, calls } = setup({ backLabel: 'Search' });
    expect(one(el, 'data-detail-back').textContent).toBe('Search');
    one(el, 'data-detail-back').click();
    one(el, 'data-badge-open', '3d').click();
    one(el, 'data-badge-open', 'camera').click();
    one(el, 'data-detail-howto').click();
    one(el, 'data-detail-mygym').click();
    one(el, 'data-detail-camera').click();
    one(el, 'data-detail-see-history').click();
    expect(calls).toEqual([
      'back',
      'badge:3d:Dumbbell_Bicep_Curl:button',
      'badge:camera:Dumbbell_Bicep_Curl:button',
      'howto:button',
      'mygym',
      'camera:button',
      'history',
    ]);
  });

  it('renders the real catalog: an abs exercise (manual) and the curl (tracked)', () => {
    const abs = setup({
      exerciseId: 'Crunches',
      name: 'Crunches',
      tracking: 'manual',
      ruleStatus: undefined,
      content: howToContent('Crunches'),
      camera: cameraInfo('Crunches'),
      plan: [],
      history: null,
    }).el;
    expect(hook(abs, 'data-detail-camera-block')).toHaveLength(0);
    expect(one(abs, 'data-detail-map').innerHTML).toContain('abdominals');
    expect(one(abs, 'data-detail-lines').byTag('li').length).toBeGreaterThanOrEqual(2);
    expect(one(abs, 'data-cue-panel').textContent.length).toBeGreaterThan(0);

    const real = cameraInfo('Dumbbell_Bicep_Curl');
    expect(real).not.toBeNull();
    const curl = setup({
      content: howToContent('Dumbbell_Bicep_Curl'),
      camera: real,
      ruleStatus: undefined,
    }).el;
    expect(one(curl, 'data-detail-camera-block').textContent).toContain(real?.counts ?? '?');
  });
});

function setupContent() {
  return {
    title: 'Hanging Leg Raise',
    hasDemo: false,
    tempo: 'Raise 1 s · Lower 2 s',
    lines: ['Hang from the bar.', 'Raise your legs.'],
    focus: 'Focus: abs.',
    cue: 'No swinging',
    primary: ['abdominals'],
    secondary: [],
  };
}
