# bjostad.dev — Design Doc

**A portfolio site as a living domain model.** Recruiters and visitors explore your work the way you'd sketch a system on a whiteboard: entities (Projects, Experience, You) connected by crow's-foot relationships, rendered as a dark blueprint canvas, draggable and alive.

---

## 1. Concept & Goals

**Core idea:** Instead of a scrolling list of sections, the site *is* a diagram — the kind of entity-relationship / domain model a backend engineer would actually draw to describe a system, complete with crow's-foot cardinality marks on every connector. "You" are the root entity, with your shared skills as field rows on your own card (see §3). Projects, Experience, and Contact are related entities, connected by lines like foreign keys. Every node is draggable, so the visitor can rearrange the model — which doubles as a memorable, portfolio-appropriate proof of frontend skill.

**Primary goals**
- Give recruiters a fast, credible read on who you are and what you've built (this must work even for someone who never touches a node).
- Signal technical craft through the interaction itself — the medium is part of the message.
- Be fast, cheap to host, and easy to update as projects change.

**Audience:** Recruiters and hiring managers (skimming, 30–90 seconds), and technically curious peers (who will drag things around and poke at internals).

**Non-goals:** This isn't a blog or CMS-driven site. Content changes happen by editing a data file, not through an admin panel — at least for v1.

---

## 2. Visual Design Language

### Palette
Dark blueprint, not generic "dark mode." Named tokens:

| Token | Hex | Use |
|---|---|---|
| `--bg-base` | `#070B14` | Page background |
| `--bg-panel` | `#0D1526` | Node fill / cards |
| `--grid-dot` | `#1B2A47` | Background dot grid |
| `--line-edge` | `#2E4368` | Connector lines between nodes |
| `--accent-primary` | `#3D8BFF` | Active node border, primary links |
| `--accent-secondary` | `#6FE3C4` | Secondary highlight (e.g. hovered edge, tags) |
| `--text-primary` | `#E7EDF7` | Headings, node titles |
| `--text-muted` | `#7C8AA8` | Body copy, field labels |

Blueprint cue: hairline `1px` strokes, node corners slightly cut or square (not soft SaaS-card rounding), connector lines drawn as orthogonal or gently curved paths like ER-diagram relationship lines, with small relationship markers (crow's-foot or simple dot) at connection points.

### Background
A dot grid, not a line grid — subtler, more "blueprint paper" than "graph paper." Implementation: CSS `radial-gradient` repeating pattern, ~24px spacing, dot color `--grid-dot` at low opacity over `--bg-base`. Optionally a very slow parallax drift on pan/zoom to reinforce depth.

### Typography
- **Display/headings:** a geometric or technical monospace-adjacent sans (e.g. *IBM Plex Sans* paired with *IBM Plex Mono* for labels/field names) — reinforces the "schema" feel without resorting to generic all-caps eyebrows.
- **Body:** the same sans, muted color, restrained size (keep node detail copy short — this is a diagram, not a document).
- Avoid the generic tells: no tracked-out all-caps labels, no accent-one-word-in-a-headline, no arrow-suffixed CTAs.

### Motion
One deliberate load sequence: nodes and edges draw themselves in (a brief "system boot" moment — lines extending, nodes fading up), then stillness. After that, motion only responds to the user: drag, hover-highlight of connected edges, click-to-expand.

---

## 3. Interaction Model — the Domain Model Canvas

### Entities (nodes)
- **You** (root/center) — name, title, one-line pitch, headshot, plus a list of **skill attribute rows** (promoted only when shared — see below). Node is designed to work identically with or without the photo (see below).
- **Project** (eight, final list below) — name, one-line summary, tech tags, links (live/repo).
- **Experience** (repeated, one per role) — company, title, dates, one-line impact.
- **Contact** — email, LinkedIn, GitHub, and resume (PDF download + detail pane — see §3).

Skills are deliberately *not* their own node tier. In a real ER diagram a
one-to-many relationship where the "one" side has no other facts worth
modeling is a field on the entity, not a separate table — that's exactly the
shape of "You know TypeScript, and TypeScript connects to five projects," so
each promoted skill renders as a field row directly on the You card, and its
crow's-foot connectors run straight from that row to the projects that use
it. See "Skill attributes" below.

**Final project list**
- `gebo.ing` — TypeScript, JavaScript, NodeJS, Postgres
- `freyr.farm` — TypeScript, JavaScript, Python, Postgres
- `pacemakr.com` — JavaScript
- `smartsherpa.ai` — TypeScript, React, Python, Java, Spring Boot, Langchain, NodeJS, FastAPI, Postgres
- `staryteller.com` — Java, Kotlin, TypeScript, Spring Boot, Postgres
- `Lukk Boksen` — Dart, Google App Script, Flutter
- `9T9.club` — TypeScript, Firebase
- `EscapistBall Analytics` — JavaScript, Google App Script

Each becomes one Project node. Fill in `summary` and `links` per project in the data file (§5) — the tech stack above becomes each project's `tags`, one-line summary keeps the node card compact and scannable.

**Skill attributes — promote only what's shared**
This is the key modeling rule: a skill becomes a field row on the You card *only* when two or more projects use it — that's a real relationship (Skill ↔ Project) worth drawing, the same reason you'd pull a column out and give it its own connector in an actual schema diagram rather than repeating the value on every row. A skill used by exactly one project stays a plain tag on that project's card; promoting it would add a connector for no relational reason and just clutter the canvas.

Running the numbers on the current stack list, these are shared and become **skill attribute rows** on the You card:

| Skill | Projects |
|---|---|
| TypeScript | gebo.ing, freyr.farm, smartsherpa.ai, staryteller.com, 9T9.club |
| JavaScript | gebo.ing, freyr.farm, pacemakr.com, EscapistBall Analytics |
| Postgres | gebo.ing, freyr.farm, smartsherpa.ai, staryteller.com |
| Java | smartsherpa.ai, staryteller.com |
| Spring Boot | smartsherpa.ai, staryteller.com |
| NodeJS | gebo.ing, smartsherpa.ai |
| Python | freyr.farm, smartsherpa.ai |
| Google App Script | Lukk Boksen, EscapistBall Analytics |

Everything else (React, Langchain, FastAPI, Kotlin, Dart, Flutter, Firebase) currently appears on exactly one project, so it stays a tag, not an attribute — worth revisiting each time you add a project, since a second use promotes it.

That's 8 attribute rows at present, each fanning out to 2–5 projects — enough that the graph needs the density handling described under Behavior below (edges rendered at low opacity until interacted with, each attribute's lines drawn in its own color so overlapping connectors stay distinguishable) rather than every edge shouting equally on load. Clicking an attribute row highlights just its own connectors and the projects at the other end — hovering any other node does the same, but a click *pins* the highlight so it survives moving the mouse away.

**On categories (Frontend / Backend / REST API / CRUD API, etc.):** don't make these separate nodes or attributes. They're architectural *roles*, not concrete things you used — adding them as a tier mixes two different kinds of fact (what you built with vs. how it's classified) and breaks the "this is a real schema" conceit, since "Frontend" isn't an entity with its own identity the way "Java" or "gebo.ing" is. Instead, give each skill attribute a `category` field (`language` | `framework` | `database` | `platform` | `tool`) and use it purely for a visual cue — a small type badge next to the attribute row, like a column's type annotation in a real schema diagram. You get the categorical grouping visually without inventing entities that don't exist. If you later want more, a `role` tag (e.g. "backend," "infra") on the Project node itself is more honest than a role-shaped node — it describes what the project *is*, not a new thing you built.

**You node — with/without headshot**
Build the node so the photo is an enhancement, not a dependency:
- Layout: circular/square-cropped photo slot inline with (not stacked awkwardly above) the name/title block, so removing it just closes a gap rather than leaving dead space.
- No-photo state: the slot collapses to a small glyph-mark instead — e.g. your initials in monospace inside a thin bordered square, styled consistent with the blueprint aesthetic (like a schema diagram's "PK" corner marker). This keeps the node visually anchored even with no image loaded, and doubles as a graceful loading/error state.
- Keep the photo desaturated or lightly duotoned toward the blue palette (`--bg-panel`/`--accent-primary`) rather than a full-color photo dropped on the dark canvas — keeps it from feeling like a stock headshot bolted onto a diagram.

Each node renders like a compact schema card: a title bar, then a few "fields" (key facts) — literally borrowing ER-diagram visual grammar (field name in muted mono, value in primary text).

### Relationships (edges)
Drawn as **crow's-foot ER connectors** between related nodes — a right-angle path (leave the dead center of the box's facing edge, run past the row, turn, cross, turn, arrive at the dead center of the destination's facing edge) with a cardinality mark at each end: a single tick for the "one" side, a three-pronged crow's foot for the "many" side. You↔Contact is the one 1:1 relationship and gets a tick at both ends; everything else is 1:many.

The two relationship *kinds* get distinct treatments so the graph reads as two overlapping systems rather than one tangle:
- **Experience edges** (`You → Experience → Project`, chronological/where-built) — solid line, `--accent-primary`.
- **Attribute edges** (skill row → Project, categorical/what-built-with) — dashed, each attribute drawn in its own hue (golden-angle hue spacing keeps any number of attributes visually distinct) so a viewer can tell "this connects because of when" from "this connects because of what," and one skill's lines from another's, at a glance.

### Behavior
- **Drag:** every node is freely draggable; position persists for the session (and optionally to `localStorage` so a rearranged layout survives a reload).
- **Default layout:** a hand-tuned top-to-bottom hierarchy — You at top, Experience below it, Projects at the bottom, Contact fixed beside You — with a light staggering and crossing-reduction pass so rows read as an organized cluster rather than a rigid grid or a random tangle.
- **Click/tap a node:** expands it — a detail panel or in-place growth showing full project description, links, images. The **Contact/Resume node** follows the same pattern: click opens a detail pane with an embedded/preview of the résumé plus a **Download PDF** button — so a recruiter can either skim it in-pane or grab the file, without leaving the canvas. **Click an attribute row** instead: it pins a highlight on that skill's connections (see below) rather than opening a panel, since an attribute isn't its own entity with detail to show.
- **Hover a node (or attribute row):** highlights its direct edges and dims unrelated ones, so relationships are legible even in a dense graph. A click on an attribute row does the same but *pins* it, so the highlight survives moving the mouse away — a more deliberate action than a hover, for tracing one skill's footprint at a glance.
- **Reset view:** a quiet "reset layout" control, since users can drag things into unreadable positions.
- **Zoom/pan:** optional but recommended once node count grows — treat the canvas like a whiteboard, not a fixed frame.

### Accessibility / fallback
The graph is the showcase, not the only path to the content. Provide:
- A visually-hidden or toggleable **plain list view** (semantic HTML, real links) covering the same content, for screen readers, keyboard-only users, and recruiters who just want to scan fast.
- Keyboard focus order and `aria-label`s on nodes even in graph mode.
- Respect `prefers-reduced-motion` (skip the boot animation, disable inertia/physics).

---

## 4. Site Structure

For v1, this is likely a **single page** (the canvas *is* the site), with:
- A minimal header: your name/mark, a "list view" toggle, a resume download / contact CTA.
- The canvas as the main viewport.
- Optional `/resume` static route serving a PDF, and a plain `/projects/[slug]` fallback page per project for SEO/shareable links (a graph node isn't a URL a recruiter can paste into an email).

```
 ┌───────────────────────────────────────────────────┐
 │  bjostad.dev              [List view]  [Resume]   │
 ├───────────────────────────────────────────────────┤
 │   · · · · · · · · · · · · · · · · · · · · · ·     │
 │  ·                                             ·   │
 │ ·   ┌──────────────────┐      ┌────────────┐  ·  │
 │ ·   │  YOU              │──────│  Contact   │  ·  │
 │ ·   │  ─ TypeScript ─┐   │      └────────────┘  ·  │
 │ ·   │  ─ Java ───────┼─┐ │                        ·│
 │ ·   │  ─ Postgres ───┤ │ │                        ·│
 │ ·   └──────────────────┘ │                        ·│
 │  ·         │    ╲        │                     ·   │
 │ ·          ▼     ▼       ▼                    ·   │
 │  ·   [Project] [Project] [Project]  ...    ·      │
 │   · · · · · · · · · · · · · · · · · · · · ·      │
 └───────────────────────────────────────────────────┘
   solid+tick/foot = experience edge (You→Exp→Project)
   dashed+tick/foot, one color per row = attribute edge
```

---

## 5. Content / Data Model

Keep content in one typed data file so adding a project is a data edit, not a design edit:

```ts
// content/graph.ts
type NodeType = "you" | "project" | "experience" | "contact";

type SkillCategory = "language" | "framework" | "database" | "platform" | "tool";

// A skill promoted to attribute status — a field row on the "you" card,
// not its own node. Edges reference its `id` the same way they'd
// reference a node id.
interface GraphAttribute {
  id: string;
  label: string;
  category?: SkillCategory; // drives the type-badge accent, not a new node tier
}

interface GraphNode {
  id: string;
  type: NodeType;
  title: string;
  summary?: string;
  fields?: { label: string; value: string }[];
  links?: { label: string; url: string }[];
  tags?: string[];               // e.g. tech stack shown on a Project card
  attributes?: GraphAttribute[]; // "you" node only
  position?: { x: number; y: number }; // default layout hint
}

interface GraphEdge {
  from: string;
  to: string;
  kind: "built-with" | "worked-at" | "related"; // "built-with" = attribute→Project, dashed/secondary; "worked-at" = You→Experience→Project, solid/primary
}

// Promotion rule: a skill becomes an attribute row only for a tech that
// appears in 2+ projects' `tags`. Anything used by exactly one project
// stays a tag on that project and never gets a row or edge.
```

This also makes the "list view" fallback trivial — it's a render of the same data, no graph required.

---

## 6. Tech Stack

| Concern | Choice | Why |
|---|---|---|
| Framework | **Astro** or plain **Vite + vanilla/React** | Static output, minimal JS shipped, ideal for Cloudflare Pages |
| Graph/canvas | **SVG + custom drag** (pointer events), or **d3-force** for layout physics if node count grows | Full control over blueprint styling; d3 only if you want physics-based layout rather than a hand-placed one |
| Styling | Plain CSS with custom properties (the token table above) | No framework needed for a page this custom; avoids fighting a utility framework's defaults |
| Content | Local TypeScript/JSON data file | No CMS needed for a personal portfolio at this scale |
| Hosting | **Cloudflare Pages**, connected to GitHub, auto-deploy on push to `main` | Free tier, fast global edge, trivial custom domain setup for `bjostad.dev` |
| Domain | `bjostad.dev` via Cloudflare DNS | Keep DNS and hosting in the same account for simplest setup |

**Why not a heavier framework:** the whole point of this site is a snappy, physical-feeling canvas. A minimal build (Astro for structure + hand-rolled SVG/JS for the graph, or a small React app if you'd rather use hooks for drag state) keeps the JS bundle small and the interactions responsive.

---

## 7. Deployment (Cloudflare Pages)

1. Push the repo to GitHub.
2. In Cloudflare Pages: **Create a project → Connect to Git → select repo.**
3. Build settings: framework preset (Astro/Vite), build command (`npm run build`), output directory (`dist`).
4. Add custom domain `bjostad.dev` in Pages → Custom domains; Cloudflare handles DNS/SSL automatically if the domain's already on Cloudflare.
5. Every push to `main` auto-deploys; PRs get preview URLs for free — useful for trying layout changes before they go live.

---

## 8. Roadmap

**Phase 1 — Structure & data**
- Set up project scaffold, deploy a blank page to Cloudflare Pages under the real domain first (de-risk hosting early).
- Write the real content: bio, eight projects (tags in place — see §3), experience, contact — into the data file; run the skill-promotion rule to generate the 8 current skill attribute rows.

**Phase 2 — Static graph**
- Render nodes + edges from data, hand-placed top-to-bottom default layout, blueprint styling, dot-grid background, crow's-foot cardinality marks, solid-vs-dashed edge kinds. No dragging yet.

**Phase 3 — Interactivity**
- Add drag, hover-highlight, click-to-expand, reset-layout control.
- Add the list-view fallback and accessibility pass.

**Phase 4 — Polish**
- Load-in animation, responsive/mobile layout (graph likely simplifies to a vertical list or a constrained-drag layout on small screens), reduced-motion support, performance pass.
- Optional: per-project static routes for shareable/SEO-friendly links.

---

## 9. Decisions Locked

- **Projects:** gebo.ing, freyr.farm, pacemakr.com, smartsherpa.ai, staryteller.com, Lukk Boksen, 9T9.club, EscapistBall Analytics — eight Project nodes, final for now (more may be added later; §3 covers what adding one does to the skill attribute layer).
- **Skill attributes:** promoted from tags automatically by the "used in 2+ projects" rule, not hand-picked or category-based, and rendered as field rows on the You card rather than their own nodes. Current rows: TypeScript, JavaScript, Postgres, Java, Spring Boot, NodeJS, Python, Google App Script (see the table in §3). No separate Frontend/Backend/API-style nodes — categorization lives as a `category` field on each attribute instead (visual badge only, not a new entity tier).
- **Headshot:** included on the You node, with a no-photo fallback state designed in from the start (see §3).
- **Resume:** both — PDF download and an in-canvas detail pane.
- **Brand/wordmark:** none exists; the palette, type system, and node/edge grammar in this doc *are* the brand for v1. No separate logo work planned.

**Still open for later:** one-line summary + live/repo links for each of the eight projects (tags are now set — see §3); your actual name/title/one-line pitch for the You node; experience entries (company, title, dates, one-line impact) if you want the Experience nodes populated at launch or added in a later pass; which `category` value each skill attribute gets (language/framework/database/platform/tool).
