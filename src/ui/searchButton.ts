// M13c task 14 (SPEC M13c goal 3): the one Search button, in the app bar of Today, Fuel,
// Calendar and Settings. It opens the Library with its search field focused (app.ts, task 16).
// Never on Exercise, Rest, the camera or Coach: nothing new is reachable during a set, and Coach
// has its own text box.
//
// Look (M13d task 40a, SPEC M13d Goal 7): the shared round icon button, secondary (surface-2,
// never the orange that is Start's): a 56px circle with the magnifier and the word "Search"
// beside it. The icon is decorative (aria-hidden); the visible word is the accessible name.
// Hook: `[data-search-open]` (and `.search-btn`).
//
// `pageHead(title, onSearch)` is the row the tab screens put at the top (Calendar, Settings):
// the page title on the left, Search on the right; it wraps instead of scrolling sideways when
// a long title meets a narrow phone.
//
// The callback gets the button, so app.ts can hand focus back to it when the Library closes.
// app.ts must call the Library's `focus()` inside this same tap, or iOS won't show the keyboard.
import { h } from './dom';
import { iconButton } from './iconButton';
import './searchButton.css';

/** The button's word (and accessible name). */
export const SEARCH_LABEL = 'Search';

/** Called with the button that was tapped (the opener). */
export type OnSearch = (opener: HTMLElement) => void;

/** Search: a round magnifier + "Search" beside it, ≥ 56px. */
export function searchButton(onSearch: OnSearch): HTMLElement {
  const btn = iconButton({
    icon: 'search',
    label: SEARCH_LABEL,
    labelAt: 'beside',
    class: 'search-btn',
    hooks: { 'data-search-open': true },
    onClick: (b) => onSearch(b),
  });
  // `search-btn` first: screens' render tests name a header's children by their first class.
  btn.setAttribute('class', 'search-btn icon-btn');
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
