// M12 task 8: the Exercise screen gets no new motion, and the reduced-motion rule is one global
// rule. Render test (fake DOM) + stylesheet guards. Helpers themselves: motion.test.ts.
/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { exerciseScreen } from './screens/exercise';
import { FakeEl, asFake, useFakeDom } from './screens/testDom';

useFakeDom();

const readRaw = (rel: string): string => readFileSync(new URL(rel, import.meta.url), 'utf8');
const stylesCss = readRaw('../styles.css');

function renderExercise() {
  return asFake(
    exerciseScreen(
      {
        dayName: 'Pull A',
        exIndex: 0,
        exTotal: 5,
        exerciseId: 'One-Arm_Dumbbell_Row',
        tracking: 'pose',
        name: 'One-Arm Dumbbell Row',
        repsRange: '8–12',
        setIndex: 0,
        sets: 4,
        reps: 12,
        weightText: '22.5',
        unit: 'kg',
        cue: 'Elbow to hip, squeeze your back.',
        figure: new FakeEl('button') as unknown as HTMLElement,
        hasNotes: false,
      },
      {
        onList: () => {},
        onCamera: () => {},
        onPause: () => {},
        onHowTo: () => {},
        onNotes: () => {},
        onAdjust: () => {},
        onSetDone: () => {},
      },
    ),
  );
}

describe('Exercise screen: no new motion', () => {
  it('is a motion-off screen (data-screen="exercise", matched by MOTION_OFF and styles.css)', () => {
    const el = renderExercise();
    expect(el.getAttribute('data-screen')).toBe('exercise');
    const flat = stylesCss.replace(/\s+/g, ' ');
    expect(flat).toContain(
      ":where([data-motion='off'], [data-screen='exercise'], .camera-sheet) :where(button",
    );
  });

  it('carries no motion / animation class anywhere in its tree', () => {
    const el = renderExercise();
    const animated = [el, ...el.find(() => true)].filter((e) =>
      e.classes.some((c) => /^(motion-|anim)|-in$|stagger|count-up|morph/.test(c)),
    );
    expect(animated.map((e) => e.classes.join(' '))).toEqual([]);
  });
});

describe('stylesheet motion guards', () => {
  const uiCss = Object.keys(import.meta.glob('./**/*.css')).map((p) => [p, readRaw(p)] as const);

  it('styles.css has exactly one reduced-motion rule, and it zeroes animations and transitions', () => {
    const rules = stylesCss.match(/@media \(prefers-reduced-motion[^)]*\)/g) ?? [];
    expect(rules).toEqual(['@media (prefers-reduced-motion: reduce)']);
    const block = stylesCss.slice(stylesCss.indexOf('@media (prefers-reduced-motion: reduce)'));
    expect(block).toMatch(/animation: none !important;/);
    expect(block).toMatch(/transition: none !important;/);
    expect(block).toMatch(/--dur-base: 0ms;/);
  });

  it('coach.css no longer gates motion on its own (the global rule covers the Undo bar)', () => {
    const coach = uiCss.find(([p]) => p.endsWith('coach/coach.css'))?.[1] ?? '';
    expect(coach).not.toContain('prefers-reduced-motion');
  });

  it('new motion in styles.css animates transform/opacity only', () => {
    const frames = [...stylesCss.matchAll(/@keyframes (motion-[\w-]+) \{([\s\S]*?)\n\}/g)];
    expect(frames.map((m) => m[1])).toEqual(['motion-rise', 'motion-fade', 'motion-slide-up']);
    for (const [, , body] of frames) {
      const props = [...(body ?? '').matchAll(/^\s*([a-z-]+):/gm)].map((m) => m[1]);
      for (const p of props) expect(['opacity', 'transform']).toContain(p);
    }
  });
});
