// The phone set-up pictogram (original line art, decorative): a phone on the left looking at a
// person, front-on or side-on. Used by the camera view's "Set up your phone" card and by the M13c
// Camera sheet (src/ui/cameraInfoSheet.ts). Stroke/fill colours come from `.setup-pic` in
// src/styles.css (tokens only); callers size it with their own class.

const SVG_NS = 'http://www.w3.org/2000/svg';

/** Original line pictogram: a phone on the left looking at a person, front-on or side-on. */
export function placementPictogram(view: 'side' | 'front', extraClass?: string): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 120 80');
  svg.setAttribute('class', extraClass ? `setup-pic ${extraClass}` : 'setup-pic');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('data-view', view);
  const person =
    view === 'front'
      ? // Facing the phone: head, shoulders, both arms, both legs.
        '<circle cx="92" cy="16" r="7"/><path d="M92 23v26M78 30h28M78 30l-4 16M106 30l4 16M92 49l-8 24M92 49l8 24"/>'
      : // Side-on, facing the same way as the phone's view line: one arm forward, nose bump.
        '<circle cx="92" cy="16" r="7"/><path d="M99 15l3 2-3 1M92 23v26M92 30l8 14M92 49l-4 24M92 49l5 24"/>';
  svg.innerHTML =
    '<rect x="8" y="26" width="16" height="28" rx="3" class="pic-phone"/>' +
    '<circle cx="16" cy="31" r="1.6" class="pic-lens"/>' +
    '<path d="M28 40H66" class="pic-sight"/>' +
    `<g class="pic-person">${person}</g>`;
  return svg;
}
