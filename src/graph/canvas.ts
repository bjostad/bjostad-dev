import type { GraphData, GraphNode } from "../data/types";
import { computeInitialLayout, reduceAttributeProjectCrossings, type LayoutNode } from "./layout";

const SVG_NS = "http://www.w3.org/2000/svg";
// Bump the trailing version whenever the layout algorithm changes in a way
// that would make an old saved arrangement look wrong (moved rows, resized
// cards, new routing) — loadPositions only checks that the node *ids*
// still match, so a stale save from a previous version would otherwise
// keep "validating" and loading over whatever the current default should
// be, even though nothing about the content changed.
const STORAGE_KEY = "bjostad-graph-layout-v2";
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

interface AttributeOffset {
  dx: number;
  dy: number;
}

export class GraphCanvas {
  private root: HTMLElement;
  private viewport: HTMLElement;
  private svg: SVGSVGElement;
  private nodesLayer: HTMLElement;
  private data: GraphData;
  private positions: Map<string, LayoutNode>;
  private nodeEls = new Map<string, HTMLElement>();
  private nodeSize = new Map<string, { w: number; h: number }>();
  private attributeEls = new Map<string, HTMLElement>();
  /** Each attribute's connection point, as an offset from "you"'s center — see measureAttributeOffsets. */
  private attributeOffset = new Map<string, AttributeOffset>();
  private edgeEls: { from: string; to: string; el: SVGPathElement }[] = [];
  private attrColor = new Map<string, string>();
  private onExpand: (node: GraphNode) => void;
  private hoverId: string | null = null;
  private pinnedAttrId: string | null = null;

  constructor(root: HTMLElement, data: GraphData, onExpand: (node: GraphNode) => void) {
    this.root = root;
    this.data = data;
    this.onExpand = onExpand;

    // Reorder you's attribute rows and the project row to cut down line
    // crossings — safe to run unconditionally since it only touches
    // ordering, not x/y, so it's correct whether positions below end up
    // coming from a fresh layout or a restored session.
    reduceAttributeProjectCrossings(this.data);

    const stored = this.loadPositions();
    this.positions = stored ?? computeInitialLayout(data);

    // Each attribute gets its own hue (golden-angle spacing keeps any
    // count of attributes visually spread out rather than clustering) so
    // its outgoing lines to projects are distinguishable from every other
    // attribute's.
    const you = data.nodes.find((n) => n.type === "you");
    (you?.attributes ?? []).forEach((attr, i) => {
      const hue = Math.round((i * 137.508) % 360);
      this.attrColor.set(attr.id, `hsl(${hue}, 62%, 66%)`);
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
    this.measureAttributeOffsets();
    // Only a freshly computed layout gets the no-overlap / clearance
    // guarantees — a stored layout may include positions the user
    // dragged on top of each other on purpose, and that choice should
    // stick across reloads.
    if (!stored) {
      this.resolveOverlaps();
      this.ensureClearanceBelowYou();
    }
    this.center();
    this.render();

    // A click that isn't on a node or attribute (they stopPropagation)
    // clears a pinned attribute highlight.
    this.root.addEventListener("click", () => {
      if (this.pinnedAttrId) {
        this.pinnedAttrId = null;
        this.applyHighlight();
      }
    });

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
      const color = this.attrColor.get(e.from);
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

      if (node.type === "you") this.wireAttributeRows(el);
    }
  }

  /** Attribute rows are part of "you"'s card, not their own node — click
   * highlights their connections (like hovering a node does), and it
   * stays highlighted (rather than reverting on mouseleave) until another
   * attribute is chosen or empty canvas is clicked, since that's a more
   * deliberate action than a hover. */
  private wireAttributeRows(youEl: HTMLElement) {
    const rows = youEl.querySelectorAll<HTMLElement>(".attr-row");
    rows.forEach((rowEl) => {
      const id = rowEl.dataset.attrId;
      if (!id) return;
      this.attributeEls.set(id, rowEl);

      rowEl.addEventListener("mouseenter", () => this.setHover(id));
      rowEl.addEventListener("mouseleave", () => this.setHover(null));
      rowEl.addEventListener("focus", () => this.setHover(id));
      rowEl.addEventListener("blur", () => this.setHover(null));
      rowEl.addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (this.suppressClick) {
          this.suppressClick = false;
          return;
        }
        this.pinnedAttrId = this.pinnedAttrId === id ? null : id;
        this.applyHighlight();
      });
      rowEl.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          ev.stopPropagation();
          this.pinnedAttrId = this.pinnedAttrId === id ? null : id;
          this.applyHighlight();
        }
      });
    });
  }

  /**
   * Records each attribute row's connection point as an offset from
   * "you"'s own center (right edge of the card, vertically centered on
   * the row). Offsets are relative, so they stay correct no matter where
   * "you" is positioned or dragged — this only needs to run once, right
   * after the rows exist in the DOM.
   */
  private measureAttributeOffsets() {
    const youEl = this.nodeEls.get("you");
    if (!youEl) return;
    const youRect = youEl.getBoundingClientRect();
    const youCenterY = youRect.top + youRect.height / 2;
    const halfWidth = youRect.width / 2;
    for (const [attrId, rowEl] of this.attributeEls) {
      const r = rowEl.getBoundingClientRect();
      this.attributeOffset.set(attrId, { dx: halfWidth, dy: r.top + r.height / 2 - youCenterY });
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

      const attrRows = (node.attributes ?? [])
        .map(
          (a) => `
            <div class="attr-row" data-attr-id="${escapeHtml(a.id)}" tabindex="0" role="button" aria-label="${escapeHtml(a.label)} — highlight connected projects">
              <span class="attr-label">${escapeHtml(a.label)}</span>
              ${a.category ? `<span class="attr-badge">${escapeHtml(a.category)}</span>` : ""}
            </div>`,
        )
        .join("");

      return `
        <div class="node-you-inner">
          ${photo}
          <div class="you-text">
            <div class="node-title">${escapeHtml(node.title)}</div>
            ${node.subtitle ? `<div class="node-subtitle">${escapeHtml(node.subtitle)}</div>` : ""}
          </div>
        </div>
        ${attrRows ? `<div class="attr-list">${attrRows}</div>` : ""}`;
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
    this.hoverId = id;
    this.applyHighlight();
  }

  /** Effective highlight is whatever's hovered, falling back to a pinned
   * attribute (click) when nothing's currently under the pointer. */
  private applyHighlight() {
    const activeId = this.hoverId ?? this.pinnedAttrId;
    const connected = new Set<string>();
    if (activeId) {
      connected.add(activeId);
      for (const e of this.data.edges) {
        if (e.from === activeId) connected.add(e.to);
        if (e.to === activeId) connected.add(e.from);
      }
    }
    for (const [nid, el] of this.nodeEls) {
      el.classList.toggle("dim", activeId !== null && !connected.has(nid));
    }
    for (const [aid, el] of this.attributeEls) {
      el.classList.toggle("dim", activeId !== null && !connected.has(aid));
      el.classList.toggle("active-attr", aid === activeId);
    }
    for (const { from, to, el } of this.edgeEls) {
      const active = activeId !== null && (from === activeId || to === activeId);
      el.classList.toggle("dim", activeId !== null && !active);
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

  /** x used to order edges sharing a destination — attributes don't have
   * a real position, so this resolves through "you" + their offset. */
  private originSortKey(id: string): number {
    const p = this.positions.get(id);
    if (p) return p.x * 100000 + p.y;
    const off = this.attributeOffset.get(id);
    const you = this.positions.get("you");
    if (!off || !you) return 0;
    return (you.x + off.dx) * 100000 + (you.y + off.dy);
  }

  /**
   * Crow's-foot ER connectors. Node-to-node edges (You/Experience ->
   * Experience/Project/Contact) use the schema-diagram elbow: leave the
   * dead center of the top/bottom edge facing the destination, run past
   * every box in the source's row (stacked per origin so distinct
   * sources don't share a track), cross to the destination's x, enter
   * its dead-center facing edge. Attribute -> Project edges (skills,
   * now fields on "you" rather than their own node) leave the dead
   * center of their row's right edge instead, since that's where they
   * actually are on the card, then drop down to clear the project row
   * before doing the same cross-and-enter. Every edge gets a cardinality
   * mark: a single tick at the "one" end, a crow's foot at the "many"
   * end — except you<->contact, which is 1:1 and gets a tick at both.
   */
  private routeEdges() {
    const ROW_MARGIN = 16;
    const BAND_GAP = 14;
    const ENTRY_GAP = 20;
    const ATTR_STUB = 18;
    // Each attribute's horizontal run gets its own band, spaced far
    // enough apart that two different-colored runs never read as
    // overlapping even where their x-ranges cover the same ground.
    const ATTR_BAND_GAP = 26;

    const typeById = new Map(this.data.nodes.map((n) => [n.id, n.type]));
    const you = this.positions.get("you");

    const rowTop = new Map<GraphNode["type"], number>();
    const rowBottom = new Map<GraphNode["type"], number>();
    for (const n of this.data.nodes) {
      const p = this.positions.get(n.id);
      const s = this.nodeSize.get(n.id);
      if (!p || !s) continue;
      rowTop.set(n.type, Math.min(rowTop.get(n.type) ?? Infinity, p.y - s.h / 2));
      rowBottom.set(n.type, Math.max(rowBottom.get(n.type) ?? -Infinity, p.y + s.h / 2));
    }

    // Non-attribute origins get their own turn-level index, ordered
    // left-to-right, so bands stack predictably.
    const originIndex = new Map<string, number>();
    {
      const byRow = new Map<GraphNode["type"], string[]>();
      const seen = new Set<string>();
      for (const e of this.data.edges) {
        if (this.attributeOffset.has(e.from) || seen.has(e.from)) continue;
        seen.add(e.from);
        const t = typeById.get(e.from)!;
        const list = byRow.get(t) ?? [];
        list.push(e.from);
        byRow.set(t, list);
      }
      for (const list of byRow.values()) {
        list.sort((a, b) => this.positions.get(a)!.x - this.positions.get(b)!.x);
        list.forEach((id, i) => originIndex.set(id, i));
      }
    }

    // Each attribute gets one shared horizontal band (midY) — computed
    // once per attribute, not per edge, so every edge leaving it stays on
    // the same level (the shared "trunk" look) and, crucially, so two
    // DIFFERENT attributes never land on the same level even when both
    // are constrained by the same nearby project. An attribute's band can
    // never dip past (numerically below) the closest project it actually
    // connects to, or its line would have to cross back up through that
    // project's box to reach it.
    //
    // There's plenty of open space between "you" and even the nearest
    // project, so bands are handed out from the *loosest*-ceiling
    // attribute down to the tightest, each claiming the deepest slot its
    // own ceiling allows — at least ATTR_BAND_GAP shallower than the one
    // before it. That way a run of attributes that all share the same
    // tight ceiling (e.g. several all connecting to the one nearest
    // project) still fan out upward into that open space instead of
    // colliding on the same level.
    const attrMidY = new Map<string, number>();
    const attrBandIndex = new Map<string, number>();
    {
      const ceiling = new Map<string, number>();
      for (const attrId of this.attributeOffset.keys()) ceiling.set(attrId, Infinity);
      for (const e of this.data.edges) {
        if (!this.attributeOffset.has(e.from)) continue;
        const b = this.positions.get(e.to);
        const sizeB = this.nodeSize.get(e.to);
        if (!b) continue;
        const entryY = b.y - (sizeB?.h ?? 0) / 2;
        ceiling.set(e.from, Math.min(ceiling.get(e.from) ?? Infinity, entryY - ROW_MARGIN));
      }

      const rowOrder = new Map<string, number>();
      [...this.attributeOffset.entries()].sort((a, b) => a[1].dy - b[1].dy).forEach(([id], i) => rowOrder.set(id, i));

      // Loosest (largest/deepest) ceiling first.
      const ordered = [...ceiling.keys()].sort((a, b) => {
        const diff = ceiling.get(b)! - ceiling.get(a)!;
        return diff !== 0 ? diff : (rowOrder.get(a) ?? 0) - (rowOrder.get(b) ?? 0);
      });

      let prev = Infinity;
      ordered.forEach((attrId, i) => {
        const value = Math.min(ceiling.get(attrId)!, prev - ATTR_BAND_GAP);
        attrMidY.set(attrId, value);
        attrBandIndex.set(attrId, i);
        prev = value;
      });
    }

    // Multiple edges landing on the same node get spread across its top
    // edge instead of all entering at the exact same point.
    const incomingByDest = new Map<string, string[]>();
    for (const e of this.data.edges) {
      const list = incomingByDest.get(e.to) ?? [];
      list.push(e.from);
      incomingByDest.set(e.to, list);
    }
    for (const list of incomingByDest.values()) {
      list.sort((a, b) => this.originSortKey(a) - this.originSortKey(b));
    }

    for (const { from, to, el } of this.edgeEls) {
      const b = this.positions.get(to);
      const sizeB = this.nodeSize.get(to);
      if (!b) continue;
      const toType = typeById.get(to)!;

      let entryX = b.x;
      if (toType === "project") {
        const incoming = incomingByDest.get(to)!;
        const n = incoming.length;
        if (n > 1) {
          const boxW = sizeB?.w ?? 140;
          const spacing = Math.min(ENTRY_GAP, (boxW * 0.6) / (n - 1));
          entryX = b.x + (incoming.indexOf(from) - (n - 1) / 2) * spacing;
        }
      }

      const attrOff = this.attributeOffset.get(from);
      if (attrOff && you) {
        const exitX = you.x + attrOff.dx;
        const exitY = you.y + attrOff.dy;
        const entryY = b.y - (sizeB?.h ?? 0) / 2; // attributes only feed projects, always from above
        const idx = attrBandIndex.get(from) ?? 0;
        const stubX = exitX + ATTR_STUB + idx * ATTR_BAND_GAP;
        const midY = attrMidY.get(from) ?? entryY - ROW_MARGIN;
        const enterDown = entryY >= midY;

        // One attribute fans out to many projects, so the "many" mark
        // (crow's foot) belongs at the attribute end and the "one" mark
        // (tick) at the project end.
        const d =
          `M ${exitX} ${exitY} L ${stubX} ${exitY} L ${stubX} ${midY} L ${entryX} ${midY} L ${entryX} ${entryY}` +
          crowsFoot(exitX, exitY, 1, 0) +
          tickMark(entryX, entryY, 0, enterDown ? -1 : 1);
        el.setAttribute("d", d);
        continue;
      }

      const a = this.positions.get(from);
      const sizeA = this.nodeSize.get(from);
      if (!a) continue;
      const fromType = typeById.get(from)!;

      // You<->Contact sit at the same height, both anchored at the top of
      // the page — the generic top/bottom elbow below assumes one side is
      // strictly above the other, so this one gets its own routing: leave
      // the top of "you", clear above both boxes, drop into the top of
      // "contact". 1:1, so a tick at both ends instead of a crow's foot.
      if (toType === "contact") {
        const halfA = (sizeA?.h ?? 0) / 2;
        const halfB = (sizeB?.h ?? 0) / 2;
        const exitY = a.y - halfA;
        const entryY = b.y - halfB;
        const clearAbove = Math.min(rowTop.get(fromType) ?? exitY, rowTop.get(toType) ?? entryY) - ROW_MARGIN;
        el.setAttribute(
          "d",
          `M ${a.x} ${exitY} L ${a.x} ${clearAbove} L ${entryX} ${clearAbove} L ${entryX} ${entryY}` +
            tickMark(a.x, exitY, 0, -1) +
            tickMark(entryX, entryY, 0, -1),
        );
        continue;
      }

      const down = b.y >= a.y;
      const exitY = down ? a.y + (sizeA?.h ?? 0) / 2 : a.y - (sizeA?.h ?? 0) / 2;
      const entryY = down ? b.y - (sizeB?.h ?? 0) / 2 : b.y + (sizeB?.h ?? 0) / 2;

      const rowClear = down ? rowBottom.get(fromType)! + ROW_MARGIN : rowTop.get(fromType)! - ROW_MARGIN;
      const destClear = down ? rowTop.get(toType)! - ROW_MARGIN : rowBottom.get(toType)! + ROW_MARGIN;
      const idx = originIndex.get(from) ?? 0;
      let turnY = down ? rowClear + idx * BAND_GAP : rowClear - idx * BAND_GAP;
      turnY = down ? Math.min(turnY, destClear) : Math.max(turnY, destClear);

      const oneMark = tickMark(a.x, exitY, 0, down ? 1 : -1);
      const manyMark = crowsFoot(entryX, entryY, 0, down ? -1 : 1);

      el.setAttribute("d", `M ${a.x} ${exitY} L ${a.x} ${turnY} L ${entryX} ${turnY} L ${entryX} ${entryY}` + oneMark + manyMark);
    }
  }

  resetLayout() {
    this.positions = computeInitialLayout(this.data);
    this.resolveOverlaps();
    this.ensureClearanceBelowYou();
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

  /**
   * "You"'s card grows taller with every attribute row, so a static
   * estimate of where the rows below it start can't be trusted. This
   * measures the real gap and, if the card's bottom edge would overlap
   * the experience/project rows, shifts everything except "you" and
   * "contact" (which sits level with "you" on purpose) down by however
   * much is needed to clear it.
   */
  private ensureClearanceBelowYou() {
    const you = this.positions.get("you");
    const youSize = this.nodeSize.get("you");
    if (!you || !youSize) return;
    const youBottom = you.y + youSize.h / 2 + 40;

    let topOfRest = Infinity;
    for (const n of this.data.nodes) {
      if (n.id === "you" || n.type === "contact") continue;
      const p = this.positions.get(n.id);
      const s = this.nodeSize.get(n.id);
      if (!p || !s) continue;
      topOfRest = Math.min(topOfRest, p.y - s.h / 2);
    }
    if (topOfRest === Infinity) return;

    const shift = youBottom - topOfRest;
    if (shift <= 0) return;
    for (const n of this.data.nodes) {
      if (n.id === "you" || n.type === "contact") continue;
      const p = this.positions.get(n.id);
      if (p) p.y += shift;
    }
  }
}

const TICK_LEN = 9;
const FORK_LEN = 12;
const FORK_SPREAD = 6;

/**
 * "One" cardinality mark: a short tick crossing the line, offset from
 * the anchor point along (awayX, awayY) — the direction pointing away
 * from the box it's attached to, i.e. the direction the line travels
 * as it leaves that box.
 */
function tickMark(x: number, y: number, awayX: number, awayY: number): string {
  const ox = x + awayX * (TICK_LEN * 0.7);
  const oy = y + awayY * (TICK_LEN * 0.7);
  const px = -awayY;
  const py = awayX;
  return ` M ${ox - (px * TICK_LEN) / 2} ${oy - (py * TICK_LEN) / 2} L ${ox + (px * TICK_LEN) / 2} ${oy + (py * TICK_LEN) / 2}`;
}

/**
 * "Many" cardinality mark: a crow's-foot fork that touches the box at
 * three separate, spread points right at the anchor (x, y) — like a
 * bird's foot planted on the edge — and converges to a single point
 * back along (awayX, awayY), the direction pointing away from the box,
 * i.e. opposite the direction the line travels as it arrives there.
 */
function crowsFoot(x: number, y: number, awayX: number, awayY: number): string {
  const cx = x + awayX * FORK_LEN;
  const cy = y + awayY * FORK_LEN;
  const px = -awayY;
  const py = awayX;
  const t1x = x + px * FORK_SPREAD;
  const t1y = y + py * FORK_SPREAD;
  const t2x = x - px * FORK_SPREAD;
  const t2y = y - py * FORK_SPREAD;
  return ` M ${t1x} ${t1y} L ${cx} ${cy} M ${x} ${y} L ${cx} ${cy} M ${t2x} ${t2y} L ${cx} ${cy}`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
