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
  "Google Sheets API": "tool",
};

interface ProjectSeed {
  id: string;
  title: string;
  tags: string[];
  /** One-line tagline shown on the graph card. */
  subtitle?: string;
  /** Up to ~3 short phrases shown on the graph card, under the tagline. */
  cardHighlights?: string[];
  summary?: string;
  highlights?: string[];
  links?: { label: string; url: string }[];
}

const projects: ProjectSeed[] = [
  {
    id: "gebo-ing",
    title: "gebo.ing",
    subtitle: "Universal wishlists & gift registries",
    cardHighlights: ["Web scraping (JSON-LD)", "Token-based access control", "Postgres + Prisma schema"],
    summary:
      "A store-agnostic wishlist and gift registry app: add items from any retailer, organize them into lists and event registries, and share them with friends and family.",
    highlights: [
      "Layered URL ingestion: JSON-LD/Schema.org product parsing, Open Graph tags, retailer-specific heuristics, and a headless fallback, plus a one-click bookmarklet.",
      "Spoiler protection: purchases are hashed so other gift-givers can see an item is claimed, while the list owner can't until the day after the occasion.",
      "Tokenized sharing for single lists or a whole registry, viewable without the recipient signing up.",
      "PostgreSQL (via Prisma) as the primary store, with automatic one-way backup sync to the user's own Google Sheets.",
    ],
    tags: ["TypeScript", "React", "NodeJS", "Express", "Postgres", "Prisma", "Google Sheets API"],
  },
  { id: "freyr-farm", title: "freyr.farm", tags: ["TypeScript", "JavaScript", "Python", "Postgres"] },
  { id: "pacemakr", title: "pacemakr.com", tags: ["JavaScript"] },
  {
    id: "smartsherpa",
    title: "smartsherpa.ai",
    tags: ["TypeScript", "React", "Python", "Java", "Spring Boot", "Langchain", "NodeJS", "FastAPI", "Postgres"],
  },
  {
    id: "staryteller",
    title: "staryteller.com",
    subtitle: "AI bedtime story app",
    cardHighlights: ["LLM streaming over SSE", "Offline-first LWW sync", "Skia GPU canvas rendering"],
    summary:
      "A mobile app that writes personalized bedtime stories with an LLM and adds each one as a star in a growing constellation to explore.",
    highlights: [
      "Stories stream from the OpenAI API to the app over Server-Sent Events, with moderation pre-checks and per-tier daily quotas.",
      "Interactive Skia constellation with Reanimated gestures; each star's position is derived from a hash of its story, with a repulsion pass to keep stars legible.",
      "Offline-first storage in WatermelonDB with last-write-wins sync to PostgreSQL.",
      "Spring Boot 3 API on GCP Cloud Run and Cloud SQL, with RevenueCat webhooks keeping subscription tiers in sync.",
    ],
    tags: ["TypeScript", "React Native", "Java", "Spring Boot", "Postgres", "OpenAI", "GCP"],
  },
  {
    id: "lukk-boksen",
    title: "Lukk Boksen",
    subtitle: "Multiplayer mobile dice game",
    cardHighlights: ["Serverless Sheets backend", "Forge2D rigid-body physics", "Subset-sum backtracking"],
    summary:
      "A Flutter take on the classic dice game Shut the Box, with physics-driven dice, shake-to-roll, and asynchronous multiplayer that runs without any server.",
    highlights: [
      "Serverless multiplayer on the Google Drive and Sheets APIs: Drive handles game discovery and sharing permissions, and each game is a spreadsheet with an append-only turn log.",
      "Round-by-round and self-paced game modes, with automatic sudden-death tiebreakers.",
      "2D rigid-body dice physics with Flame and Forge2D, rolled by shaking the phone.",
      "Finished games archive to each player's own Drive, and the last player to view the results cleans up the shared game file.",
    ],
    tags: ["Dart", "Flutter", "Riverpod", "Forge2D", "Google Sheets API", "Google Drive API"],
  },
  {
    id: "9t9-club",
    title: "9T9.club",
    subtitle: "Team performance & playbook platform",
    cardHighlights: ["Sigmoid rating model", "Real-time Firestore sync", "OAuth + Sheets API sync"],
    summary:
      "A multi-sport platform for high school and college programs that turns combine results into video-game-style 1–99 player ratings, alongside an interactive playbook and team tools.",
    highlights: [
      "Logistic S-curve rating engine that normalizes raw measurements (including lower-is-better tests like sprint times) into 1–99 metric, pillar, and overall ratings.",
      "Interactive 2D playbook editor built on Konva, with route drawing, snap-to-line-of-scrimmage placement, saved formations, and play animation.",
      "Real-time Firestore data layer with role-based access, so evaluations entered on the field update leaderboards and player profiles immediately.",
      "Two-way Google Sheets sync over OAuth so coaches can keep their existing spreadsheets, plus Gemini-generated scouting reports.",
    ],
    tags: ["TypeScript", "React", "Firebase", "Konva", "D3.js", "Google Sheets API", "Gemini"],
  },
  { id: "escapistball", title: "EscapistBall Analytics", tags: ["JavaScript", "Google App Script"] },
];

// Fill in later: name/title/pitch.
const you: GraphNode = {
  id: "you",
  type: "you",
  title: "BJ Bjostad",
  subtitle: "Software Engineer",
  summary:
    "10+ years in enterprise software, from Tableau's platform to co-founding an agentic AI startup, now designing and shipping full-stack products end to end.",
  photo: "/you.jpg", // placeholder headshot — swap for a real one later
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
    { label: "email", value: "bjostad@gmail.com" },
    { label: "github", value: "github.com/bjostad" },
    { label: "linkedin", value: "linkedin.com/in/bjostad" },
  ],
  links: [
    { label: "Email", url: "mailto:bjostad@gmail.com" },
    { label: "GitHub", url: "https://github.com/bjostad" },
    { label: "LinkedIn", url: "https://linkedin.com/in/bjostad" },
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
      subtitle: p.subtitle,
      cardHighlights: p.cardHighlights,
      summary: p.summary,
      highlights: p.highlights,
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
