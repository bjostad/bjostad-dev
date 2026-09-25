import type { GraphNode } from "../data/types";

const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const DURATION_MS = 1000;
// Match the cardinality marks drawn inside the graph (canvas.ts).
const TICK_LEN = 9;
const FORK_LEN = 12;
const FORK_SPREAD = 6;
// Shared by the scroll and the line draw so the line reaches the section
// exactly as the section arrives.
const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const EASE_CSS = "cubic-bezier(0.65, 0, 0.35, 1)";

/**
 * Full-screen section below the graph for a project or for contact info.
 * Opening one scrolls down to it while a line draws from the clicked
 * card into the section's header, so the section reads as another
 * entity hanging off the diagram rather than a separate page. A project
 * is one-to-one with its section (a tick at each end, blue); contact is
 * drawn many-to-many (a crow's foot at each end, green).
 */
export class DetailSection {
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
    this.section.innerHTML = node.type === "contact" ? renderContact(node) : renderProject(node);
    this.section.dataset.kind = node.type;
    this.path.classList.toggle("page-link-contact", node.type === "contact");
    this.section.hidden = false;
    this.section.querySelector(".detail-back")!.addEventListener("click", () => this.close());
    const carousel = this.section.querySelector<HTMLElement>(".carousel");
    if (carousel) {
      wireCarousel(carousel, (node.screenshots ?? []).map((s, i) => s.caption ?? `Screenshot ${i + 1}`));
    }

    requestAnimationFrame(() => {
      this.refresh();
      const heading = this.section.querySelector<HTMLElement>("h2");
      const top = this.section.getBoundingClientRect().top + window.scrollY;
      this.animateLine(false);
      this.scrollTo(top, () => {
        this.state = "open";
        heading?.focus({ preventScroll: true });
        // Embeds load only once the section has arrived: a PDF viewer (or
        // an embedded site) can grab focus as it loads, and the browser
        // then jumps straight to it, cutting the scroll animation short.
        this.section.querySelectorAll<HTMLIFrameElement>("iframe[data-src]").forEach((f) => {
          f.src = f.dataset.src!;
        });
      });
    });
  }

  /** Scrolls back to the graph while the line retracts into the card it
   * came from, then removes the section. */
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

    // Subpaths in drawing order (start mark, line, end mark), so the
    // draw-in travels from the card and the retract ends back at it.
    const many = this.node!.type === "contact";
    this.svg.style.height = `${document.documentElement.scrollHeight}px`;
    this.path.setAttribute(
      "d",
      (many ? crowsFoot(x1, y1, 1) : tick(x1, y1 + TICK_LEN * 0.7)) +
        ` M ${x1} ${y1} L ${x1} ${runY} L ${x2} ${runY} L ${x2} ${y2}` +
        (many ? crowsFoot(x2, y2, -1) : tick(x2, y2 - TICK_LEN * 0.7)),
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

/** "One" mark: a short bar across a vertical line. */
function tick(x: number, y: number): string {
  return ` M ${x - TICK_LEN / 2} ${y} L ${x + TICK_LEN / 2} ${y}`;
}

/** "Many" mark on a vertical line: three feet planted on the box edge at
 * `y`, converging `dir` (+1 down, -1 up) away from the box. */
function crowsFoot(x: number, y: number, dir: 1 | -1): string {
  const cy = y + dir * FORK_LEN;
  return ` M ${x - FORK_SPREAD} ${y} L ${x} ${cy} M ${x} ${y} L ${x} ${cy} M ${x + FORK_SPREAD} ${y} L ${x} ${cy}`;
}

function header(node: GraphNode, tagline: string | undefined, actions = ""): string {
  return `
    <header class="detail-head">
      <span class="detail-port" aria-hidden="true"></span>
      <div class="detail-titles">
        <h2 tabindex="-1">${esc(node.title)}</h2>
        ${tagline ? `<p class="detail-tagline">${esc(tagline)}</p>` : ""}
      </div>
      <div class="detail-actions">
        ${actions}
        <button type="button" class="btn detail-back">↑ Back to graph</button>
      </div>
    </header>`;
}

function renderProject(node: GraphNode): string {
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
        <iframe data-src="${esc(node.demoUrl)}" title="Live demo of ${esc(node.title)}"
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"></iframe>
      </div>`;
  } else if (node.screenshots?.length) {
    media = renderScreenshots(node);
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
      ${header(node, node.subtitle, links)}
      ${media}
      <div class="detail-body">
        <div class="detail-main">${main}</div>
        <aside class="detail-side">${glance}${stack}</aside>
      </div>
    </div>`;
}

/** One screenshot shown whole, or several as a carousel (wired up by wireCarousel). */
function renderScreenshots(node: GraphNode): string {
  const shots = node.screenshots!;
  const label = (i: number) => shots[i].caption ?? `Screenshot ${i + 1}`;
  const imgs = shots
    .map((s, i) => `<img src="${esc(s.src)}" alt="${esc(node.title)}: ${esc(label(i))}"${i === 0 ? "" : " hidden"} />`)
    .join("");
  if (shots.length === 1) return `<div class="media-frame media-shots">${imgs}</div>`;

  const dots = shots
    .map(
      (_, i) =>
        `<button type="button" class="carousel-dot" aria-label="Show ${esc(label(i))}"${i === 0 ? ' aria-current="true"' : ""}></button>`,
    )
    .join("");
  return `
    <div class="media-frame media-shots carousel" tabindex="0" aria-roledescription="carousel" aria-label="Screenshots of ${esc(node.title)}">
      <div class="media-bar">
        <span class="carousel-caption">${esc(label(0))}</span>
        <span class="carousel-count">1 / ${shots.length}</span>
      </div>
      <div class="carousel-stage">
        ${imgs}
        <button type="button" class="carousel-nav carousel-prev" aria-label="Previous screenshot">‹</button>
        <button type="button" class="carousel-nav carousel-next" aria-label="Next screenshot">›</button>
      </div>
      <div class="carousel-dots">${dots}</div>
    </div>`;
}

function wireCarousel(root: HTMLElement, captions: string[]) {
  const imgs = [...root.querySelectorAll<HTMLImageElement>(".carousel-stage img")];
  const dots = [...root.querySelectorAll<HTMLButtonElement>(".carousel-dot")];
  const caption = root.querySelector<HTMLElement>(".carousel-caption")!;
  const count = root.querySelector<HTMLElement>(".carousel-count")!;
  let index = 0;
  const go = (i: number) => {
    index = (i + imgs.length) % imgs.length;
    imgs.forEach((img, j) => (img.hidden = j !== index));
    dots.forEach((d, j) => (j === index ? d.setAttribute("aria-current", "true") : d.removeAttribute("aria-current")));
    caption.textContent = captions[index];
    count.textContent = `${index + 1} / ${imgs.length}`;
  };
  root.querySelector(".carousel-prev")!.addEventListener("click", () => go(index - 1));
  root.querySelector(".carousel-next")!.addEventListener("click", () => go(index + 1));
  dots.forEach((d, j) => d.addEventListener("click", () => go(j)));
  root.addEventListener("keydown", (ev) => {
    if (ev.key !== "ArrowLeft" && ev.key !== "ArrowRight") return;
    ev.preventDefault();
    go(index + (ev.key === "ArrowRight" ? 1 : -1));
  });
}

function renderContact(node: GraphNode): string {
  const links = node.links ?? [];
  const resume = links.find((l) => /resume/i.test(l.label));
  const rows = (node.fields ?? []).map((f) => {
    const link = links.find((l) => l.label.toLowerCase() === f.label.toLowerCase());
    const value = link
      ? `<a href="${esc(link.url)}" target="_blank" rel="noopener">${esc(f.value)} ↗</a>`
      : esc(f.value);
    return `<li><span class="field-label">${esc(f.label)}</span>${value}</li>`;
  });
  if (resume) {
    rows.push(
      `<li><span class="field-label">resume</span><a href="${esc(resume.url)}" target="_blank" rel="noopener">Open PDF ↗</a></li>`,
    );
  }

  const preview = resume
    ? `
      <div class="media-frame resume-frame">
        <div class="media-bar">
          <span>Résumé</span>
          <a href="${esc(resume.url)}" target="_blank" rel="noopener">Open in new tab ↗</a>
        </div>
        <iframe data-src="${esc(resume.url)}" title="Résumé"></iframe>
      </div>`
    : "";

  return `
    <div class="detail-inner">
      ${header(node, "Email, GitHub, LinkedIn, and my résumé")}
      <div class="contact-body">
        <div>
          <h3>Reach me</h3>
          <ul class="contact-list">${rows.join("")}</ul>
        </div>
        ${preview}
      </div>
    </div>`;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
