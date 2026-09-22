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
  private nodeSize = new Map<string, { w: number; h: number }>();
  private edgeEls: { from: string; to: string; el: SVGPathElement }[] = [];
  private skillColor = new Map<string, string>();
  private onExpand: (node: GraphNode) => void;

  constructor(root: HTMLElement, data: GraphData, onExpand: (node: GraphNode) => void) {
    this.root = root;
    this.data = data;
    this.onExpand = onExpand;
    const stored = this.loadPositions();
    this.positions = stored ?? computeInitialLayout(data);

    // Each skill gets its own hue (golden-angle spacing keeps any count of
    // skills visually spread out rather than clustering) so its outgoing
    // lines to projects are distinguishable from every other skill's.
    const skills = data.nodes.filter((n) => n.type === "skill");
    skills.forEach((n, i) => {
      const hue = Math.round((i * 137.508) % 360);
      this.skillColor.set(n.id, `hsl(${hue}, 62%, 66%)`);
    });

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
    // Only a freshly computed layout gets the no-overlap guarantee — a
    // stored layout may include positions the user dragged on top of each
    // other on purpose, and that choice should stick across reloads.
    if (!stored) this.resolveOverlaps();
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
      const el = document.createElementNS(SVG_NS, "path");
      el.setAttribute("class", `edge edge-${e.kind}`);
      const color = this.skillColor.get(e.from);
      if (color) el.style.stroke = color;
      this.svg.appendChild(el);
      this.edgeEls.push({ from: e.from, to: e.to, el });
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
      this.nodeSize.set(node.id, { w: el.offsetWidth, h: el.offsetHeight });
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
    this.routeEdges();
  }

  /**
   * Schema-diagram-style connectors: each leaves its source at the dead
   * center of the top or bottom edge (whichever faces the destination),
   * runs straight for a stub, turns once, crosses to the destination's x,
   * turns again, and enters at the dead center of the facing edge — but
   * with two refinements over a naive per-edge elbow:
   *
   *  - The turn (the horizontal segment) sits past *every* box in the
   *    source's row, not just the source's own edge, so it never cuts
   *    through a neighbor that happens to be staggered lower/higher.
   *  - Different origins get their own turn level, stacked outward in
   *    steps, so unrelated lines don't run along the same row of pixels —
   *    edges sharing an origin still share a level (and the stub above
   *    it), since that shared trunk is the point of a fan-out.
   *
   * Multiple edges landing on the same project are additionally spread
   * across its top edge instead of all converging on one pixel.
   */
  private routeEdges() {
    const ROW_MARGIN = 14; // clearance past the farthest box in a row
    const BAND_GAP = 9; // minimum vertical distance between different origins' turn levels
    const ENTRY_GAP = 14; // minimum horizontal distance between entry points on one box

    const typeById = new Map(this.data.nodes.map((n) => [n.id, n.type]));

    // Row extents (top/bottom-most box edge) per node type, from current
    // positions + real measured sizes.
    const rowTop = new Map<GraphNode["type"], number>();
    const rowBottom = new Map<GraphNode["type"], number>();
    for (const n of this.data.nodes) {
      const p = this.positions.get(n.id);
      const s = this.nodeSize.get(n.id);
      if (!p || !s) continue;
      rowTop.set(n.type, Math.min(rowTop.get(n.type) ?? Infinity, p.y - s.h / 2));
      rowBottom.set(n.type, Math.max(rowBottom.get(n.type) ?? -Infinity, p.y + s.h / 2));
    }

    // Each distinct origin (source node) gets its own turn-level index,
    // ordered left-to-right, so bands stack predictably instead of
    // randomly overlapping.
    const originIndex = new Map<string, number>();
    {
      const byRow = new Map<GraphNode["type"], string[]>();
      const seen = new Set<string>();
      for (const e of this.data.edges) {
        if (seen.has(e.from)) continue;
        seen.add(e.from);
        const list = byRow.get(typeById.get(e.from)!) ?? [];
        list.push(e.from);
        byRow.set(typeById.get(e.from)!, list);
      }
      for (const list of byRow.values()) {
        list.sort((a, b) => this.positions.get(a)!.x - this.positions.get(b)!.x);
        list.forEach((id, i) => originIndex.set(id, i));
      }
    }

    // Multiple edges landing on the same project get spread across its
    // top edge (ordered by their source's x) instead of all entering at
    // the exact same point.
    const incomingByDest = new Map<string, string[]>();
    for (const e of this.data.edges) {
      const list = incomingByDest.get(e.to) ?? [];
      list.push(e.from);
      incomingByDest.set(e.to, list);
    }
    for (const list of incomingByDest.values()) {
      list.sort((a, b) => this.positions.get(a)!.x - this.positions.get(b)!.x);
    }

    for (const { from, to, el } of this.edgeEls) {
      const a = this.positions.get(from);
      const b = this.positions.get(to);
      if (!a || !b) continue;

      const fromType = typeById.get(from)!;
      const toType = typeById.get(to)!;
      const down = b.y >= a.y; // destination at/below source -> exit bottom, enter top

      const sizeA = this.nodeSize.get(from);
      const sizeB = this.nodeSize.get(to);
      const exitY = down ? a.y + (sizeA?.h ?? 0) / 2 : a.y - (sizeA?.h ?? 0) / 2;
      const entryY = down ? b.y - (sizeB?.h ?? 0) / 2 : b.y + (sizeB?.h ?? 0) / 2;

      // Turn level: past every box in the source's row, stacked further
      // out per origin, but never past every box in the destination's row
      // (so a crowded source row can't push the turn into the next row).
      const rowClear = down ? rowBottom.get(fromType)! + ROW_MARGIN : rowTop.get(fromType)! - ROW_MARGIN;
      const destClear = down ? rowTop.get(toType)! - ROW_MARGIN : rowBottom.get(toType)! + ROW_MARGIN;
      const idx = originIndex.get(from) ?? 0;
      let turnY = down ? rowClear + idx * BAND_GAP : rowClear - idx * BAND_GAP;
      turnY = down ? Math.min(turnY, destClear) : Math.max(turnY, destClear);

      // Entry x: spread multiple incoming edges across a project's width.
      let entryX = b.x;
      if (toType === "project") {
        const incoming = incomingByDest.get(to)!;
        const n = incoming.length;
        if (n > 1) {
          const boxW = sizeB?.w ?? 140;
          const spacing = Math.min(ENTRY_GAP, (boxW * 0.6) / (n - 1));
          const pos = incoming.indexOf(from);
          entryX = b.x + (pos - (n - 1) / 2) * spacing;
        }
      }

      el.setAttribute("d", `M ${a.x} ${exitY} L ${a.x} ${turnY} L ${entryX} ${turnY} L ${entryX} ${entryY}`);
    }
  }

  resetLayout() {
    this.positions = computeInitialLayout(this.data);
    this.resolveOverlaps();
    sessionStorage.removeItem(STORAGE_KEY);
    if (!reducedMotion) {
      this.nodesLayer.classList.add("settling");
      window.setTimeout(() => this.nodesLayer.classList.remove("settling"), 500);
    }
    this.render();
  }

  /**
   * Nudges freshly laid-out nodes apart along x until no two rendered
   * boxes overlap, using their actual measured size (title/subtitle/tag
   * text varies a lot in width, so the abstract spacing in layout.ts is
   * only an approximation). Never moves "you", and never touches y so the
   * top-to-bottom row hierarchy from layout.ts is preserved.
   */
  private resolveOverlaps() {
    const margin = 14;
    const ids = this.data.nodes.map((n) => n.id);
    const size = this.nodeSize;

    for (let iter = 0; iter < 60; iter++) {
      let moved = false;
      for (let i = 0; i < ids.length; i++) {
        for (let j = i + 1; j < ids.length; j++) {
          const a = this.positions.get(ids[i]);
          const b = this.positions.get(ids[j]);
          const sa = size.get(ids[i]);
          const sb = size.get(ids[j]);
          if (!a || !b || !sa || !sb) continue;

          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const overlapX = sa.w / 2 + sb.w / 2 + margin - Math.abs(dx);
          const overlapY = sa.h / 2 + sb.h / 2 + margin - Math.abs(dy);
          if (overlapX <= 0 || overlapY <= 0) continue;

          // Boxes intersect — separate them along x only, just enough
          // that their horizontal extents stop overlapping regardless of
          // how close they are in y.
          moved = true;
          const sign = dx === 0 ? (i % 2 === 0 ? 1 : -1) : Math.sign(dx);
          const aMovable = a.id !== "you";
          const bMovable = b.id !== "you";
          const share = aMovable && bMovable ? overlapX / 2 : overlapX;
          if (aMovable) a.x -= share * sign;
          if (bMovable) b.x += share * sign;
        }
      }
      if (!moved) break;
    }
  }
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
