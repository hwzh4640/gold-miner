import type { ItemId } from '../game/Shop';

/** Inline SVG icons so the UI never depends on the platform's emoji font. */
const svg = (body: string, vb = '0 0 48 48') =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb}" width="1em" height="1em" aria-hidden="true">${body}</svg>`;

export const ITEM_ICON: Record<ItemId, string> = {
  dynamite: svg(
    `<rect x="10" y="16" width="26" height="24" rx="5" fill="#d8321f" stroke="#7a1a10" stroke-width="2.5"/>
     <rect x="10" y="24" width="26" height="6" fill="#f7d13a"/>
     <path d="M30 16 q4 -10 12 -8" fill="none" stroke="#6b4a1f" stroke-width="3" stroke-linecap="round"/>
     <circle cx="42" cy="8" r="4" fill="#ffb02a"/><circle cx="42" cy="8" r="2" fill="#fff4a0"/>`,
  ),
  drink: svg(
    `<path d="M14 10 h20 l-3 30 h-14 z" fill="#3aa0e8" stroke="#1b5f94" stroke-width="2.5" stroke-linejoin="round"/>
     <rect x="12" y="6" width="24" height="6" rx="2" fill="#d8dee6" stroke="#6b7480" stroke-width="2"/>
     <path d="M24 12 l8 -10" stroke="#ff6b3d" stroke-width="3" stroke-linecap="round"/>
     <path d="M18 20 l4 10 l4 -8 l4 10" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>`,
  ),
  rockBook: svg(
    `<rect x="9" y="7" width="30" height="34" rx="3" fill="#c0392b" stroke="#6d1f16" stroke-width="2.5"/>
     <rect x="14" y="7" width="3" height="34" fill="#8e2a1f"/>
     <path d="M26 30 l-5 -6 l3 -6 l7 -1 l4 6 l-3 7 z" fill="#8f979f" stroke="#3b4248" stroke-width="2" stroke-linejoin="round"/>`,
  ),
  polish: svg(
    `<path d="M14 18 l6 -8 h8 l6 8 l-10 14 z" fill="#9fe8ff" stroke="#1b6f94" stroke-width="2.5" stroke-linejoin="round"/>
     <path d="M14 18 h20 M20 10 l4 8 l4 -8 M24 18 v14" fill="none" stroke="#fff" stroke-width="1.5"/>
     <path d="M36 36 l2 -6 l2 6 l6 2 l-6 2 l-2 6 l-2 -6 l-6 -2 z" fill="#fff3a0" stroke="#e0a800" stroke-width="1"/>`,
  ),
  clover: svg(
    `<g fill="#3fae3a" stroke="#1c6d19" stroke-width="2">
       <circle cx="17" cy="17" r="8"/><circle cx="31" cy="17" r="8"/><circle cx="17" cy="31" r="8"/><circle cx="31" cy="31" r="8"/>
     </g>
     <circle cx="24" cy="24" r="5" fill="#3fae3a"/>
     <path d="M24 30 q-2 8 -6 14" fill="none" stroke="#1c6d19" stroke-width="3" stroke-linecap="round"/>`,
  ),
};

export const PAUSE_ICON = svg(`<rect x="10" y="8" width="10" height="32" rx="2" fill="currentColor"/><rect x="28" y="8" width="10" height="32" rx="2" fill="currentColor"/>`);
