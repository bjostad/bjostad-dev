import type { Highlight } from "../data/types";

/**
 * List items for a project's highlights. A structured highlight shows a bold
 * headline and its one-line point, so the list can be scanned; any longer
 * detail sits behind a native <details> toggle (keyboard and screen-reader
 * accessible for free).
 */
export function renderHighlightItems(highlights: Highlight[]): string {
  return highlights.map(renderItem).join("");
}

function renderItem(h: Highlight): string {
  if (typeof h === "string") return `<li>${esc(h)}</li>`;
  const head = `<strong class="point-title">${esc(h.title)}</strong><span class="point-text">${esc(h.point)}</span>`;
  if (!h.detail) return `<li class="point">${head}</li>`;
  return `
    <li class="point">
      <details>
        <summary>${head}<span class="point-cue" aria-hidden="true"></span></summary>
        <p class="point-detail">${esc(h.detail)}</p>
      </details>
    </li>`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
