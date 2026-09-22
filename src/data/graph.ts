import type { GraphAttribute, GraphData, GraphEdge, GraphNode, SkillCategory } from "./types";

/**
 * ---------------------------------------------------------------------
 * EDIT ME: this is the only file you should need to touch to update
 * content. Add a project, tweak your bio, add an experience entry —
 * the graph (including which skills become attributes of "you") rebuilds
 * itself from what's below.
 * ---------------------------------------------------------------------
 */

/** Known category for each skill, used only for the small type-badge accent. */
const SKILL_CATEGORY: Record<string, SkillCategory> = {
  TypeScript: "language",
  JavaScript: "language",
  Python: "language",
  Java: "language",
  Kotlin: "language",
  Dart: "language",
  Postgres: "database",
  Firebase: "database",
  NodeJS: "platform",
  "Spring Boot": "framework",
  React: "framework",
  Flutter: "framework",
  FastAPI: "framework",
  Langchain: "framework",
  "Google App Script": "tool",
};

interface ProjectSeed {
  id: string;
  title: string;
  tags: string[];
  // TODO — fill these in later:
  summary?: string;
  links?: { label: string; url: string }[];
}

const projects: ProjectSeed[] = [
  { id: "gebo-ing", title: "gebo.ing", tags: ["TypeScript", "JavaScript", "NodeJS", "Postgres"] },
  { id: "freyr-farm", title: "freyr.farm", tags: ["TypeScript", "JavaScript", "Python", "Postgres"] },
  { id: "pacemakr", title: "pacemakr.com", tags: ["JavaScript"] },
  {
    id: "smartsherpa",
    title: "smartsherpa.ai",
    tags: ["TypeScript", "React", "Python", "Java", "Spring Boot", "Langchain", "NodeJS", "FastAPI", "Postgres"],
  },
  { id: "staryteller", title: "staryteller.com", tags: ["Java", "Kotlin", "TypeScript", "Spring Boot", "Postgres"] },
  { id: "lukk-boksen", title: "Lukk Boksen", tags: ["Dart", "Google App Script", "Flutter"] },
  { id: "9t9-club", title: "9T9.club", tags: ["TypeScript", "Firebase"] },
  { id: "escapistball", title: "EscapistBall Analytics", tags: ["JavaScript", "Google App Script"] },
];

// Fill in later: name/title/pitch, and swap in a real photo path (e.g. "/you.jpg").
const you: GraphNode = {
  id: "you",
  type: "you",
  title: "Your Name",
  subtitle: "Software Engineer",
  summary: "One line about what you build and care about.",
  photo: undefined,
  position: { x: 0, y: 0 },
};

// Fill in later: real roles. Each can optionally list which project ids
// were built during that role via `relatedProjectIds` below.
interface ExperienceSeed {
  id: string;
  title: string;
  company: string;
  dates: string;
  summary?: string;
  relatedProjectIds?: string[];
}

const experience: ExperienceSeed[] = [
  // { id: "exp-1", title: "Senior Engineer", company: "Company", dates: "2023–Present", summary: "…", relatedProjectIds: ["gebo-ing"] },
];

const contact: GraphNode = {
  id: "contact",
  type: "contact",
  title: "Contact & Resume",
  fields: [
    { label: "email", value: "you@bjostad.dev" },
    { label: "github", value: "github.com/yourhandle" },
    { label: "linkedin", value: "linkedin.com/in/yourhandle" },
  ],
  links: [
    { label: "Email", url: "mailto:you@bjostad.dev" },
    { label: "GitHub", url: "https://github.com/yourhandle" },
    { label: "LinkedIn", url: "https://linkedin.com/in/yourhandle" },
    { label: "Resume (PDF)", url: "/resume.pdf" },
  ],
  position: { x: 0.85, y: 0.7 },
};

/** Promotion rule: a skill becomes an attribute of "you" once it's used by 2+ projects. */
function buildAttributesAndEdges(): { attributes: GraphAttribute[]; edges: GraphEdge[] } {
  const counts = new Map<string, string[]>();
  for (const p of projects) {
    for (const tag of p.tags) {
      const list = counts.get(tag) ?? [];
      list.push(p.id);
      counts.set(tag, list);
    }
  }

  const attributes: GraphAttribute[] = [];
  const edges: GraphEdge[] = [];

  for (const [skill, projectIds] of counts) {
    if (projectIds.length < 2) continue; // stays a tag, not an attribute
    const id = `skill-${slug(skill)}`;
    attributes.push({ id, label: skill, category: SKILL_CATEGORY[skill] });
    for (const pid of projectIds) {
      edges.push({ from: id, to: pid, kind: "built-with" });
    }
  }

  return { attributes, edges };
}

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export function buildGraph(): GraphData {
  const { attributes, edges: attributeEdges } = buildAttributesAndEdges();
  const nodes: GraphNode[] = [{ ...you, attributes }, contact];
  const edges: GraphEdge[] = [{ from: "you", to: "contact", kind: "related" }];

  for (const p of projects) {
    nodes.push({
      id: p.id,
      type: "project",
      title: p.title,
      summary: p.summary,
      tags: p.tags,
      links: p.links,
    });
  }

  for (const e of experience) {
    nodes.push({
      id: e.id,
      type: "experience",
      title: e.title,
      subtitle: e.company,
      fields: [
        { label: "company", value: e.company },
        { label: "dates", value: e.dates },
      ],
      summary: e.summary,
    });
    edges.push({ from: "you", to: e.id, kind: "worked-at" });
    for (const pid of e.relatedProjectIds ?? []) {
      edges.push({ from: e.id, to: pid, kind: "worked-at" });
    }
  }

  edges.push(...attributeEdges);

  // Relationship is You (via its attributes) -> Project. A project
  // reaches "you" only through a shared skill attribute or an experience
  // entry; if none of its tags were ever used by a second project (so it
  // has no attribute) and it's not tied to an experience entry, fall back
  // to a direct edge so it doesn't end up disconnected from the graph.
  const reachable = new Set(edges.map((e) => e.to));
  for (const p of projects) {
    if (!reachable.has(p.id)) {
      edges.push({ from: "you", to: p.id, kind: "related" });
    }
  }

  return { nodes, edges };
}
