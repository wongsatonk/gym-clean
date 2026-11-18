// M13c task 14 (SPEC M13c goal 3): the one Search button, in the app bar of Today, Fuel,
// Calendar and Settings. It opens the Library with its search field focused (app.ts, task 16).
// Never on Exercise, Rest, the camera or Coach: nothing new is reachable during a set, and Coach
// has its own text box.
//
// Look: a neutral button (surface-2, never the orange that is Start's), magnifier + the word
// "Search". The icon is decorative (aria-hidden); the visible word is the accessible name.
// ≥ 56px tall from the global button rule, 20px text. Hook: `[data-search-open]`.
//
// `pageHead(title, onSearch)` is the row the tab screens put at the top (Calendar, Settings):
// the page title on the left, Search on the right; it wraps instead of scrolling sideways when
// a long title meets a narrow phone.
//
// The callback gets the button, so app.ts can hand focus back to it when the Library closes.
// app.ts must call the Library's `focus()` inside this same tap, or iOS won't show the keyboard.
import { h } from './dom';
import { icon } from './icons';
import './searchButton.css';

/** The button's word (and accessible name). */
export const SEARCH_LABEL = 'Search';

/** Called with the button that was tapped (the opener). */
export type OnSearch = (opener: HTMLElement) => void;

/** Search: magnifier + "Search", ≥ 56px. */
export function searchButton(onSearch: OnSearch): HTMLElement {
  const btn: HTMLElement = h(
    'button',
    {
      type: 'button',
      class: 'search-btn',
      'data-search-open': true,
      onclick: () => onSearch(btn),
    },
    icon('search', 'md'),
    h('span', { class: 'search-btn-label' }, SEARCH_LABEL),
  );
  return btn;
}

/**
 * The top row of a tab screen: `<h1 class="page-title">` + Search. Without `onSearch` it is the
 * bare title, exactly as before M13c.
 */
export function pageHead(title: string, onSearch: OnSearch | undefined): HTMLElement {
  const h1 = h('h1', { class: 'page-title' }, title);
  if (!onSearch) return h1;
  return h('header', { class: 'page-head', 'data-page-head': true }, h1, searchButton(onSearch));
}
