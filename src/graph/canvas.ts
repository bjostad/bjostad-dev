import type { Focus, GraphData, GraphNode, SkillCategory } from "../data/types";
import { computeInitialLayout, reduceAttributeProjectCrossings, type LayoutNode } from "./layout";

const SVG_NS = "http://www.w3.org/2000/svg";
// Bump the trailing version whenever the layout algorithm changes in a way
// that would make an old saved arrangement look wrong (moved rows, resized
// cards, new routing) — loadPositions only checks that the node *ids*
// still match, so a stale save from a previous version would otherwise
// keep "validating" and loading over whatever the current default should
// be, even though nothing about the content changed.
const STORAGE_KEY = "bjostad-graph-layout-v8";
const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
// How long a skill's projects stay revealed after the pointer leaves its
// row — long enough to travel from the row to one of those project cards.
const HOVER_GRACE_MS = 600;
const FIT_PADDING = 32;
const MIN_SCALE = 0.45;
// Fitting a tall graph onto a short screen shrinks the card text past
// comfortable reading size, so the fit never goes below this for height:
// the canvas grows taller than the window instead and the page scrolls.
// (Width still always fits — no sideways scrolling.)
const READABLE_SCALE = 0.9;
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
// Phones get a single full-width column of cards instead of the diagram
// layout, with skill lines running down a channel along the right edge.
// Keep in sync with the max-width media query in style.css.
const MOBILE_QUERY = window.matchMedia("(max-width: 640px)");
const MOBILE_PAD = 14;
const MOBILE_CHANNEL = 34;
const MOBILE_CARD_GAP = 16;
// Distance between skill lines entering the same project side by side.
const ENTRY_SPACING = 12;
// Side-by-side layout, the default on any window wider than it is tall: see layoutSide.
const SIDE_LANE = 8; // spacing between parallel lines in the side layout's lanes
const SIDE_ROW_GAP = 14; // no lines run between grid rows, so they can sit close
// Extra width at the "you" end of the channel, kept free of line columns,
// so each line's first flat stretch fits its «use» arrowhead.
const SIDE_START_ROOM = 8;
const SIDE_CONTACT_GAP = 40;
// A skill line's «use» arrowhead: its length along the line, and half its spread.
const ARROW_LEN = 9;
const ARROW_HALF = 5;

/** A drawn edge. Skill lines are UML «use» dependencies, drawn dashed
 * (setSkillPath), so they also carry a separate solid arrowhead, and a solid
 * copy of the line in a mask (`reveal`) that the draw-in animates — a line's
 * dash pattern can't also run the draw-in. */
interface EdgeEl {
  from: string;
  to: string;
  el: SVGPathElement;
  arrow?: SVGPathElement;
  reveal?: SVGPathElement;
}

/** Where the side layout leaves room for skill lines (canvas coordinates). */
interface SideGeometry {
  /** Vertical lane between "you" and the project grid: [left, right]. */
  channel: [number, number];
  /** Horizontal lane above the grid: [top, bottom]. */
  band: [number, number];
  /** Vertical lane between the grid's two columns: [left, right]. */
  gutter: [number, number];
  /** Projects in the grid's right column, reached through band and gutter. */
  rightCol: Set<string>;
}

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
  private edgeEls: EdgeEl[] = [];
  private attrColor = new Map<string, string>();
  private onExpand: (node: GraphNode) => void;
  private hoverId: string | null = null;
  private pinnedId: string | null = null;
  /** A lens or search result, shown whenever nothing is hovered or pinned. */
  private focus: { projects: Map<string, number>; skills: Set<string>; label: string; ranked: boolean } | null = null;
  private clearTimer: number | undefined;
  /** Projects reachable through a skill attribute — dim until one of their skills is picked. */
  private revealable = new Set<string>();
  private shownEdges = new Set<SVGPathElement>();
  private mobile = MOBILE_QUERY.matches;
  /** Height of the single-column mobile layout, which the page scrolls through. */
  private mobileHeight = 0;
  /** Side-by-side layout (see layoutSide) rather than the stacked diagram. */
  private side = !this.mobile && !isPortrait();
  private sideGeo: SideGeometry | null = null;

  constructor(
    root: HTMLElement,
    data: GraphData,
    onExpand: (node: GraphNode) => void,
  ) {
    this.root = root;
    this.data = data;
    this.onExpand = onExpand;

    // Reorder you's attribute rows and the project row to cut down line
    // crossings — safe to run unconditionally since it only touches
    // ordering, not x/y, so it's correct whether positions below end up
    // coming from a fresh layout or a restored session.
    reduceAttributeProjectCrossings(this.data);

    const stored = this.mobile || this.sideLayout ? null : this.loadPositions();
    this.positions = stored ?? computeInitialLayout(data);

    // Lines are colored by skill type (language, framework, …), matching
    // each skill's type badge, so the badges double as the color key.
    const you = data.nodes.find((n) => n.type === "you");
    for (const attr of you?.attributes ?? []) {
      this.attrColor.set(attr.id, attr.category ? CATEGORY_COLOR[attr.category] : UNCATEGORIZED_COLOR);
    }

    this.root.innerHTML = "";
    this.root.classList.add("graph-root");
    this.root.classList.toggle("side-layout", this.sideLayout);

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
    this.measureNodes();
    this.measureAttributeOffsets();
    if (this.mobile) {
      this.layoutMobile();
    } else if (this.sideLayout) {
      this.layoutSide();
    } else if (!stored) {
      // Only a freshly computed layout gets the no-overlap / clearance
      // guarantees — a stored layout may include positions the user
      // dragged on top of each other on purpose, and that choice should
      // stick across reloads.
      this.ensureClearanceBelowYou();
      this.resolveOverlaps();
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
      const mobile = MOBILE_QUERY.matches;
      if (mobile !== this.mobile || (!mobile && isPortrait() === this.side)) {
        this.switchLayoutMode();
      } else if (this.mobile) {
        this.layoutMobile(); // width changed (e.g. rotation): cards resize, so re-stack
        this.center();
        this.render();
      } else {
        this.center();
        this.onRender?.();
      }
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

  /**
   * Phone layout: every card full width in one column — you, contact, then
   * projects in their ranked order — at full size, with the page scrolling
   * through them. Cards are narrower than the screen by MOBILE_CHANNEL so
   * skill lines have a lane down the right edge (see routeSkillEdgesMobile).
   */
  private layoutMobile() {
    const width = this.root.clientWidth;
    this.root.style.setProperty("--mobile-card-w", `${width - MOBILE_PAD * 2 - MOBILE_CHANNEL}px`);
    this.measureNodes();
    this.measureAttributeOffsets();

    const order = [
      ...this.data.nodes.filter((n) => n.type === "you"),
      ...this.data.nodes.filter((n) => n.type === "contact"),
      ...this.data.nodes.filter((n) => n.type !== "you" && n.type !== "contact"),
    ];
    const positions = new Map<string, LayoutNode>();
    let y = MOBILE_PAD;
    for (const n of order) {
      const s = this.nodeSize.get(n.id)!;
      positions.set(n.id, { id: n.id, x: MOBILE_PAD + s.w / 2, y: y + s.h / 2 });
      // The "tap a skill" callout hangs below "you", above the contact card.
      y += s.h + (n.type === "you" ? COACH_CLEARANCE : MOBILE_CARD_GAP);
    }
    this.positions = positions;
    this.mobileHeight = y - MOBILE_CARD_GAP + MOBILE_PAD;
  }

  /**
   * Records every card's rendered size. First, on desktop layouts, every
   * project card is given the tallest one's height so the grid reads as
   * a set of equal cards (they already share a width, style.css); the
   * phone column lets each card fit its own content.
   */
  private measureNodes() {
    const projects = this.data.nodes.filter((n) => n.type === "project").map((n) => this.nodeEls.get(n.id)!);
    for (const el of projects) el.style.minHeight = "";
    if (!this.mobile && projects.length) {
      const tallest = Math.max(...projects.map((el) => el.offsetHeight));
      for (const el of projects) el.style.minHeight = `${tallest}px`;
    }
    for (const [id, el] of this.nodeEls) this.nodeSize.set(id, { w: el.offsetWidth, h: el.offsetHeight });
  }

  /** Whether the side-by-side layout is showing. */
  private get sideLayout(): boolean {
    return this.side;
  }

  /**
   * Side-by-side layout, used on any window wider than it is tall (phones
   * keep their column; taller-than-wide windows get the stacked diagram,
   * computeInitialLayout): "you" top-left with the
   * contact card under it, and the projects in a two-column grid to the
   * right in ranked order (left to right, top to bottom). Uses the width a
   * desktop window has to spare instead of stacking everything vertically.
   *
   * Room is left for skill lines in three lanes, each wide enough for one
   * line per skill of the most-connected project: a channel between "you"
   * and the grid, a band above the grid, and a gutter between its columns
   * (see routeSkillEdgesSide). Cards aren't draggable here, since the
   * routing depends on those lanes staying clear.
   */
  private layoutSide() {
    this.measureNodes();
    this.measureAttributeOffsets();

    const skillsPerProject = new Map<string, number>();
    for (const e of this.data.edges) {
      if (this.attributeOffset.has(e.from)) skillsPerProject.set(e.to, (skillsPerProject.get(e.to) ?? 0) + 1);
    }
    const maxSkills = Math.max(1, ...skillsPerProject.values());
    const lane = ROW_MARGIN * 2 + SIDE_LANE * (maxSkills - 1);

    const you = this.nodeSize.get("you")!;
    const grid = this.data.nodes.filter((n) => n.type !== "you" && n.type !== "contact");
    const colW = Math.max(...grid.map((n) => this.nodeSize.get(n.id)!.w));
    const channel: [number, number] = [you.w, you.w + SIDE_START_ROOM + lane];
    const gutter: [number, number] = [channel[1] + colW, channel[1] + colW + lane];
    const colLeft = [channel[1], gutter[1]];

    const positions = new Map<string, LayoutNode>();
    positions.set("you", { id: "you", x: you.w / 2, y: you.h / 2 });
    const contact = this.data.nodes.find((n) => n.type === "contact");
    if (contact) {
      const s = this.nodeSize.get(contact.id)!;
      positions.set(contact.id, { id: contact.id, x: s.w / 2, y: you.h + SIDE_CONTACT_GAP + s.h / 2 });
    }

    const rightCol = new Set<string>();
    let rowTop = lane; // the band above the grid starts level with the top of "you"
    for (let i = 0; i < grid.length; i += 2) {
      const row = grid.slice(i, i + 2);
      row.forEach((n, col) => {
        const s = this.nodeSize.get(n.id)!;
        positions.set(n.id, { id: n.id, x: colLeft[col] + s.w / 2, y: rowTop + s.h / 2 });
        if (col === 1) rightCol.add(n.id);
      });
      rowTop += Math.max(...row.map((n) => this.nodeSize.get(n.id)!.h)) + SIDE_ROW_GAP;
    }

    this.positions = positions;
    this.sideGeo = { channel, band: [0, lane], gutter, rightCol };
  }

  /** Crossing the phone breakpoint, or a window turning taller than it is
   * wide or back (resizing a desktop window, rotating a tablet), swaps
   * between the column, stacked, and side layouts. */
  private switchLayoutMode() {
    this.mobile = MOBILE_QUERY.matches;
    this.side = !this.mobile && !isPortrait();
    this.root.classList.toggle("side-layout", this.sideLayout);
    if (this.mobile) {
      this.layoutMobile();
    } else if (this.sideLayout) {
      this.root.style.removeProperty("--mobile-card-w");
      this.root.style.height = "";
      this.layoutSide();
    } else {
      this.root.style.removeProperty("--mobile-card-w");
      this.root.style.height = "";
      this.measureNodes();
      this.measureAttributeOffsets();
      const stored = this.loadPositions();
      this.positions = stored ?? computeInitialLayout(this.data);
      if (!stored) {
        this.ensureClearanceBelowYou();
        this.resolveOverlaps();
      }
    }
    this.center();
    this.render();
    this.applyHighlight();
    this.onLayoutChange?.(this.hasCustomLayout);
  }

  /** Scales (never up) and centers the whole graph. Height is only fitted
   * down to READABLE_SCALE; past that the canvas grows taller than the
   * window (.tall) and the page scrolls through it. If even the minimum
   * scale doesn't fit the width, it anchors to the left instead so "you"
   * stays in view. On phones the column is shown at full size and the
   * page scrolls through it instead. */
  private center() {
    if (this.mobile) {
      this.viewport.style.transform = "translate(0px, 0px) scale(1)";
      this.root.classList.remove("tall");
      this.root.style.height = `${this.mobileHeight}px`;
      return;
    }
    // The window, not the canvas, sets the available height: a .tall
    // canvas is already taller than the window.
    const rect = this.root.getBoundingClientRect();
    const windowH = window.innerHeight - (rect.top + window.scrollY);
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
    if (minX === Infinity || !rect.width || windowH <= 0) {
      this.viewport.style.transform = `translate(${rect.width / 2}px, ${rect.height / 2}px)`;
      return;
    }

    const availW = rect.width - FIT_PADDING * 2;
    const availH = windowH - FIT_PADDING * 2;
    const heightFit = Math.max(READABLE_SCALE, availH / (maxY - minY));
    const scale = Math.max(MIN_SCALE, Math.min(1, availW / (maxX - minX), heightFit));
    const tall = (maxY - minY) * scale > availH;
    this.root.classList.toggle("tall", tall);
    this.root.style.height = tall ? `${Math.ceil((maxY - minY) * scale + FIT_PADDING * 2)}px` : "";
    const height = tall ? this.root.offsetHeight : windowH;
    const tx = (maxX - minX) * scale > availW ? FIT_PADDING - scale * minX : rect.width / 2 - (scale * (minX + maxX)) / 2;
    const ty = tall ? FIT_PADDING - scale * minY : height / 2 - (scale * (minY + maxY)) / 2;
    this.viewport.style.transform = `translate(${tx}px, ${ty}px) scale(${scale})`;
  }

  private buildEdges() {
    // UML composition: a filled diamond at the "whole" end (you -> contact).
    const defs = document.createElementNS(SVG_NS, "defs");
    defs.innerHTML = `<marker id="uml-composition" viewBox="0 0 18 10" refX="0" refY="5" markerWidth="18" markerHeight="10" markerUnits="userSpaceOnUse" orient="auto"><path class="uml-diamond" d="M0 5 L9 0 L18 5 L9 10 Z"/></marker>`;
    this.svg.appendChild(defs);

    this.data.edges.forEach((e, i) => {
      const el = document.createElementNS(SVG_NS, "path");
      const toContact = this.data.nodes.some((n) => n.id === e.to && n.type === "contact");
      const isSkill = e.kind === "built-with";
      el.setAttribute("class", `edge edge-${e.kind}${isSkill ? " edge-use" : ""}${toContact ? " edge-contact" : ""}`);
      if (toContact) el.setAttribute("marker-start", "url(#uml-composition)");
      const color = this.attrColor.get(e.from);
      if (color) el.style.stroke = color;
      this.svg.appendChild(el);
      const line: EdgeEl = { from: e.from, to: e.to, el };

      if (isSkill) {
        const mask = document.createElementNS(SVG_NS, "mask");
        mask.id = `skill-reveal-${i}`;
        mask.setAttribute("maskUnits", "userSpaceOnUse");
        mask.setAttribute("x", "-10000");
        mask.setAttribute("y", "-10000");
        mask.setAttribute("width", "20000");
        mask.setAttribute("height", "20000");
        const reveal = document.createElementNS(SVG_NS, "path");
        reveal.setAttribute("class", "edge-reveal");
        mask.appendChild(reveal);
        defs.appendChild(mask);
        el.setAttribute("mask", `url(#${mask.id})`);

        const arrow = document.createElementNS(SVG_NS, "path");
        arrow.setAttribute("class", "edge edge-built-with edge-arrow concealed");
        if (color) arrow.style.stroke = color;
        this.svg.appendChild(arrow);
        line.reveal = reveal;
        line.arrow = arrow;
      }
      this.edgeEls.push(line);
    });
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
        this.dismissCoach();
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
    if (this.mobile) {
      this.layoutMobile(); // card heights changed, so the column re-stacks
    } else if (this.sideLayout) {
      this.layoutSide();
    } else {
      this.measureNodes();
      this.measureAttributeOffsets();
      // The first layout was spaced with fallback-font card sizes, which
      // can push cards apart and close the gaps skill lines drop through.
      // Nothing is stored until the user drags, so redo it with real sizes.
      if (!this.loadPositions()) {
        this.positions = computeInitialLayout(this.data);
        this.ensureClearanceBelowYou();
        this.resolveOverlaps();
      }
    }
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
              <span class="attr-label"><span class="attr-visibility">+</span> ${escapeHtml(a.label)}</span>
              ${a.category ? `<span class="attr-badge">: ${escapeHtml(a.category[0].toUpperCase() + a.category.slice(1))}</span>` : ""}
            </div>`,
        )
        .join("");

      return `
        <div class="you-hero">
          ${photo}
          <div class="you-overlay">
            <div class="node-title">${escapeHtml(node.title)}</div>
            ${statusLineHtml(node.status, escapeHtml)}
            ${node.summary ? `<p class="you-pitch">${escapeHtml(node.summary)}</p>` : ""}
          </div>
        </div>
        ${
          attrRows
            ? `<div class="attr-list">
                ${node.subtitle ? `<div class="attr-entity">«${escapeHtml(node.subtitle.replace(/\s+/g, ""))}»</div>` : ""}
                ${attrRows}
              </div>`
            : ""
        }
        ${attrRows ? `<div class="coach" role="note"><span class="coach-arrow" aria-hidden="true"></span><span class="coach-hover">Hover</span><span class="coach-tap">Tap</span> a skill to see the projects I've used it in</div>` : ""}`;
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
            const label = /resume/i.test(l.label) ? "résumé" : l.label.toLowerCase();
            const text = /resume/i.test(l.label) ? "View PDF" : l.url;
            return `<div class="node-field"><span class="field-label">${escapeHtml(label)}</span> ${linkHtml(l.url, text)}</div>`;
          })
      : [];
    const fieldsHtml = [...fieldRows, ...extraRows].join("");

    const highlightsHtml = node.cardHighlights?.length
      ? `<ul class="node-highlights">${node.cardHighlights.map((h) => `<li>${escapeHtml(h)}</li>`).join("")}</ul>`
      : "";

    // UML class box: a name compartment (stereotype, name, tagline), then
    // the card's highlights or fields in a compartment of their own.
    const stereotype = node.type === "contact" ? "information" : node.type; // UML information item
    return `
      <div class="uml-name">
        <div class="uml-stereotype">«${escapeHtml(stereotype)}»</div>
        <div class="node-title">${escapeHtml(node.title)}</div>
        ${node.subtitle ? `<div class="node-subtitle">${escapeHtml(node.subtitle)}</div>` : ""}
      </div>
      ${highlightsHtml}
      ${fieldsHtml ? `<div class="uml-compartment">${fieldsHtml}</div>` : ""}`;
  }

  private suppressClick = false;

  private startDrag(id: string, ev: PointerEvent) {
    // Dragging captures the pointer, which makes the browser deliver the
    // following click to the card rather than whatever was pressed — so
    // links and skill rows must not start a drag, or their own click
    // never fires and the card's detail panel opens instead.
    if ((ev.target as Element).closest("a, .attr-row")) return;
    // No dragging in the phone column (a swipe on a card should scroll the
    // page) or the side layout (its line routing needs its lanes clear).
    if (this.mobile || this.sideLayout) return;
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
      // A press without movement is a click, not a rearrangement.
      if (this.suppressClick) {
        this.savePositions();
        this.onLayoutChange?.(true);
      }
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
    // Hovering or pinning something takes over; the focus comes back once it's let go.
    const focus = activeId === null ? this.focus : null;
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
    // "You" and the contact card never dim: they're relevant whatever is
    // highlighted (and a project stays pinned after its section closes).
    // Neither does the line between them.
    const alwaysLit = new Set(this.data.nodes.filter((n) => n.type === "you" || n.type === "contact").map((n) => n.id));
    for (const line of this.edgeEls) {
      const { from, to, el } = line;
      const isAttrEdge = this.attributeOffset.has(from);
      const active = this.isLitEdge(from, to);
      const visible = !isAttrEdge || active;
      for (const part of line.arrow ? [el, line.arrow] : [el]) {
        part.classList.toggle("concealed", !visible);
        part.classList.toggle("active", active);
        part.classList.toggle(
          "dim",
          activeId !== null && visible && !active && !(alwaysLit.has(from) && alwaysLit.has(to)),
        );
      }

      if (visible && !this.shownEdges.has(el)) {
        this.shownEdges.add(el);
        if (isAttrEdge) arrivalMs.set(to, Math.min(arrivalMs.get(to) ?? Infinity, this.drawIn(line)));
      } else if (!visible && this.shownEdges.has(el)) {
        this.shownEdges.delete(el);
        (line.reveal ?? el).getAnimations().forEach((a) => a.cancel());
      }
    }

    for (const [nid, el] of this.nodeEls) {
      const lit = nid === activeId || litProjects.has(nid);
      const rank = focus?.projects.get(nid);
      const dim = alwaysLit.has(nid)
        ? false
        : focus
          ? this.revealable.has(nid) && rank === undefined
          : this.revealable.has(nid)
            ? !lit
            : activeId !== null;
      el.classList.toggle("focus-hit", rank !== undefined);
      if (rank !== undefined && focus?.ranked) el.dataset.rank = `#${rank + 1} ${focus.label}`;
      else delete el.dataset.rank;
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
      const on = focus ? focus.skills.has(aid) : litSkills.has(aid);
      el.classList.toggle("dim", (activeId !== null || focus !== null) && !on);
      el.classList.toggle("active-attr", on);
    }
  }

  /** Lights up a lens's or search's projects and skills (null clears it).
   * Replaces any pinned highlight, since picking a lens is the newer choice. */
  setFocus(focus: Focus | null) {
    this.focus = focus && {
      projects: new Map(focus.projects.map((id, i) => [id, i])),
      skills: new Set(focus.skills),
      label: focus.label,
      ranked: focus.ranked,
    };
    this.pinnedId = null;
    if (focus) this.dismissCoach();
    this.applyHighlight();
  }

  /** Animates a line drawing itself from its start; returns how long that takes. */
  private drawIn(line: EdgeEl): number {
    if (reducedMotion) return 0;
    const el = line.reveal ?? line.el;
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
  /** Called when the user drags a card (true) or resets the layout (false). */
  onLayoutChange: ((custom: boolean) => void) | null = null;

  /** Whether the diagram shows a user-arranged layout rather than the default. */
  get hasCustomLayout(): boolean {
    return !this.mobile && !this.sideLayout && this.loadPositions() !== null;
  }

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
      if (toType === "contact" && (this.mobile || this.sideLayout)) {
        // Contact sits directly below "you" in the phone column and the side
        // layout: a straight drop near the left edge, clear of the callout
        // hanging on the right.
        const x = Math.max(a.l, b.l) + 24;
        el.setAttribute("d", `M ${x} ${a.b} L ${x} ${b.t}`);
        continue;
      }
      if (toType === "contact") {
        const clearAbove = Math.min(rowTop.get(fromType) ?? a.t, rowTop.get(toType) ?? b.t) - ROW_MARGIN;
        el.setAttribute(
          "d",
          `M ${a.x} ${a.t} L ${a.x} ${clearAbove} L ${b.x} ${clearAbove} L ${b.x} ${b.t}`,
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
   * Each line is a UML «use» dependency — the project uses the skill —
   * drawn dashed with an open arrowhead at the skill (setSkillPath).
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

    if (this.mobile) {
      this.routeSkillEdgesMobile(lit, skills, you, youCenterY);
      return;
    }
    if (this.sideLayout) {
      this.routeSkillEdgesSide(lit, skills, you, youCenterY);
      return;
    }

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

    const draw = (line: EdgeEl, exitY: number, colX: number, bandY: number, entryX: number, entryY: number) => {
      this.setSkillPath(
        line,
        `M ${exitX} ${exitY} L ${colX} ${exitY} L ${colX} ${bandY} L ${entryX} ${bandY} L ${entryX} ${entryY}`,
        exitX,
        exitY,
      );
    };

    if (k === 1) {
      const exitY = youCenterY + this.attributeOffset.get(skills[0])!.dy;
      for (const line of lit) {
        const t = this.box(line.to);
        if (!t) continue;
        draw(line, exitY, exitX + GAP, floor, this.clearEntryX(line.to, t, 0, floor), t.t);
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
      const line = lit.find((e) => e.from === skill)!;
      const exitY = youCenterY + this.attributeOffset.get(skill)!.dy;
      const colX = exitX + GAP * (k - i);
      const bandY = goesRight ? floor - level * (k - 1 - i) : floor - level * i;
      draw(line, exitY, colX, bandY, center + half - spacing * i, t.t);
    });
  }

  /**
   * Phone routing: every card shares the same right edge, so skill lines
   * leave "you" to the right, run down the free channel between the cards
   * and the screen edge, and turn left into each project's right side —
   * never behind another card.
   *
   * One skill -> many projects: a single trunk with a branch into each.
   * Many skills -> one project: a trunk per skill, packed into the channel,
   * with the top row taking the outermost trunk and the lowest entry point
   * so the lines nest instead of crossing.
   */
  private routeSkillEdgesMobile(
    lit: EdgeEl[],
    skills: string[],
    you: Box,
    youCenterY: number,
  ) {
    const exitX = you.r;
    const channelLeft = exitX + 4;
    const channelWidth = this.root.clientWidth - 4 - channelLeft;
    const draw = (line: EdgeEl, exitY: number, trunkX: number, target: Box, entryY: number) => {
      this.setSkillPath(
        line,
        `M ${exitX} ${exitY} L ${trunkX} ${exitY} L ${trunkX} ${entryY} L ${target.r} ${entryY}`,
        exitX,
        exitY,
      );
    };

    const k = skills.length;
    if (k === 1) {
      const exitY = youCenterY + this.attributeOffset.get(skills[0])!.dy;
      const trunkX = channelLeft + Math.min(14, channelWidth / 2);
      for (const line of lit) {
        const t = this.box(line.to);
        if (t) draw(line, exitY, trunkX, t, (t.t + t.b) / 2);
      }
      return;
    }

    const t = this.box(lit[0].to);
    if (!t) return;
    const trunkGap = Math.max(2.5, Math.min(8, (channelWidth - 6) / k));
    const spacing = Math.min(ENTRY_SPACING, ((t.b - t.t) * 0.7) / (k - 1));
    const centerY = (t.t + t.b) / 2;
    skills.forEach((skill, i) => {
      const line = lit.find((e) => e.from === skill)!;
      const exitY = youCenterY + this.attributeOffset.get(skill)!.dy;
      draw(line, exitY, channelLeft + 4 + trunkGap * (k - 1 - i), t, centerY + ((k - 1) / 2 - i) * spacing);
    });
  }

  /**
   * Side-layout routing (see layoutSide). Every line leaves "you"'s right
   * edge and enters a project's left edge; nothing runs between grid rows.
   * Left-column projects are reached straight across the channel. Right-
   * column projects are reached up the channel, across the band above the
   * grid, and down the gutter between its columns.
   *
   * One skill -> many projects: one trunk each in the channel, band, and
   * gutter, with a branch into each project.
   *
   * Many skills -> one project: each skill gets its own channel column,
   * band level, gutter column, and entry point, ordered so the lines nest
   * instead of crossing. Entry points always follow the skill order (top
   * skill enters highest). Right column: the top skill takes the innermost
   * channel column, the highest band level, and the outermost gutter
   * column. Left column: skills that drop to their entry take the outer
   * channel columns, top skill outermost; skills that rise take the inner
   * ones, top skill innermost.
   */
  private routeSkillEdgesSide(
    lit: EdgeEl[],
    skills: string[],
    you: Box,
    youCenterY: number,
  ) {
    const g = this.sideGeo;
    if (!g) return;
    const exitX = you.r;
    const exitY = (skill: string) => youCenterY + this.attributeOffset.get(skill)!.dy;
    // n evenly spaced lines centered in a lane, lowest coordinate first.
    const spread = (n: number, [lo, hi]: [number, number]) => {
      const inner = lo + ROW_MARGIN;
      const outer = hi - ROW_MARGIN;
      const step = n > 1 ? Math.min(SIDE_LANE, (outer - inner) / (n - 1)) : 0;
      const mid = (inner + outer) / 2;
      return Array.from({ length: n }, (_, i) => mid - (step * (n - 1)) / 2 + step * i);
    };
    // Line columns stay clear of the arrowheads beside "you".
    const channel: [number, number] = [g.channel[0] + SIDE_START_ROOM, g.channel[1]];
    const gutter = g.gutter;
    const draw = (line: EdgeEl, pts: [number, number][]) => {
      this.setSkillPath(line, pts.map(([x, y], i) => `${i ? "L" : "M"} ${x} ${y}`).join(" "), exitX, pts[0][1]);
    };

    const k = skills.length;
    if (k === 1) {
      const ey = exitY(skills[0]);
      const [cx] = spread(1, channel);
      const [by] = spread(1, g.band);
      const [gx] = spread(1, gutter);
      for (const line of lit) {
        const { to } = line;
        const t = this.box(to);
        if (!t) continue;
        const en = (t.t + t.b) / 2;
        draw(
          line,
          g.rightCol.has(to)
            ? [[exitX, ey], [cx, ey], [cx, by], [gx, by], [gx, en], [t.l, en]]
            : [[exitX, ey], [cx, ey], [cx, en], [t.l, en]],
        );
      }
      return;
    }

    const target = lit[0].to;
    const t = this.box(target);
    if (!t) return;
    const step = Math.min(ENTRY_SPACING, ((t.b - t.t) * 0.7) / (k - 1));
    const entries = skills.map((_, i) => (t.t + t.b) / 2 + (i - (k - 1) / 2) * step);
    const cols = spread(k, channel); // innermost (nearest "you") first

    if (g.rightCol.has(target)) {
      const levels = spread(k, g.band); // highest first
      const gutterCols = spread(k, gutter); // innermost first
      skills.forEach((skill, i) => {
        const line = lit.find((e) => e.from === skill)!;
        const ey = exitY(skill);
        const cx = cols[i];
        const by = levels[i];
        const gx = gutterCols[k - 1 - i];
        draw(line, [[exitX, ey], [cx, ey], [cx, by], [gx, by], [gx, entries[i]], [t.l, entries[i]]]);
      });
      return;
    }

    // Left column. Exit rows are further apart than entry points, so the
    // skills that drop to their entry are always a run from the top.
    const drops = skills.filter((skill, i) => exitY(skill) < entries[i]).length;
    skills.forEach((skill, i) => {
      const line = lit.find((e) => e.from === skill)!;
      const ey = exitY(skill);
      const cx = i < drops ? cols[k - 1 - i] : cols[i - drops];
      draw(line, [[exitX, ey], [cx, ey], [cx, entries[i]], [t.l, entries[i]]]);
    });
  }

  /** Sets a skill line's route (and its reveal copy, see EdgeEl) and puts
   * its «use» arrowhead at the skill end: open, pointing back into "you". */
  private setSkillPath(line: EdgeEl, d: string, exitX: number, exitY: number) {
    line.el.setAttribute("d", d);
    line.reveal?.setAttribute("d", d);
    line.arrow?.setAttribute(
      "d",
      `M ${exitX + ARROW_LEN} ${exitY - ARROW_HALF} L ${exitX} ${exitY} L ${exitX + ARROW_LEN} ${exitY + ARROW_HALF}`,
    );
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
    if (this.mobile || this.sideLayout) return; // not draggable, so there's nothing to reset
    this.positions = computeInitialLayout(this.data);
    this.ensureClearanceBelowYou();
    this.resolveOverlaps();
    sessionStorage.removeItem(STORAGE_KEY);
    if (!reducedMotion) {
      this.nodesLayer.classList.add("settling");
      window.setTimeout(() => this.nodesLayer.classList.remove("settling"), 500);
    }
    this.center();
    this.render();
    this.onLayoutChange?.(false);
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

/** Taller than wide: the stacked diagram fits better than the side layout. */
function isPortrait(): boolean {
  return window.innerHeight > window.innerWidth;
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

/** "● Open to the right role · Seattle, WA · …" under "you"'s name — shared with the list view. */
export function statusLineHtml(status: string[] | undefined, esc: (s: string) => string): string {
  if (!status?.length) return "";
  return `<p class="status-line"><span class="status-dot" aria-hidden="true"></span><span>${status.map(esc).join(" · ")}</span></p>`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
