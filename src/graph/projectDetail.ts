import type { GraphNode } from "../data/types";

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const DURATION_MS = 1000;
const TICK = 10;
// Shared by the scroll and the line draw so the line reaches the section
// exactly as the section arrives.
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const EASE_CSS = "cubic-bezier(0.65, 0, 0.35, 1)";

/**
 * Full-screen project overview below the graph. Opening a project scrolls
 * down to it while a line draws from the project's card into the
 * section's header, so the section reads as another entity hanging off
 * the diagram rather than a separate page.
 */
export class ProjectDetail {
  private section: HTMLElement;
  private svg: SVGSVGElement;
  private path: SVGPathElement;
  private node: GraphNode | null = null;
  private scrollFrame = 0;
  private state: "closed" | "opening" | "open" | "closing" = "closed";

  constructor(section: HTMLElement, svg: SVGSVGElement) {
    this.section = section;
    this.svg = svg;
    this.path = svg.querySelector("path")!;
    // Any manual scroll input takes over from the automatic one.
    for (const type of ["wheel", "touchstart", "keydown"]) {
      window.addEventListener(type, () => cancelAnimationFrame(this.scrollFrame), { passive: true });
    }
    // Scrolling all the way back up by hand counts as returning to the graph.
    window.addEventListener("scroll", () => {
      if (this.state === "open" && window.scrollY <= 0) this.close();
    });
  }

  show(node: GraphNode) {
    this.node = node;
    this.state = "opening";
    this.section.innerHTML = render(node);
    this.section.hidden = false;
    this.section.querySelector(".detail-back")!.addEventListener("click", () => this.close());

    requestAnimationFrame(() => {
      this.refresh();
      const heading = this.section.querySelector<HTMLElement>("h2");
      const top = this.section.getBoundingClientRect().top + window.scrollY;
      this.animateLine(false);
      this.scrollTo(top, () => {
        this.state = "open";
        heading?.focus({ preventScroll: true });
      });
    });
  }

  /** Scrolls back to the graph while the line retracts into the project's
   * card, then removes the section. */
  close() {
    if (this.state === "closed" || this.state === "closing") return;
    this.state = "closing";
    this.animateLine(true);
    this.scrollTo(0, () => {
      this.path.getAnimations().forEach((a) => a.cancel());
      this.section.hidden = true;
      this.section.innerHTML = "";
      this.node = null;
      this.state = "closed";
      this.refresh();
    });
  }

  /** Draws the line out from the card, or (retract) back into it. */
  private animateLine(retract: boolean) {
    this.path.getAnimations().forEach((a) => a.cancel());
    if (reducedMotion) return;
    const len = this.path.getTotalLength();
    this.path.style.strokeDasharray = `${len} ${len}`;
    const frames = [{ strokeDashoffset: len }, { strokeDashoffset: 0 }];
    const anim = this.path.animate(retract ? frames.reverse() : frames, {
      duration: DURATION_MS,
      easing: EASE_CSS,
      fill: retract ? "forwards" : "none",
    });
    anim.onfinish = () => {
      if (!retract) this.path.style.strokeDasharray = "";
    };
    anim.oncancel = () => (this.path.style.strokeDasharray = "");
  }

  /** Re-anchors the connector to the card's current on-screen position. */
  refresh() {
    const card = this.node && document.querySelector<HTMLElement>(`.node[data-id="${CSS.escape(this.node.id)}"]`);
    const port = this.section.querySelector<HTMLElement>(".detail-port");
    const c = card?.getBoundingClientRect();
    if (!c || !port || this.section.hidden || !c.width) {
      this.path.setAttribute("d", "");
      this.svg.style.height = "0"; // otherwise its old page-tall height keeps the page scrollable
      return;
    }
    const p = port.getBoundingClientRect();
    const s = this.section.getBoundingClientRect();
    const sx = window.scrollX;
    const sy = window.scrollY;

    const x1 = c.left + c.width / 2 + sx;
    const y1 = c.bottom + sy;
    const x2 = p.left + p.width / 2 + sx;
    const y2 = p.top + sy;
    const runY = s.top + sy + 24;

    this.svg.style.height = `${document.documentElement.scrollHeight}px`;
    this.path.setAttribute(
      "d",
      tick(x1, y1 + TICK * 0.7) +
        ` M ${x1} ${y1} L ${x1} ${runY} L ${x2} ${runY} L ${x2} ${y2}` +
        tick(x2, y2 - TICK * 0.7),
    );
  }

  private scrollTo(top: number, done?: () => void) {
    cancelAnimationFrame(this.scrollFrame);
    if (reducedMotion) {
      window.scrollTo(0, top);
      done?.();
      return;
    }
    const start = window.scrollY;
    const distance = top - start;
    const t0 = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - t0) / DURATION_MS);
      window.scrollTo(0, start + distance * easeInOut(t));
      if (t < 1) this.scrollFrame = requestAnimationFrame(step);
      else done?.();
    };
    this.scrollFrame = requestAnimationFrame(step);
  }
}

/** One-to-one cardinality mark across a vertical line. */
function tick(x: number, y: number): string {
  return ` M ${x - TICK / 2} ${y} L ${x + TICK / 2} ${y}`;
}

function render(node: GraphNode): string {
  const links = (node.links ?? [])
    .map((l) => `<a class="btn" href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)} ↗</a>`)
    .join("");

  let media: string;
  if (node.demoUrl) {
    media = `
      <div class="media-frame">
        <div class="media-bar">
          <span>Live demo</span>
          <a href="${esc(node.demoUrl)}" target="_blank" rel="noopener">Open in new tab ↗</a>
        </div>
        <iframe src="${esc(node.demoUrl)}" title="Live demo of ${esc(node.title)}" loading="lazy"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>
      </div>`;
  } else if (node.screenshot) {
    media = `<div class="media-frame"><img src="${esc(node.screenshot)}" alt="Screenshot of ${esc(node.title)}" /></div>`;
  } else {
    media = `<div class="media-frame media-placeholder"><span>Screenshot coming soon</span></div>`;
  }

  const highlights = node.highlights?.length
    ? `<h3>Engineering highlights</h3><ul class="detail-points">${node.highlights.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>`
    : "";
  const main =
    node.summary || highlights
      ? `${node.summary ? `<p class="detail-lede">${esc(node.summary)}</p>` : ""}${highlights}`
      : `<p class="detail-lede">A full write-up for this project is coming soon.</p>`;

  const glance = node.cardHighlights?.length
    ? `<h3>Key skills</h3><ul class="node-highlights">${node.cardHighlights.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>`
    : "";
  const stack = node.tags?.length
    ? `<h3>Stack</h3><div class="detail-tags">${node.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>`
    : "";

  return `
    <div class="detail-inner">
      <header class="detail-head">
        <span class="detail-port" aria-hidden="true"></span>
        <div class="detail-titles">
          <h2 tabindex="-1">${esc(node.title)}</h2>
          ${node.subtitle ? `<p class="detail-tagline">${esc(node.subtitle)}</p>` : ""}
        </div>
        <div class="detail-actions">
          ${links}
          <button type="button" class="btn detail-back">↑ Back to graph</button>
        </div>
      </header>
      ${media}
      <div class="detail-body">
        <div class="detail-main">${main}</div>
        <aside class="detail-side">${glance}${stack}</aside>
      </div>
    </div>`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
