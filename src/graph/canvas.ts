import type { GraphData, GraphNode, SkillCategory } from "../data/types";
import { computeInitialLayout, reduceAttributeProjectCrossings, type LayoutNode } from "./layout";

const SVG_NS = "http://www.w3.org/2000/svg";
// Bump the trailing version whenever the layout algorithm changes in a way
// that would make an old saved arrangement look wrong (moved rows, resized
// cards, new routing) — loadPositions only checks that the node *ids*
// still match, so a stale save from a previous version would otherwise
// keep "validating" and loading over whatever the current default should
// be, even though nothing about the content changed.
const STORAGE_KEY = "bjostad-graph-layout-v6";
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
// How long a skill's projects stay revealed after the pointer leaves its
// row — long enough to travel from the row to one of those project cards.
const HOVER_GRACE_MS = 600;
const FIT_PADDING = 32;
const MIN_SCALE = 0.45;
// Clearance kept between a line and any card edge it runs alongside.
const ROW_MARGIN = 14;
// One uniform spacing for parallel lines, both vertical and horizontal.
const GAP = 16;
// Four hues spread far apart around the wheel, skipping the 150–225° band
// so none can be mistaken for the contact line's mint or the project
// connector's blue, plus a near-white that stands apart from all of them.
const CATEGORY_COLOR: Record<SkillCategory, string> = {
  language: "hsl(52, 95%, 58%)", // yellow
  framework: "hsl(262, 90%, 72%)", // violet
  platform: "hsl(0, 85%, 64%)", // red
  tool: "hsl(210, 25%, 90%)", // near-white
  database: "hsl(95, 70%, 55%)", // lime
};
const UNCATEGORIZED_COLOR = "hsl(220, 15%, 70%)";
// Space below "you" the "hover a skill" callout (style.css .coach) hangs in.
const COACH_CLEARANCE = 84;

interface AttributeOffset {
  dx: number;
  dy: number;
}

interface Box {
  x: number;
  l: number;
  r: number;
  t: number;
  b: number;
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
  private pinnedId: string | null = null;
  private clearTimer: number | undefined;
  /** Projects reachable through a skill attribute — dim until one of their skills is picked. */
  private revealable = new Set<string>();
  private shownEdges = new Set<SVGPathElement>();

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

    // Lines are colored by skill type (language, framework, …), matching
    // each skill's type badge, so the badges double as the color key.
    const you = data.nodes.find((n) => n.type === "you");
    for (const attr of you?.attributes ?? []) {
      this.attrColor.set(attr.id, attr.category ? CATEGORY_COLOR[attr.category] : UNCATEGORIZED_COLOR);
    }

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
    for (const e of this.data.edges) {
      if (this.attributeOffset.has(e.from)) this.revealable.add(e.to);
    }

    this.center();
    this.render();
    this.applyHighlight();
    document.fonts?.ready.then(() => this.remeasure());

    // A click that isn't on a node or attribute (they stopPropagation)
    // clears a pinned attribute highlight.
    this.root.addEventListener("click", () => {
      if (this.pinnedId) {
        this.pinnedId = null;
        this.applyHighlight();
      }
    });

    window.addEventListener("resize", () => {
      this.center();
      this.onRender?.();
    });

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

  /** Scales (never up) and centers the whole graph. If even
   * the minimum scale doesn't fit, it anchors to the top-left instead so
   * "you" stays in view. */
  private center() {
    const rect = this.root.getBoundingClientRect();
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;
    for (const [id, p] of this.positions) {
      const s = this.nodeSize.get(id);
      if (!s) continue;
      minX = Math.min(minX, p.x - s.w / 2);
      maxX = Math.max(maxX, p.x + s.w / 2);
      minY = Math.min(minY, p.y - s.h / 2 - 16); // room for the you<->contact line above
      maxY = Math.max(maxY, p.y + s.h / 2);
    }
    if (minX === Infinity || !rect.width || !rect.height) {
      this.viewport.style.transform = `translate(${rect.width / 2}px, ${rect.height / 2}px)`;
      return;
    }

    const availW = rect.width - FIT_PADDING * 2;
    const availH = rect.height - FIT_PADDING * 2;
    const scale = Math.max(MIN_SCALE, Math.min(1, availW / (maxX - minX), availH / (maxY - minY)));
    const tx = (maxX - minX) * scale > availW ? FIT_PADDING - scale * minX : rect.width / 2 - (scale * (minX + maxX)) / 2;
    const ty = (maxY - minY) * scale > availH ? FIT_PADDING - scale * minY : rect.height / 2 - (scale * (minY + maxY)) / 2;
    this.viewport.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  }

  private buildEdges() {
    for (const e of this.data.edges) {
      const el = document.createElementNS(SVG_NS, "path");
      const toContact = this.data.nodes.some((n) => n.id === e.to && n.type === "contact");
      el.setAttribute("class", `edge edge-${e.kind}${toContact ? " edge-contact" : ""}`);
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
      if (node.type === "project") {
        el.addEventListener("mouseenter", () => this.setHover(node.id));
        el.addEventListener("mouseleave", () => this.scheduleClear());
        el.addEventListener("focus", () => this.setHover(node.id));
        el.addEventListener("blur", () => this.scheduleClear());
      }
      el.addEventListener("click", (ev) => {
        if (this.suppressClick) {
          this.suppressClick = false;
          return;
        }
        ev.stopPropagation();
        if ((ev.target as Element).closest("a, .attr-row")) return; // a link or skill on the card, not the card itself
        this.expand(node);
      });
      el.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          this.expand(node);
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
      rowEl.addEventListener("mouseleave", () => this.scheduleClear());
      rowEl.addEventListener("focus", () => this.setHover(id));
      rowEl.addEventListener("blur", () => this.scheduleClear());
      rowEl.addEventListener("click", (ev) => {
        ev.stopPropagation();
        if (this.suppressClick) {
          this.suppressClick = false;
          return;
        }
        this.pinnedId = this.pinnedId === id ? null : id;
        this.applyHighlight();
      });
      rowEl.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " ") {
          ev.preventDefault();
          ev.stopPropagation();
          this.pinnedId = this.pinnedId === id ? null : id;
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
    // Layout offsets rather than getBoundingClientRect, so a transform in
    // flight (the boot-in scale animation, zoom) can't skew the result.
    const halfWidth = youEl.offsetWidth / 2;
    const halfHeight = youEl.offsetHeight / 2;
    for (const [attrId, rowEl] of this.attributeEls) {
      let top = rowEl.offsetHeight / 2;
      for (let el: HTMLElement | null = rowEl; el && el !== youEl; el = el.offsetParent as HTMLElement | null) {
        top += el.offsetTop + (el.offsetParent === youEl ? youEl.clientTop : 0);
      }
      this.attributeOffset.set(attrId, { dx: halfWidth, dy: top - halfHeight });
    }
  }

  /** Card sizes are first measured before web fonts finish loading; the
   * fallback font wraps text differently, so re-measure once they're in. */
  private remeasure() {
    for (const [id, el] of this.nodeEls) {
      this.nodeSize.set(id, { w: el.offsetWidth, h: el.offsetHeight });
    }
    this.measureAttributeOffsets();
    this.center();
    this.render();
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
            <div class="attr-row" data-attr-id="${escapeHtml(a.id)}" style="--cat: ${this.attrColor.get(a.id)}" tabindex="0" role="button" aria-label="${escapeHtml(a.label)} — highlight connected projects">
              <span class="attr-label">${escapeHtml(a.label)}</span>
              ${a.category ? `<span class="attr-badge">${escapeHtml(a.category)}</span>` : ""}
            </div>`,
        )
        .join("");

      return `
        <div class="you-hero">
          ${photo}
          <div class="you-overlay">
            <div class="node-title">${escapeHtml(node.title)}</div>
            ${node.summary ? `<p class="you-pitch">${escapeHtml(node.summary)}</p>` : ""}
          </div>
        </div>
        ${
          attrRows
            ? `<div class="attr-list">
                ${node.subtitle ? `<div class="attr-entity">${escapeHtml(node.subtitle)}</div>` : ""}
                ${attrRows}
              </div>`
            : ""
        }
        ${attrRows ? `<div class="coach" role="note"><span class="coach-arrow" aria-hidden="true"></span>Hover a skill to see the projects I've used it in</div>` : ""}`;
    }

    // A field whose label matches one of the node's links (e.g. "email" /
    // "Email") renders as that link; links with no matching field (the
    // résumé) get a row of their own.
    const links = node.links ?? [];
    const linked = new Set<string>();
    const linkHtml = (url: string, text: string) =>
      `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(text)}</a>`;
    const fieldRows = (node.fields ?? []).map((f) => {
      const match = links.find((l) => l.label.toLowerCase() === f.label.toLowerCase());
      if (match) linked.add(match.label);
      const value = match ? linkHtml(match.url, f.value) : escapeHtml(f.value);
      return `<div class="node-field"><span class="field-label">${escapeHtml(f.label)}</span> ${value}</div>`;
    });
    const extraRows = node.type === "contact"
      ? links
          .filter((l) => !linked.has(l.label))
          .map((l) => {
            const label = /resume/i.test(l.label) ? "resume" : l.label.toLowerCase();
            const text = /resume/i.test(l.label) ? "View PDF" : l.url;
            return `<div class="node-field"><span class="field-label">${escapeHtml(label)}</span> ${linkHtml(l.url, text)}</div>`;
          })
      : [];
    const fieldsHtml = [...fieldRows, ...extraRows].join("");

    const highlightsHtml = node.cardHighlights?.length
      ? `<ul class="node-highlights">${node.cardHighlights.map((h) => `<li>${escapeHtml(h)}</li>`).join("")}</ul>`
      : "";

    return `
      <div class="node-title">${escapeHtml(node.title)}</div>
      ${node.subtitle ? `<div class="node-subtitle">${escapeHtml(node.subtitle)}</div>` : ""}
      ${highlightsHtml}
      ${fieldsHtml}`;
  }

  private suppressClick = false;

  private startDrag(id: string, ev: PointerEvent) {
    // Dragging captures the pointer, which makes the browser deliver the
    // following click to the card rather than whatever was pressed — so
    // links and skill rows must not start a drag, or their own click
    // never fires and the card's detail panel opens instead.
    if ((ev.target as Element).closest("a, .attr-row")) return;
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
    window.clearTimeout(this.clearTimer);
    this.hoverId = id;
    // Lines drawn by hovering either a skill or a project run through the
    // space the callout sits in — and either way, the visitor has found it.
    if (id) this.dismissCoach();
    this.applyHighlight();
  }

  /** The "hover a skill" callout only needs to teach the interaction once. */
  private dismissCoach() {
    const coach = this.nodeEls.get("you")?.querySelector<HTMLElement>(".coach");
    if (!coach || coach.classList.contains("coach-out")) return;
    coach.classList.add("coach-out");
    window.setTimeout(() => coach.remove(), reducedMotion ? 0 : 300);
  }

  private scheduleClear() {
    window.clearTimeout(this.clearTimer);
    this.clearTimer = window.setTimeout(() => this.setHover(null), HOVER_GRACE_MS);
  }

  /**
   * The active item is whatever's hovered (a skill or a project), falling
   * back to a pinned skill (click). Skill lines stay hidden and projects
   * stay dim until something is active. A skill draws its lines out from
   * "you" and each of its projects lights up as its line arrives; a
   * project lights up right away and draws the lines from each of its
   * skills.
   */
  private applyHighlight() {
    const activeId = this.hoverId ?? this.pinnedId;
    const litProjects = new Set<string>();
    const litSkills = new Set<string>();
    for (const e of this.data.edges) {
      if (!this.isLitEdge(e.from, e.to)) continue;
      litProjects.add(e.to);
      litSkills.add(e.from);
    }

    // Skill lines are only routed while lit, so route before measuring
    // any of them for the draw-in.
    this.routeEdges();

    // Lines first, so each newly lit project knows when its first line
    // will reach it.
    const arrivalMs = new Map<string, number>();
    for (const { from, to, el } of this.edgeEls) {
      const isAttrEdge = this.attributeOffset.has(from);
      const active = this.isLitEdge(from, to);
      const visible = !isAttrEdge || active;
      el.classList.toggle("concealed", !visible);
      el.classList.toggle("active", active);
      el.classList.toggle("dim", activeId !== null && visible && !active);

      if (visible && !this.shownEdges.has(el)) {
        this.shownEdges.add(el);
        if (isAttrEdge) arrivalMs.set(to, Math.min(arrivalMs.get(to) ?? Infinity, this.drawIn(el)));
      } else if (!visible && this.shownEdges.has(el)) {
        this.shownEdges.delete(el);
        el.getAnimations().forEach((a) => a.cancel());
      }
    }

    for (const [nid, el] of this.nodeEls) {
      const lit = nid === activeId || litProjects.has(nid);
      const dim = this.revealable.has(nid) ? !lit : activeId !== null && nid !== "you";
      const wasDim = el.classList.contains("dim");
      if (dim || nid === activeId) {
        el.style.removeProperty("--reveal-delay");
      } else if (wasDim) {
        const delay = Math.round((arrivalMs.get(nid) ?? 0) * 0.7);
        el.style.setProperty("--reveal-delay", `${delay}ms`);
      }
      el.classList.toggle("dim", dim);
    }
    for (const [aid, el] of this.attributeEls) {
      el.classList.toggle("dim", activeId !== null && !litSkills.has(aid));
      el.classList.toggle("active-attr", litSkills.has(aid));
    }
  }

  /** Animates a line drawing itself from its start; returns how long that takes. */
  private drawIn(el: SVGPathElement): number {
    if (reducedMotion) return 0;
    const len = el.getTotalLength();
    const ms = Math.min(900, Math.max(350, len * 0.9));
    el.style.strokeDasharray = `${len} ${len}`;
    const anim = el.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], {
      duration: ms,
      easing: "cubic-bezier(0.3, 0.7, 0.4, 1)",
    });
    const done = () => (el.style.strokeDasharray = "");
    anim.onfinish = done;
    anim.oncancel = done;
    return ms;
  }

  /** A project stays highlighted (its skill lines drawn) while it's open. */
  private expand(node: GraphNode) {
    if (node.type === "project") {
      this.pinnedId = node.id;
      this.applyHighlight();
    }
    this.onExpand(node);
  }

  /** Called after every layout change, for anything outside the canvas
   * that's anchored to a card's on-screen position. */
  onRender: (() => void) | null = null;

  private render() {
    for (const [id, el] of this.nodeEls) {
      const p = this.positions.get(id)!;
      el.style.transform = `translate(${p.x}px, ${p.y}px) translate(-50%, -50%)`;
    }
    this.routeEdges();
    this.onRender?.();
  }

  /** Whether a skill->project line is part of the current highlight: every
   * line from the active skill, or every skill line into the active project. */
  private isLitEdge(from: string, to: string): boolean {
    const activeId = this.hoverId ?? this.pinnedId;
    if (activeId === null || !this.attributeOffset.has(from)) return false;
    return this.attributeOffset.has(activeId) ? from === activeId : to === activeId;
  }

  private box(id: string): Box | null {
    const p = this.positions.get(id);
    const s = this.nodeSize.get(id);
    if (!p || !s) return null;
    return { x: p.x, l: p.x - s.w / 2, r: p.x + s.w / 2, t: p.y - s.h / 2, b: p.y + s.h / 2 };
  }

  /**
   * Crow's-foot ER connectors. Skill lines are routed separately (see
   * routeSkillEdges); every other edge (You/Experience -> Experience/
   * Project/Contact) uses the schema-diagram elbow: leave the dead center
   * of the top/bottom edge facing the destination, run past every box in
   * the source's row (stacked per origin so distinct sources don't share
   * a track), cross to the destination's x, enter its facing edge. Every
   * edge gets a cardinality mark: a tick at the "one" end, a crow's foot
   * at the "many" end — except you<->contact, which is 1:1 (tick at both).
   */
  private routeEdges() {
    this.routeSkillEdges();

    const typeById = new Map(this.data.nodes.map((n) => [n.id, n.type]));
    const rowTop = new Map<GraphNode["type"], number>();
    const rowBottom = new Map<GraphNode["type"], number>();
    for (const n of this.data.nodes) {
      const bx = this.box(n.id);
      if (!bx) continue;
      rowTop.set(n.type, Math.min(rowTop.get(n.type) ?? Infinity, bx.t));
      rowBottom.set(n.type, Math.max(rowBottom.get(n.type) ?? -Infinity, bx.b));
    }

    // Each origin gets its own turn level, ordered left-to-right, so bands
    // from different origins in the same row stack predictably.
    const originIndex = new Map<string, number>();
    {
      const byRow = new Map<GraphNode["type"], string[]>();
      for (const e of this.data.edges) {
        if (this.attributeOffset.has(e.from)) continue;
        const t = typeById.get(e.from)!;
        const list = byRow.get(t) ?? [];
        if (!list.includes(e.from)) list.push(e.from);
        byRow.set(t, list);
      }
      for (const list of byRow.values()) {
        list.sort((a, b) => this.positions.get(a)!.x - this.positions.get(b)!.x);
        list.forEach((id, i) => originIndex.set(id, i));
      }
    }

    for (const { from, to, el } of this.edgeEls) {
      if (this.attributeOffset.has(from)) continue;
      const a = this.box(from);
      const b = this.box(to);
      if (!a || !b) continue;
      const fromType = typeById.get(from)!;
      const toType = typeById.get(to)!;

      // You<->Contact sit at the same height, both anchored at the top of
      // the page — the generic elbow below assumes one side is strictly
      // above the other, so this one leaves the top of "you", clears above
      // both boxes, and drops into the top of "contact".
      // One-to-many: one "you", many contact methods on the contact card.
      if (toType === "contact") {
        const clearAbove = Math.min(rowTop.get(fromType) ?? a.t, rowTop.get(toType) ?? b.t) - ROW_MARGIN;
        el.setAttribute(
          "d",
          `M ${a.x} ${a.t} L ${a.x} ${clearAbove} L ${b.x} ${clearAbove} L ${b.x} ${b.t}` +
            tickMark(a.x, a.t, 0, -1) +
            crowsFoot(b.x, b.t, 0, -1),
        );
        continue;
      }

      const down = b.t >= a.t;
      const exitY = down ? a.b : a.t;
      const entryY = down ? b.t : b.b;
      const rowClear = down ? rowBottom.get(fromType)! + ROW_MARGIN : rowTop.get(fromType)! - ROW_MARGIN;
      const destClear = down ? rowTop.get(toType)! - ROW_MARGIN : rowBottom.get(toType)! + ROW_MARGIN;
      const idx = originIndex.get(from) ?? 0;
      let turnY = down ? rowClear + idx * GAP : rowClear - idx * GAP;
      turnY = down ? Math.min(turnY, destClear) : Math.max(turnY, destClear);

      el.setAttribute(
        "d",
        `M ${a.x} ${exitY} L ${a.x} ${turnY} L ${b.x} ${turnY} L ${b.x} ${entryY}` +
          tickMark(a.x, exitY, 0, down ? 1 : -1) +
          crowsFoot(b.x, entryY, 0, down ? -1 : 1),
      );
    }
  }

  /**
   * Routes only the skill lines that are currently lit — which is always
   * either one skill fanning out to its projects, or one project gathering
   * its skills — so no line ever makes room for one that isn't drawn.
   *
   * Horizontal runs live in the clear corridor between the bottom of
   * "you" and the first row of projects beneath it, so they never cut
   * across a card; each drop into a project picks a spot on its top edge
   * that doesn't pass behind another card on the way down.
   *
   * One skill -> many projects: one column just right of the row, one
   * shared trunk at the bottom of the corridor, a drop into each project.
   *
   * Many skills -> one project: each skill gets its own column, level, and
   * entry point, assigned so the lines nest instead of crossing. The top
   * row always takes the outermost column and the rightmost entry; its
   * level is the shallowest when the project lies to the right of the
   * columns (lines run right, so outer = higher) and the deepest when it
   * lies to the left (lines double back, so outer = lower).
   *
   * One skill -> its projects is drawn with a crow's foot at the skill
   * ("many") end and a tick at the project ("one") end. Subpaths run in
   * drawing order — foot, line, tick — so the draw-in travels outward.
   */
  private routeSkillEdges() {
    const you = this.box("you");
    const lit = this.edgeEls.filter(({ from, to }) => this.isLitEdge(from, to));
    if (!you || !lit.length) return;

    const skills = [...new Set(lit.map((e) => e.from))].sort(
      (a, b) => this.attributeOffset.get(a)!.dy - this.attributeOffset.get(b)!.dy,
    );
    const targets = [...new Set(lit.map((e) => e.to))];
    const youCenterY = (you.t + you.b) / 2;
    const exitX = you.r;

    let firstRowTop = Infinity;
    for (const n of this.data.nodes) {
      if (n.type !== "project") continue;
      const bx = this.box(n.id);
      if (bx && bx.t > you.b) firstRowTop = Math.min(firstRowTop, bx.t);
    }
    let minTargetTop = Infinity;
    for (const t of targets) minTargetTop = Math.min(minTargetTop, this.box(t)?.t ?? Infinity);
    const floor = Math.min(firstRowTop, minTargetTop) - ROW_MARGIN;
    const ceil = you.b + ROW_MARGIN;

    const k = skills.length;
    const room = floor - ceil;
    const level = k > 1 && room > 0 ? Math.max(6, Math.min(GAP, room / (k - 1))) : GAP;

    const draw = (el: SVGPathElement, exitY: number, colX: number, bandY: number, entryX: number, entryY: number) => {
      el.setAttribute(
        "d",
        crowsFoot(exitX, exitY, 1, 0) +
          ` M ${exitX} ${exitY} L ${colX} ${exitY} L ${colX} ${bandY} L ${entryX} ${bandY} L ${entryX} ${entryY}` +
          tickMark(entryX, entryY, 0, entryY >= bandY ? -1 : 1),
      );
    };

    if (k === 1) {
      const exitY = youCenterY + this.attributeOffset.get(skills[0])!.dy;
      for (const { to, el } of lit) {
        const t = this.box(to);
        if (!t) continue;
        draw(el, exitY, exitX + GAP, floor, this.clearEntryX(to, t, 0, floor), t.t);
      }
      return;
    }

    const target = targets[0];
    const t = this.box(target);
    if (!t) return;
    const spacing = Math.min(GAP, ((t.r - t.l) * 0.8) / (k - 1));
    const half = (spacing * (k - 1)) / 2;
    const center = this.clearEntryX(target, t, half, floor - level * (k - 1));
    const goesRight = center - half > exitX + GAP * k;

    skills.forEach((skill, i) => {
      const el = lit.find((e) => e.from === skill)!.el;
      const exitY = youCenterY + this.attributeOffset.get(skill)!.dy;
      const colX = exitX + GAP * (k - i);
      const bandY = goesRight ? floor - level * (k - 1 - i) : floor - level * i;
      draw(el, exitY, colX, bandY, center + half - spacing * i, t.t);
    });
  }

  /**
   * Picks where along a project's top edge to drop into it — as close to
   * its center as possible while keeping [x - half, x + half] clear of
   * every other card between `fromY` and the project's top, so the drop
   * never passes behind another card.
   */
  private clearEntryX(targetId: string, t: Box, half: number, fromY: number): number {
    const lo = t.l + 10 + half;
    const hi = t.r - 10 - half;
    if (lo > hi) return t.x;
    const blocks: [number, number][] = [];
    for (const id of this.nodeEls.keys()) {
      if (id === targetId) continue;
      const o = this.box(id);
      if (!o || o.b <= fromY || o.t >= t.t) continue;
      blocks.push([o.l - 6 - half, o.r + 6 + half]);
    }
    const isClear = (x: number) => blocks.every(([a, b]) => x < a || x > b);
    const candidates = [t.x, lo, hi, ...blocks.flatMap(([a, b]) => [a - 1, b + 1])].filter(
      (x) => x >= lo && x <= hi && isClear(x),
    );
    candidates.sort((a, b) => Math.abs(a - t.x) - Math.abs(b - t.x));
    return candidates[0] ?? t.x;
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
    this.center();
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
   *
   * The gap it keeps is the corridor routeSkillEdges runs horizontal
   * lines through: one level per skill of the most-connected project,
   * GAP apart, with ROW_MARGIN at both ends — and never less than the
   * room the "hover a skill" callout needs.
   */
  private ensureClearanceBelowYou() {
    const you = this.positions.get("you");
    const youSize = this.nodeSize.get("you");
    if (!you || !youSize) return;
    const skillsPerProject = new Map<string, number>();
    for (const e of this.data.edges) {
      if (this.attributeOffset.has(e.from)) skillsPerProject.set(e.to, (skillsPerProject.get(e.to) ?? 0) + 1);
    }
    const maxSkills = Math.max(1, ...skillsPerProject.values());
    const corridor = Math.max(COACH_CLEARANCE, ROW_MARGIN * 2 + GAP * (maxSkills - 1));
    const youBottom = you.y + youSize.h / 2 + corridor;

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
