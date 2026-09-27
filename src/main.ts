import "./style.css";
import { buildGraph } from "./data/graph";
import { GraphCanvas } from "./graph/canvas";
import { DetailPanel } from "./graph/panel";
import { DetailSection } from "./graph/detailSection";
import { renderListView } from "./graph/listview";
import { initBackground } from "./background";
import { searchFocus } from "./data/search";
import type { Focus } from "./data/types";

const bgCanvas = document.querySelector<HTMLCanvasElement>("#bg-canvas")!;
initBackground(bgCanvas);

const data = buildGraph();
const resumeUrl = data.nodes.find((n) => n.type === "contact")?.links?.find((l) => /resume/i.test(l.label))?.url;

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <div class="graph-screen">
    <header class="site-header">
      <a class="brand" href="/" aria-label="bjostad.dev, back to the start">
        <img class="brand-mark" src="/favicon.svg" alt="" width="26" height="26" />
        <span>bjostad<span class="brand-tld">.dev</span></span>
      </a>
      <nav class="lens-bar" aria-label="Highlight projects by role">
        <div class="lens-chips">
          <button type="button" class="lens-chip" data-lens="" aria-pressed="true">All</button>
          ${data.lenses
            .map((l) => `<button type="button" class="lens-chip" data-lens="${l.id}" aria-pressed="false">${l.label}</button>`)
            .join("")}
        </div>
        <select class="lens-select" aria-label="Highlight projects by role">
          <option value="">All projects</option>
          ${data.lenses.map((l) => `<option value="${l.id}">${l.label}</option>`).join("")}
        </select>
        <input type="search" class="lens-search" placeholder="Search a skill…" aria-label="Search skills and projects" spellcheck="false" />
      </nav>
      <div class="header-controls">
        ${resumeUrl
          ? `<a class="btn btn-doc" href="${resumeUrl}" target="_blank" rel="noopener" aria-label="Résumé (PDF, opens in a new tab)">
              <svg class="btn-icon" viewBox="0 0 16 16" aria-hidden="true"><path d="M4 1.5h5.5L13 5v9.5H4z M9.5 1.5V5H13 M6.5 8.5h4 M6.5 11h4" /></svg>Résumé
            </a>`
          : ""}
        <button type="button" class="btn" id="toggle-view" aria-pressed="false">List view</button>
      </div>
      <p class="focus-caption" aria-live="polite" hidden></p>
    </header>
    <main id="canvas-container" class="canvas-container"></main>
    <div id="list-container" class="list-container" hidden></div>
  </div>
  <section id="detail-section" class="project-detail" aria-live="polite" hidden></section>
  <svg class="page-links" aria-hidden="true"><path class="page-link" /></svg>
`;

const canvasContainer = document.querySelector<HTMLElement>("#canvas-container")!;
const listContainer = document.querySelector<HTMLElement>("#list-container")!;
const toggleBtn = document.querySelector<HTMLButtonElement>("#toggle-view")!;

const panel = new DetailPanel(document.body);
const detailSection = new DetailSection(
  document.querySelector<HTMLElement>("#detail-section")!,
  document.querySelector<SVGSVGElement>(".page-links")!,
);
const canvas = new GraphCanvas(canvasContainer, data, (node) => {
  if (node.type === "project" || node.type === "contact") detailSection.show(node);
  else panel.open(node);
});
canvas.onRender = () => detailSection.refresh();
renderListView(listContainer, data);

// Sits in the canvas's top-right corner and only appears once a card has
// been dragged out of the default arrangement.
const resetBtn = document.createElement("button");
resetBtn.type = "button";
resetBtn.className = "btn reset-layout";
resetBtn.textContent = "Reset layout";
resetBtn.hidden = !canvas.hasCustomLayout;
canvasContainer.appendChild(resetBtn);
resetBtn.addEventListener("pointerdown", (ev) => ev.stopPropagation());
resetBtn.addEventListener("click", (ev) => {
  ev.stopPropagation();
  canvas.resetLayout();
});
canvas.onLayoutChange = (custom) => {
  resetBtn.hidden = !custom;
};

let showingList = false;
toggleBtn.addEventListener("click", () => {
  showingList = !showingList;
  canvasContainer.hidden = showingList;
  listContainer.hidden = !showingList;
  toggleBtn.setAttribute("aria-pressed", String(showingList));
  toggleBtn.textContent = showingList ? "Graph view" : "List view";
  detailSection.refresh();
});

// Lens chips and search share one focus: picking a lens clears the search
// and typing clears the lens. Both are kept in the URL (?lens=backend,
// ?q=postgres) so a link can open straight into the view for a role.
const lensChips = [...document.querySelectorAll<HTMLButtonElement>(".lens-chip")];
const lensBar = document.querySelector<HTMLElement>(".lens-bar")!;
const lensChipRow = document.querySelector<HTMLElement>(".lens-chips")!;
const lensSelect = document.querySelector<HTMLSelectElement>(".lens-select")!;
const searchInput = document.querySelector<HTMLInputElement>(".lens-search")!;
const caption = document.querySelector<HTMLElement>(".focus-caption")!;
const params = new URLSearchParams(location.search);
let lensId = data.lenses.some((l) => l.id === params.get("lens")) ? params.get("lens")! : "";
searchInput.value = params.get("q") ?? "";
if (searchInput.value) lensId = "";

function lensFocus(id: string): Focus | null {
  const lens = data.lenses.find((l) => l.id === id);
  return lens ? { label: lens.label, projects: lens.projects, skills: lens.skills, ranked: true } : null;
}

/** What the page shows when no chip is being previewed: the clicked lens or the search. */
let committedFocus: Focus | null = null;

function applyFocus() {
  cancelPreview();
  const query = searchInput.value.trim();
  let focus: Focus | null = null;
  let captionHtml = "";
  if (query) {
    focus = searchFocus(data, query);
    if (focus) {
      const n = focus.projects.length;
      captionHtml = n
        ? `<strong>“${esc(query)}”</strong> ${n} project${n === 1 ? "" : "s"}`
        : `<strong>“${esc(query)}”</strong> No matches. Try another skill`;
    }
  } else {
    focus = lensFocus(lensId);
  }

  committedFocus = focus;
  canvas.setFocus(focus);
  renderListView(listContainer, data, focus);
  caption.innerHTML = captionHtml;
  caption.hidden = !captionHtml;
  for (const chip of lensChips) {
    chip.setAttribute("aria-pressed", String(!query && chip.dataset.lens === lensId));
  }
  lensSelect.value = query ? "" : lensId;

  const url = new URL(location.href);
  url.searchParams.delete("lens");
  url.searchParams.delete("q");
  if (query) url.searchParams.set("q", query);
  else if (lensId) url.searchParams.set("lens", lensId);
  history.replaceState(null, "", url);
}

// With a mouse, resting on a chip previews its lens on the graph; leaving
// the chip row puts back whatever was clicked. The short delay keeps the
// graph from flashing through every lens as the pointer crosses the row.
// A preview never touches the URL, the pressed chip, or the list view.
const canHover = window.matchMedia("(hover: hover) and (pointer: fine)");
const PREVIEW_DELAY_MS = 120;
let previewTimer: number | undefined;
let previewing = false;

function cancelPreview() {
  window.clearTimeout(previewTimer);
  if (previewing) {
    previewing = false;
    canvas.setFocus(committedFocus);
  }
}

lensChipRow.addEventListener("mouseleave", cancelPreview);

for (const chip of lensChips) {
  chip.addEventListener("mouseenter", () => {
    if (!canHover.matches) return;
    window.clearTimeout(previewTimer);
    previewTimer = window.setTimeout(() => {
      previewing = true;
      canvas.setFocus(lensFocus(chip.dataset.lens ?? ""));
    }, PREVIEW_DELAY_MS);
  });
  chip.addEventListener("click", () => {
    lensId = chip.dataset.lens ?? "";
    searchInput.value = "";
    applyFocus();
  });
}
lensSelect.addEventListener("change", () => {
  lensId = lensSelect.value;
  searchInput.value = "";
  applyFocus();
});
searchInput.addEventListener("input", () => {
  lensId = "";
  applyFocus();
});
searchInput.addEventListener("keydown", (ev) => {
  if (ev.key === "Escape") {
    searchInput.value = "";
    applyFocus();
  }
});
applyFocus();

// The chips swap for a dropdown whenever the header is too narrow to show
// them all in one line. Measured with the chips showing, since that's the
// only way to know whether they'd fit.
function fitLensBar() {
  lensBar.classList.remove("collapsed");
  lensBar.classList.toggle("collapsed", lensChipRow.scrollWidth > lensChipRow.clientWidth);
}
new ResizeObserver(fitLensBar).observe(document.querySelector(".site-header")!);
document.fonts?.ready.then(fitLensBar);

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
