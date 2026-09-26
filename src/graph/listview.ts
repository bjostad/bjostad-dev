import type { Focus, GraphData } from "../data/types";
import { statusLineHtml } from "./canvas";

/** With a focus, its projects move to the top in its order, marked, and
 * the rest follow in their usual order. */
export function renderListView(root: HTMLElement, data: GraphData, focus: Focus | null = null) {
  const you = data.nodes.find((n) => n.type === "you");
  const rank = new Map((focus?.projects ?? []).map((id, i) => [id, i]));
  const projects = data.nodes
    .filter((n) => n.type === "project")
    .sort((a, b) => (rank.get(a.id) ?? Infinity) - (rank.get(b.id) ?? Infinity));
  const experience = data.nodes.filter((n) => n.type === "experience");
  const contact = data.nodes.find((n) => n.type === "contact");

  root.innerHTML = "";
  root.classList.add("list-view");

  if (you) {
    const header = document.createElement("header");
    header.className = "list-you";
    header.innerHTML = `<h1>${esc(you.title)}</h1>${statusLineHtml(you.status, esc)}${you.subtitle ? `<p>${esc(you.subtitle)}</p>` : ""}${
      you.summary ? `<p>${esc(you.summary)}</p>` : ""
    }`;
    root.appendChild(header);
  }

  if (experience.length) {
    root.appendChild(section("Experience", experience.map((e) => `
      <li>
        <strong>${esc(e.title)}</strong>${e.subtitle ? ` — ${esc(e.subtitle)}` : ""}
        ${e.summary ? `<p>${esc(e.summary)}</p>` : ""}
      </li>`).join("")));
  }

  if (projects.length) {
    root.appendChild(section("Projects", projects.map((p) => `
      <li${focus && !rank.has(p.id) ? ` class="list-muted"` : ""}>
        ${focus && rank.has(p.id) ? `<span class="list-rank">${focus.ranked ? `#${rank.get(p.id)! + 1} ` : ""}${esc(focus.label)}</span>` : ""}
        <strong>${esc(p.title)}</strong>${p.subtitle ? ` — ${esc(p.subtitle)}` : ""}
        ${p.summary ? `<p>${esc(p.summary)}</p>` : ""}
        ${p.highlights?.length ? `<ul class="list-highlights">${p.highlights.map((h) => `<li>${esc(h)}</li>`).join("")}</ul>` : ""}
        ${p.tags?.length ? `<p class="list-tags">${p.tags.map(esc).join(", ")}</p>` : ""}
        ${(p.links ?? []).map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`).join(" · ")}
      </li>`).join("")));
  }

  if (contact) {
    const links = (contact.links ?? [])
      .map((l) => `<a href="${esc(l.url)}" target="_blank" rel="noopener">${esc(l.label)}</a>`)
      .join(" · ");
    root.appendChild(section("Contact", `<li>${links}</li>`));
  }
}

function section(title: string, itemsHtml: string): HTMLElement {
  const s = document.createElement("section");
  s.innerHTML = `<h2>${esc(title)}</h2><ul>${itemsHtml}</ul>`;
  return s;
}

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
