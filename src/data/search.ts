import type { Focus, GraphData } from "./types";

/**
 * Header search: finds the skills and projects that mention a term, the
 * way a recruiter would check a job req against the page ("Postgres",
 * "OAuth", "streaming"). Skill names and tags match anywhere in the word
 * ("script" finds TypeScript); prose (summary, highlights) matches at the
 * start of a word, so short terms don't hit the middle of unrelated ones.
 */
export function searchFocus(data: GraphData, query: string): Focus | null {
  const q = query.trim().toLowerCase();
  if (q.length < 2) return null;
  const wordStart = new RegExp(`(^|[^a-z0-9])${q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i");

  const you = data.nodes.find((n) => n.type === "you");
  const skills = (you?.attributes ?? []).filter((a) => a.label.toLowerCase().includes(q)).map((a) => a.id);

  const projects = data.nodes
    .filter((n) => n.type === "project")
    .filter((p) => {
      const names = [p.title, ...(p.tags ?? [])];
      const prose = [p.subtitle, p.summary, ...(p.cardHighlights ?? []), ...(p.highlights ?? [])];
      return names.some((s) => s.toLowerCase().includes(q)) || prose.some((s) => s && wordStart.test(s));
    })
    .map((p) => p.id);

  return { label: "Match", projects, skills, ranked: false };
}
