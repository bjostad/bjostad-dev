import type { GraphNode } from "../data/types";

export class DetailPanel {
  private el: HTMLElement;
  private content: HTMLElement;

  constructor(root: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "detail-panel";
    this.el.setAttribute("role", "dialog");
    this.el.setAttribute("aria-modal", "false");
    this.el.hidden = true;

    const closeBtn = document.createElement("button");
    closeBtn.className = "detail-close";
    closeBtn.type = "button";
    closeBtn.setAttribute("aria-label", "Close details");
    closeBtn.textContent = "×";
    closeBtn.addEventListener("click", () => this.close());
    this.el.appendChild(closeBtn);

    this.content = document.createElement("div");
    this.content.className = "detail-content";
    this.el.appendChild(this.content);

    root.appendChild(this.el);

    document.addEventListener("keydown", (ev) => {
      if (ev.key === "Escape") this.close();
    });
  }

  open(node: GraphNode) {
    this.content.innerHTML = this.render(node);
    this.el.hidden = false;
    this.el.classList.add("open");
  }

  close() {
    this.el.classList.remove("open");
    this.el.hidden = true;
  }

  private render(node: GraphNode): string {
    const parts: string[] = [];
    parts.push(`<h2>${esc(node.title)}</h2>`);
    if (node.subtitle) parts.push(`<p class="detail-subtitle">${esc(node.subtitle)}</p>`);
    if (node.summary) parts.push(`<p class="detail-summary">${esc(node.summary)}</p>`);
    if (node.highlights?.length) {
      parts.push(`<ul class="detail-highlights">${node.highlights.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>`);
    }

    // A field whose label matches a link's label (e.g. "email" / "Email")
    // renders its value as that link instead of plain text, so the
    // separate links list below doesn't have to repeat it.
    const linkedLabels = new Set<string>();
    if (node.fields?.length) {
      parts.push('<dl class="detail-fields">');
      for (const f of node.fields) {
        const match = node.links?.find((l) => l.label.toLowerCase() === f.label.toLowerCase());
        if (match) linkedLabels.add(match.label.toLowerCase());
        const value = match ? `<a href="${esc(match.url)}" target="_blank" rel="noopener">${esc(f.value)}</a>` : esc(f.value);
        parts.push(`<dt>${esc(f.label)}</dt><dd>${value}</dd>`);
      }
      parts.push("</dl>");
    }

    if (node.tags?.length) {
      parts.push('<div class="detail-tags">');
      for (const t of node.tags) parts.push(`<span class="tag">${esc(t)}</span>`);
      parts.push("</div>");
    }

    // Resume gets a special in-pane preview alongside the download link.
    const resumeLink = node.links?.find((l) => /resume/i.test(l.label));
    if (node.type === "contact" && resumeLink) {
      parts.push(`
        <div class="resume-preview">
          <iframe src="${esc(resumeLink.url)}" title="Résumé preview" loading="lazy"></iframe>
        </div>`);
    }

    const remainingLinks = node.links?.filter((l) => !linkedLabels.has(l.label.toLowerCase())) ?? [];
    if (remainingLinks.length) {
      parts.push('<div class="detail-links">');
      for (const l of remainingLinks) {
        const download = /resume/i.test(l.label) ? " download" : "";
        parts.push(`<a href="${esc(l.url)}" target="_blank" rel="noopener"${download}>${esc(l.label)}</a>`);
      }
      parts.push("</div>");
    }

    return parts.join("\n");
  }
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
