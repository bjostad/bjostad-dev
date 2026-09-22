import "./style.css";
import { buildGraph } from "./data/graph";
import { GraphCanvas } from "./graph/canvas";
import { DetailPanel } from "./graph/panel";
import { renderListView } from "./graph/listview";
import { initBackground } from "./background";

const bgCanvas = document.querySelector<HTMLCanvasElement>("#bg-canvas")!;
initBackground(bgCanvas);

const data = buildGraph();

const app = document.querySelector<HTMLDivElement>("#app")!;
app.innerHTML = `
  <header class="site-header">
    <span class="brand">bjostad.dev</span>
    <div class="header-controls">
      <button type="button" class="btn" id="reset-layout">Reset layout</button>
      <button type="button" class="btn" id="toggle-view" aria-pressed="false">List view</button>
    </div>
  </header>
  <main id="canvas-container" class="canvas-container"></main>
  <div id="list-container" class="list-container" hidden></div>
`;

const canvasContainer = document.querySelector<HTMLElement>("#canvas-container")!;
const listContainer = document.querySelector<HTMLElement>("#list-container")!;
const toggleBtn = document.querySelector<HTMLButtonElement>("#toggle-view")!;
const resetBtn = document.querySelector<HTMLButtonElement>("#reset-layout")!;

const panel = new DetailPanel(document.body);
const canvas = new GraphCanvas(canvasContainer, data, (node) => panel.open(node));
renderListView(listContainer, data);

resetBtn.addEventListener("click", () => canvas.resetLayout());

let showingList = false;
toggleBtn.addEventListener("click", () => {
  showingList = !showingList;
  canvasContainer.hidden = showingList;
  listContainer.hidden = !showingList;
  toggleBtn.setAttribute("aria-pressed", String(showingList));
  toggleBtn.textContent = showingList ? "Graph view" : "List view";
  resetBtn.hidden = showingList;
});
