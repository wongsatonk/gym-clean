import { describe, expect, it, vi } from 'vitest';
import { checkCopy } from '../core/trainer/replies';
import {
  LEAD_LABELS,
  sharePreview,
  sharePreviewCopy,
  type SharePreviewProps,
} from './sharePreview';
import { asFake, useFakeDom, type FakeEl } from './screens/testDom';

useFakeDom();

const render = (over: Partial<SharePreviewProps> = {}) => {
  const a = { onSize: vi.fn(), onLead: vi.fn(), onShare: vi.fn(), onClose: vi.fn() };
  const el = asFake(
    sharePreview(
      {
        monthLabel: 'November 2026',
        size: 'story',
        leads: ['sessions', 'volume', 'streak'],
        lead: 'sessions',
        image: 'blob:local/1',
        ...over,
      },
      a,
    ),
  );
  return { el, a };
};

const by = (el: FakeEl, attr: string, v?: string) =>
  el.find((e) => (v === undefined ? e.hasAttribute(attr) : e.getAttribute(attr) === v));

describe('sharePreview', () => {
  it('offers Post size / Story size, the current one pressed (word + check, not colour alone)', () => {
    const { el, a } = render();
    const post = by(el, 'data-share-size', 'post')[0];
    const story = by(el, 'data-share-size', 'story')[0];
    expect(post?.textContent).toBe('Post size');
    expect(story?.textContent).toBe('Story size');
    expect(story?.getAttribute('aria-pressed')).toBe('true');
    expect(story?.byTag('svg')).toHaveLength(1);
    expect(post?.getAttribute('aria-pressed')).toBe('false');
    post?.click();
    expect(a.onSize).toHaveBeenCalledWith('post');
    story?.click();
    expect(a.onSize).toHaveBeenCalledTimes(1);
  });

  it('Story: the lead picker lists the offered leads, sessions first', () => {
    const { el, a } = render();
    const leads = by(el, 'data-share-lead');
    expect(leads.map((l) => l.textContent)).toEqual([
      LEAD_LABELS.sessions,
      LEAD_LABELS.volume,
      LEAD_LABELS.streak,
    ]);
    expect(leads[0]?.getAttribute('aria-pressed')).toBe('true');
    leads[1]?.click();
    expect(a.onLead).toHaveBeenCalledWith('volume');
  });

  it('no lead picker for Post size, or with fewer than two leads', () => {
    expect(by(render({ size: 'post' }).el, 'data-share-lead')).toHaveLength(0);
    expect(by(render({ leads: ['sessions'] }).el, 'data-share-lead')).toHaveLength(0);
    expect(by(render({ leads: [], lead: null }).el, 'data-share-lead')).toHaveLength(0);
  });

  it('shows the image with a text alternative; Share and Back call out', () => {
    const { el, a } = render();
    const img = el.byTag('img')[0];
    expect(img?.getAttribute('src')).toBe('blob:local/1');
    expect(img?.getAttribute('alt')).toContain('November 2026');
    by(el, 'data-share-go')[0]?.click();
    expect(a.onShare).toHaveBeenCalledTimes(1);
    by(el, 'data-back')[0]?.click();
    expect(a.onClose).toHaveBeenCalledTimes(1);
  });

  it('while the image is being made: a status line, Share disabled', () => {
    const { el } = render({ image: undefined, busy: true });
    expect(el.byTag('img')).toHaveLength(0);
    expect(by(el, 'data-share-busy')[0]?.getAttribute('role')).toBe('status');
    expect(by(el, 'data-share-go')[0]?.hasAttribute('disabled')).toBe(true);
  });

  it('copy passes checkCopy and says nothing is uploaded', () => {
    const copy = sharePreviewCopy();
    for (const l of copy) expect(checkCopy(l).hits, l).toEqual([]);
    expect(copy.join(' ')).toContain('Nothing is uploaded');
  });
});
