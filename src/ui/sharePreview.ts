// M13 task 25: the Share month preview (Pro mood). Pure render: props in, callbacks out. He sees
// the image, picks Post size (1080×1350) or Story size (1080×1920) and, for the Story, the number
// it leads with (core `leadOptions` / `pickLead`: only leads whose number is above 0, sessions
// first). Share hands the PNG to the share sheet or a download (shareMonth.ts); nothing is
// uploaded. Main renders the image (`shareMonthLayout` / `shareStoryLayout` → `renderShareMonth`)
// and passes it in as an object URL, re-rendering this view on each change.
//
// e2e hooks: `main[data-screen="share-preview"]`, `[data-share-size="post"|"story"]`,
// `[data-share-lead="sessions"|"volume"|"streak"]`, `[data-share-image]`, `[data-share-go]`,
// `[data-share-busy]`.
import type { ShareLead } from '../core/types';
import { backButton } from './backButton';
import { h } from './dom';
import { icon } from './icons';
import type { ShareSize } from './shareMonth';
import { moodClass } from './tokens';
import './sharePreview.css';

export const LEAD_LABELS: Record<ShareLead, string> = {
  sessions: 'Sessions done',
  volume: 'Total lifted',
  streak: 'Weeks in a row',
};

const SIZE_LABELS: Record<ShareSize, string> = { post: 'Post size', story: 'Story size' };

export const SHARE_NOTE = 'Made on this phone. Nothing is uploaded.';

export function sharePreviewCopy(): string[] {
  return [
    'Share month',
    'Size',
    'Lead with',
    'Share',
    'Making the image…',
    SHARE_NOTE,
    ...Object.values(SIZE_LABELS),
    ...Object.values(LEAD_LABELS),
  ];
}

export type SharePreviewProps = {
  /** "November 2026". */
  monthLabel: string;
  size: ShareSize;
  /** `leadOptions(stats)`. */
  leads: readonly ShareLead[];
  /** `pickLead(stats, wanted)`; null when every number is 0. */
  lead: ShareLead | null;
  /** Object URL of the current image; omitted while it is being made. */
  image?: string | undefined;
  busy?: boolean | undefined;
};

export type SharePreviewActions = {
  onSize: (size: ShareSize) => void;
  onLead: (lead: ShareLead) => void;
  onShare: () => void;
  /** Back to the Calendar. */
  onClose: () => void;
};

function segBtn(
  label: string,
  on: boolean,
  hook: Record<string, string>,
  onPick: () => void,
): HTMLElement {
  return h(
    'button',
    {
      type: 'button',
      class: on ? 'seg-btn active' : 'seg-btn',
      'aria-pressed': on ? 'true' : 'false',
      ...hook,
      onclick: () => {
        if (!on) onPick();
      },
    },
    on ? icon('check', 'sm') : null,
    h('span', {}, label),
  );
}

export function sharePreview(p: SharePreviewProps, a: SharePreviewActions): HTMLElement {
  const sizes = (['post', 'story'] as const).map((s) =>
    segBtn(SIZE_LABELS[s], p.size === s, { 'data-share-size': s }, () => a.onSize(s)),
  );
  const showLeads = p.size === 'story' && p.leads.length >= 2;
  const leads = showLeads
    ? h(
        'div',
        { class: 'share-group' },
        h('h2', { class: 'set-head', id: 'share-lead-head' }, 'Lead with'),
        h(
          'div',
          {
            class: `segmented share-leads${p.leads.length === 3 ? ' seg-3' : ''}`,
            role: 'group',
            'aria-labelledby': 'share-lead-head',
          },
          ...p.leads.map((l) =>
            segBtn(LEAD_LABELS[l], p.lead === l, { 'data-share-lead': l }, () => a.onLead(l)),
          ),
        ),
      )
    : null;

  const picture = p.image
    ? h('img', {
        class: `share-image share-${p.size}`,
        'data-share-image': true,
        src: p.image,
        alt: `${SIZE_LABELS[p.size]} image for ${p.monthLabel}`,
      })
    : h(
        'p',
        {
          class: `share-image share-${p.size} share-busy`,
          role: 'status',
          'data-share-busy': true,
        },
        'Making the image…',
      );

  return h(
    'main',
    {
      class: `screen share-preview settings ${moodClass('pro')}`,
      'data-screen': 'share-preview',
    },
    h('header', { class: 'top-bar' }, backButton(a.onClose, 'Calendar')),
    h('h1', { class: 'page-title' }, 'Share month'),
    h('div', { class: 'share-frame' }, picture),
    h(
      'div',
      { class: 'share-group' },
      h('h2', { class: 'set-head', id: 'share-size-head' }, 'Size'),
      h(
        'div',
        { class: 'segmented', role: 'group', 'aria-labelledby': 'share-size-head' },
        ...sizes,
      ),
    ),
    leads,
    h(
      'button',
      {
        type: 'button',
        class: 'primary-btn cta-btn share-go',
        'data-share-go': true,
        disabled: p.busy === true || !p.image,
        onclick: () => a.onShare(),
      },
      h('span', {}, 'Share'),
    ),
    h('p', { class: 'muted set-note' }, SHARE_NOTE),
  );
}
