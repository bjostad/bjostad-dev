import type { GraphData, GraphNode } from "../data/types";
import { computeInitialLayout, type LayoutNode } from "./layout";

const SVG_NS = "http://www.w3.org/2000/svg";
const STORAGE_KEY = "bjostad-graph-layout-v1";
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

export class GraphCanvas {
  private root: HTMLElement;
  private viewport: HTMLElement;
  private svg: SVGSVGElement;
  private nodesLayer: HTMLElement;
  private data: GraphData;
  private positions: Map<string, LayoutNode>;
  private nodeEls = new Map<string, HTMLElement>();
  private edgeEls: { from: string; to: string; el: SVGLineElement }[] = [];
  private onExpand: (node: GraphNode) => void;

  constructor(root: HTMLElement, data: GraphData, onExpand: (node: GraphNode) => void) {
    this.root = root;
    this.data = data;
    this.onExpand = onExpand;
    this.positions = this.loadPositions() ?? computeInitialLayout(data);

    this.root.innerHTML = "";
    this.root.classList.add("graph-root");

    this.viewport = document.createElement("div");
    this.viewport.className = "viewport";
    this.root.appendChild(this.viewport);

    this.svg = document.createElementNS(SVG_NS, "svg");
    this.svg.setAttribute("class", "edges-layer");
    this.viewport.appendChild(this.svg);

    this.nodesLayer = document.createElement("div");
    this.nodesLayer.className = "nodes-layer";
    this.viewport.appendChild(this.nodesLayer);

    this.buildEdges();
    this.buildNodes();
    this.center();
    this.render();

    window.addEventListener("resize", () => this.center());

    if (!reducedMotion) {
      this.viewport.classList.add("boot-in");
      window.setTimeout(() => this.viewport.classList.remove("boot-in"), 900);
    }
  }

  private loadPositions(): Map<string, LayoutNode> | null {
    try {
      const raw = sessionStorage.getItem(STORAGE_KEY);
      if (!raw) return null;
      const parsed: LayoutNode[] = JSON.parse(raw);
      const ids = new Set(this.data.nodes.map((n) => n.id));
      if (parsed.some((p) => !ids.has(p.id))) return null; // stale (content changed)
      return new Map(parsed.map((p) => [p.id, p]));
    } catch {
      return null;
    }
  }

  private savePositions() {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...this.positions.values()]));
    } catch {
      /* ignore quota/private-mode errors */
    }
  }

  private center() {
    const rect = this.root.getBoundingClientRect();
    this.viewport.style.transform = `translate(${rect.width / 2}px, ${rect.height / 2}px)`;
  }

  private buildEdges() {
    for (const e of this.data.edges) {
      const line = document.createElementNS(SVG_NS, "line");
      line.setAttribute("class", `edge edge-${e.kind}`);
      this.svg.appendChild(line);
      this.edgeEls.push({ from: e.from, to: e.to, el: line });
    }
  }

  private buildNodes() {
    for (const node of this.data.nodes) {
      const el = document.createElement("div");
      el.className = `node node-${node.type}`;
      el.dataset.id = node.id;
      el.tabIndex = 0;
      el.setAttribute("role", "button");
      el.setAttribute("aria-label", `${node.title} — open details`);
      el.innerHTML = this.nodeInnerHtml(node);

      el.addEventListener("pointerdown", (ev) => this.startDrag(node.id, ev));
      el.addEventListener("mouseenter", () => this.setHover(node.id));
      el.addEventListener("mouseleave", () => this.setHover(null));
      el.addEventListener("focus", () => this.setHover(node.id));
      el.addEventListener("blur", () => this.setHover(null));
      el.addEventListener("click", (ev) => {
        if (this.suppressClick) {
          this.suppressClick = false;
          return;
        }
        ev.stopPropagation();
        this.onExpand(node);
      });
      el.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          this.onExpand(node);
        }
      });

      this.nodesLayer.appendChild(el);
      this.nodeEls.set(node.id, el);
    }
  }

  private nodeInnerHtml(node: GraphNode): string {
    if (node.type === "you") {
      const initials = node.title
        .split(/\s+/)
        .map((w) => w[0])
        .join("")
        .slice(0, 2)
        .toUpperCase();
      const photo = node.photo
        ? `<img class="you-photo" src="${node.photo}" alt="" />`
        : `<div class="you-photo you-photo-fallback">${initials}</div>`;
      return `
        <div class="node-you-inner">
          ${photo}
          <div class="you-text">
            <div class="node-title">${escapeHtml(node.title)}</div>
            ${node.subtitle ? `<div class="node-subtitle">${escapeHtml(node.subtitle)}</div>` : ""}
          </div>
        </div>`;
    }

    if (node.type === "skill") {
      return `
        <div class="node-title">${escapeHtml(node.title)}</div>
        ${node.category ? `<div class="node-badge node-badge-${node.category}">${node.category}</div>` : ""}`;
    }

    const fieldsHtml = (node.fields ?? [])
      .slice(0, 2)
      .map((f) => `<div class="node-field"><span class="field-label">${escapeHtml(f.label)}</span> ${escapeHtml(f.value)}</div>`)
      .join("");

    return `
      <div class="node-title">${escapeHtml(node.title)}</div>
      ${node.subtitle ? `<div class="node-subtitle">${escapeHtml(node.subtitle)}</div>` : ""}
      ${fieldsHtml}`;
  }

  private suppressClick = false;

  private startDrag(id: string, ev: PointerEvent) {
    ev.preventDefault();
    const pos = this.positions.get(id)!;
    const scale = this.getScale();
    const start = { px: ev.clientX, py: ev.clientY, x: pos.x, y: pos.y };
    this.suppressClick = false;

    const el = this.nodeEls.get(id)!;
    el.classList.add("dragging");
    el.setPointerCapture(ev.pointerId);

    const move = (mv: PointerEvent) => {
      const dx = (mv.clientX - start.px) / scale;
      const dy = (mv.clientY - start.py) / scale;
      if (Math.hypot(mv.clientX - start.px, mv.clientY - start.py) > 4) {
        this.suppressClick = true;
      }
      pos.x = start.x + dx;
      pos.y = start.y + dy;
      this.render();
    };
    const up = () => {
      el.classList.remove("dragging");
      el.removeEventListener("pointermove", move);
      el.removeEventListener("pointerup", up);
      this.savePositions();
    };
    el.addEventListener("pointermove", move);
    el.addEventListener("pointerup", up);
  }

  private getScale(): number {
    const t = this.viewport.style.transform;
    const m = t.match(/scale\(([^)]+)\)/);
    return m ? parseFloat(m[1]) : 1;
  }

  private setHover(id: string | null) {
    const connected = new Set<string>();
    if (id) {
      connected.add(id);
      for (const e of this.data.edges) {
        if (e.from === id) connected.add(e.to);
        if (e.to === id) connected.add(e.from);
      }
    }
    for (const [nid, el] of this.nodeEls) {
      el.classList.toggle("dim", id !== null && !connected.has(nid));
    }
    for (const { from, to, el } of this.edgeEls) {
      const active = id !== null && (from === id || to === id);
      el.classList.toggle("dim", id !== null && !active);
      el.classList.toggle("active", active);
    }
  }

  private render() {
    for (const [id, el] of this.nodeEls) {
      const p = this.positions.get(id)!;
      el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
    }
    for (const { from, to, el } of this.edgeEls) {
      const a = this.positions.get(from);
      const b = this.positions.get(to);
      if (!a || !b) continue;
      el.setAttribute("x1", String(a.x));
      el.setAttribute("y1", String(a.y));
      el.setAttribute("x2", String(b.x));
      el.setAttribute("y2", String(b.y));
    }
  }

  resetLayout() {
    this.positions = computeInitialLayout(this.data);
    sessionStorage.removeItem(STORAGE_KEY);
    if (!reducedMotion) {
      this.nodesLayer.classList.add("settling");
      window.setTimeout(() => this.nodesLayer.classList.remove("settling"), 500);
    }
    this.render();
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
