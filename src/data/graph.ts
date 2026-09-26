import type { GraphAttribute, GraphData, GraphEdge, GraphNode, Screenshot, SkillCategory } from "./types";

/**
 * ---------------------------------------------------------------------
 * EDIT ME: this is the only file you should need to touch to update
 * content. Add a project, tweak your bio, add an experience entry —
 * the graph (including which skills become attributes of "you") rebuilds
 * itself from what's below.
 * ---------------------------------------------------------------------
 */

/** Each skill's type — sets its badge, its line color, and its row group on the card. */
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
  GCP: "platform",
  "Spring Boot": "framework",
  React: "framework",
  "React Native": "framework",
  Flutter: "framework",
  FastAPI: "framework",
  Express: "framework",
  Langchain: "framework",
  Vite: "tool",
  OpenAI: "tool",
  Gemini: "tool",
  "Google App Script": "tool",
  "Google Sheets API": "tool",
  Konva: "framework",
};

/**
 * Skills worth listing on your card even when only one project uses them —
 * the ones a recruiter scans for. Anything else used by a single project
 * stays a tag on that project (shown in its detail section).
 */
const FEATURED_SKILLS = new Set([
  "Python",
  "JavaScript",
  "React Native",
  "Flutter",
  "Dart",
  "Firebase",
  "GCP",
  "OpenAI",
  "Gemini",
  "Langchain",
  "FastAPI",
  "Express",
]);

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
  /** Shown in the project's detail section — label them e.g. "Live site", "Source". */
  links?: { label: string; url: string }[];
  /** A URL to embed as a live demo in the detail section. Only works for
   * sites that allow being framed; otherwise use `screenshots` instead. */
  demoUrl?: string;
  /** Images in /public shown in the detail section; more than one becomes a carousel. */
  screenshots?: Screenshot[];
}

const projects: ProjectSeed[] = [
  // Listed in display order: left to right on the graph, strongest first.
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
      "Spring Boot 3 relays OpenAI's streaming completions to the React Native client over Server-Sent Events (SseEmitter to react-native-sse), gated by a Moderation API pre-check and atomic per-day quota counters.",
      "Deterministic layout: a SHA-256 hash of each story's text maps to 2D coordinates, then an iterative repulsion pass resolves collisions between stars.",
      "GPU-rendered Skia canvas driven by Reanimated worklets for gestures and off-screen edge indicators, plus a headless off-screen Skia surface for full-resolution image export.",
      "Offline-first WatermelonDB (SQLite over JSI) with client-generated UUIDs and last-write-wins sync to PostgreSQL; containerized on Cloud Run with Cloud SQL, Secret Manager, and Cloud Build CI/CD.",
    ],
    tags: ["TypeScript", "React Native", "Java", "Spring Boot", "Postgres", "OpenAI", "GCP"],
  },
  {
    id: "9t9-club",
    title: "9T9.club",
    subtitle: "Team performance & playbook platform",
    cardHighlights: ["Sigmoid rating model", "Real-time Firestore sync", "OAuth + Sheets API sync"],
    summary:
      "A multi-sport platform for high school and college programs that turns combine results into video-game-style 1–99 player ratings, alongside an interactive playbook and team tools.",
    highlights: [
      "Rating engine normalizes each metric against a configurable floor, ceiling, and direction, then maps it through a logistic S-curve (k = 6, x₀ = 0.35) into weighted 1–99 pillar and overall ratings.",
      "Konva / React-Konva scene graph for the playbook editor, with custom hit-testing and snap-to-line-of-scrimmage geometry rather than DOM rendering.",
      "Firestore data model with real-time onSnapshot listeners and role-based access (head coach, assistant, player, admin) driving live leaderboard recalculation.",
      "Two-way Google Sheets v4 sync over scoped OAuth (batch imports, batchUpdate exports), plus structured Gemini (@google/genai) prompts over evaluation data.",
    ],
    tags: ["TypeScript", "React", "Firebase", "Konva", "D3.js", "Google Sheets API", "Gemini"],
    screenshots: [
      { src: "/screenshots/9t9-playbook.webp", caption: "Playbook Editor" },
      { src: "/screenshots/9t9-clubhouse.webp", caption: "Clubhouse Roster" },
      { src: "/screenshots/9t9-evals.webp", caption: "Performance Evaluations" },
      { src: "/screenshots/9t9-office.webp", caption: "Coach's Office" },
      { src: "/screenshots/9t9-binder.webp", caption: "Binder" },
      { src: "/screenshots/9t9-login.webp", caption: "Sign In" },
    ],
  },
  {
    id: "gebo-ing",
    title: "gebo.ing",
    subtitle: "Universal wishlists & gift registries",
    cardHighlights: ["Web scraping (JSON-LD)", "Token-based access control", "Postgres + Prisma schema"],
    summary:
      "A store-agnostic wishlist and gift registry app: add items from any retailer, organize them into lists and event registries, and share them with friends and family.",
    highlights: [
      "Multi-tier scraper: server-side Cheerio parsing of JSON-LD (Schema.org Product) and Open Graph metadata, retailer-specific extraction rules, browser-header emulation, and failover to the Microlink API when a store blocks the direct fetch.",
      "Buyer identity stored as a SHA-256 hash, with server-side date logic that strips purchase state from the owner's API responses until the day after their occasion.",
      "Relational PostgreSQL schema via Prisma with cascading relations across lists, items, categories, and shares; UUID tokens grant access without an account.",
      "Non-blocking one-way sync into the user's own Google Drive and Sheets (Drive v3, Sheets v4) over Google OAuth.",
    ],
    tags: ["TypeScript", "React", "NodeJS", "Express", "Postgres", "Prisma", "Google Sheets API"],
    demoUrl: "https://gebo.ing",
  },
  {
    id: "freyr-farm",
    title: "freyr.farm",
    subtitle: "Precision irrigation & garden planning",
    cardHighlights: ["Multi-module Spring Boot API", "Physics-based watering model", "Fail-safe IoT valve control"],
    summary:
      "A multi-tenant smart irrigation platform that replaces fixed sprinkler timers with watering decisions computed from soil physics, crop needs, and local weather forecasts, then drives the valves directly.",
    highlights: [
      "Java 21 / Spring Boot 3.3 backend split into core, api, weather, and hardware modules with one-way dependencies; stateless JWT auth and organization-scoped multi-tenancy with OWNER / MEMBER / VIEWER roles over PostgreSQL 16 and Flyway migrations.",
      "Watering engine models root-zone volume and available water capacity per soil texture, projects moisture with FAO-56 Penman-Monteith crop evapotranspiration (ET₀ × Kc) and 36-hour NWS rainfall infiltration, and skips cycles the forecast will cover.",
      "Every recommendation is stored as a step-by-step reasoning trail (current moisture, projected ET, effective rain, deficit in gallons, runtime from summed emitter flow), so each automated decision is auditable.",
      "Hardware-agnostic relay layer over REST and MQTT for ESP32, Shelly, and Raspberry Pi: each valve command carries a max runtime the device enforces locally, zones on a shared line are mutually excluded, and out-of-range probe readings fall back to ET-only modeling.",
      "To-scale react-konva bed designer with emitter coverage circles, and a per-plant heatmap that maps each crop's deviation from its moisture band through piecewise RGB interpolation.",
    ],
    tags: ["TypeScript", "React", "Vite", "Konva", "Java", "Spring Boot", "Postgres", "MQTT"],
    screenshots: [
      { src: "/screenshots/freyr-bed-designer.webp", caption: "Bed Designer" },
      { src: "/screenshots/freyr-garden-map.webp", caption: "Garden Map & Condition Heatmap" },
      { src: "/screenshots/freyr-dashboard.webp", caption: "Garden Dashboard" },
    ],
  },
  {
    id: "lukk-boksen",
    title: "Lukk Boksen",
    subtitle: "Multiplayer mobile dice game",
    cardHighlights: ["Serverless Sheets backend", "Forge2D rigid-body physics", "Subset-sum backtracking"],
    summary:
      "A Flutter take on the classic dice game Shut the Box, with physics-driven dice, shake-to-roll, and asynchronous multiplayer that runs without any server.",
    highlights: [
      "Zero-infrastructure backend: Drive's files API serves as lobby and service discovery, and each game is a spreadsheet with game-state, participant, and append-only turn-log tabs.",
      "Least-privilege OAuth (drive.file scope) through a custom http.BaseClient that injects bearer tokens into googleapis requests; Drive ACLs grant opponents write access.",
      "Flame + Forge2D rigid-body dice triggered by accelerometer shake detection (acceleration-magnitude threshold), with settle detection before the turn resolves.",
      "Bust detection solves subset-sum with recursive backtracking; the last player to view the results deletes the shared game file, a distributed cleanup with no server.",
    ],
    tags: ["Dart", "Flutter", "Riverpod", "Forge2D", "Google Sheets API", "Google Drive API"],
  },
  {
    id: "pacemakr",
    title: "pacemakr.com",
    subtitle: "BPM-based Spotify workout playlists",
    cardHighlights: ["Spotify Web API integration", "Tempo-based track search", "React + Express full stack"],
    summary:
      "A Spotify playlist generator that builds a playlist from any sequence of BPM segments over any length of time: say 10 minutes of high BPM, a 3-minute low-BPM break, then a ramp back up, shaped to fit a workout, run, or ride.",
    highlights: [
      "React + Vite client in TypeScript with an Express / Node.js server between it and the Spotify Web API.",
      "Track discovery seeded by tempo: a target BPM combined with seed tracks, artists, and genres.",
      "Now runs on mock data after Spotify's February 2026 API changes cut off the endpoints it relied on.",
    ],
    tags: ["TypeScript", "React", "Vite", "NodeJS", "Express"],
    demoUrl: "https://pacemakr.com",
  },
  {
    id: "escapistball",
    title: "EscapistBall Analytics",
    subtitle: "Fantasy baseball league analytics",
    cardHighlights: ["Apps Script JSON backend", "Recharts data visualization", "Score-ceiling analysis"],
    summary:
      "An analytics dashboard for a private fantasy baseball league (\"It's like Moneyball, but with less money\"): season trends, head-to-head matchups, team profiles, and league leaders across every scoring category.",
    highlights: [
      "Serverless backend: a Google Apps Script web app exposes the league's data as JSON to a React + Vite single-page app.",
      "Score Ceiling figures (each team's weekly maximum per stat) are generated on the backend and plotted against actuals.",
      "Direction-aware ranking: lower-is-better categories like ERA and WHIP sort ascending, and rate stats keep three-decimal precision.",
      "Recharts views built on memoized data transforms and custom tooltips, with series highlight on hover and pin on click.",
    ],
    tags: ["JavaScript", "React", "Vite", "Recharts", "Google App Script"],
    screenshots: [
      { src: "/screenshots/escapistball-overview.webp", caption: "League Overview" },
      { src: "/screenshots/escapistball-profiles.webp", caption: "Team Profiles" },
      { src: "/screenshots/escapistball-matchups.webp", caption: "Matchups Explorer" },
    ],
  },
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

/** Promotion rule: a skill becomes an attribute of "you" once it's used by
 * 2+ projects, or if it's in FEATURED_SKILLS. */
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
    if (projectIds.length < 2 && !FEATURED_SKILLS.has(skill)) continue; // stays a tag, not an attribute
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
      demoUrl: p.demoUrl,
      screenshots: p.screenshots,
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
