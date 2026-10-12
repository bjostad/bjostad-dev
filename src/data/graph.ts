import type { GraphAttribute, GraphData, GraphEdge, GraphLens, GraphNode, Highlight, Screenshot, SkillCategory } from "./types";

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
  "Google Apps Script": "tool",
  "Google Sheets API": "tool",
  Konva: "framework",
};

/**
 * Top-to-bottom order of skills within their category on your card. Skills
 * not listed here follow the listed ones in their category, arranged to
 * keep their lines from crossing.
 */
const SKILL_ORDER = [
  // Languages
  "Java",
  "Python",
  "Dart",
  "TypeScript",
  "JavaScript",
  // Frameworks
  "Spring Boot",
  "Flutter",
  "FastAPI",
  "Express",
  "React",
  "React Native",
  "Konva",
];

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
  /** Plain strings, or { title, point, detail } for a scannable headline with more behind an expander. */
  highlights?: Highlight[];
  /** Shown in the project's detail section — label them e.g. "Live site", "Source". */
  links?: { label: string; url: string; stamp?: string }[];
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
    subtitle: "Agentic AI for service businesses",
    cardHighlights: ["Co-founder, led a team of 3", "Multi-channel AI agents", "40% less client admin work"],
    summary:
      "An autonomous agentic AI platform, which I co-founded and led as lead engineer (Oct 2023 – Jan 2026), handling 24/7 customer engagement and lead qualification for HVAC, plumbing, and electrical businesses.",
    highlights: [
      {
        title: "Cut clients' administrative overhead 40% with multi-channel AI agents",
        point: "Agents qualified leads and handled intake and troubleshooting 24/7 across SMS, voice, web chat, and Facebook Messenger.",
        detail:
          "I designed, architected, and deployed the agent platform for HVAC, plumbing, and electrical businesses. Multi-channel conversational logic qualified inbound leads and automated intake and troubleshooting, taking that work off owners' plates around the clock.",
      },
      {
        title: "Cut new-client deployment time by over 50% with industry-specific onboarding templates",
        point: "Prebuilt templates and knowledge bases for electricians and plumbers gave every new client a working starting point.",
        detail:
          "Onboarding started from trade-specific templates and knowledge bases rather than a blank configuration, then layered on each business's own details.",
      },
      {
        title: "Co-founded the company and led a team of 3 engineers for over 2 years",
        point: "Owned architecture and delivery as lead engineer from October 2023 to January 2026.",
        detail: "Built on AWS (EC2, RDS, S3, Route 53, CloudFormation) with Java, Python, JavaScript, React, and LangChain.",
      },
    ],
    tags: ["TypeScript", "React", "Python", "Java", "Spring Boot", "Langchain", "NodeJS", "FastAPI", "Postgres"],
  },
  {
    id: "staryteller",
    title: "staryteller.com",
    subtitle: "AI bedtime story app",
    cardHighlights: ["LLM streaming over SSE", "Local-first on-device storage", "Skia GPU canvas rendering"],
    summary:
      "A mobile app that writes personalized bedtime stories with an LLM and adds each one as a star in a growing constellation to explore.",
    highlights: [
      {
        title: "Showed the first words of each story ~7x sooner by streaming tokens over SSE",
        point: "Readers start reading in ~0.5 s instead of waiting ~3.6 s for a full 200-word story to generate.",
        detail:
          "Spring Boot relays OpenAI's streaming completions to the React Native client through an SseEmitter on a worker pool, and the app renders tokens as they arrive via react-native-sse. Wait times are estimates at gpt-4o-mini's typical ~90 tokens/s and ~0.5 s to first token: ~1.4 s, ~2.1 s, and ~3.6 s for the 50, 100, and 200-word lengths.",
      },
      {
        title: "Spent $0 in LLM tokens on rejected requests by checking plan limits and moderation first",
        point: "Over-quota, over-limit, and flagged prompts are refused before any paid completion call is made.",
        detail:
          "The API enforces 4 subscription tiers server-side, from Free (1 story a day, 1 crew member, short stories only) to Max (unlimited stories, up to 99 crew members), then screens the theme with OpenAI's free Moderation API. Only requests that pass both reach the completion endpoint, and the prompt contract caps story bodies at 50, 100, or 200 words to bound the cost of each one.",
      },
      {
        title: "Placed every story on the map from its SHA-256 hash, with 0 overlapping stars",
        point: "Each star's position comes from the story's own text, and a repulsion pass guarantees stars never collide.",
        detail:
          "The first 64 bits of the hash map to x/y on a 5,000 × 5,000 sky. Hashing alone would give a 50% chance of two stars landing within 100 units of each other by just 34 stories, and ~78% by 50 (Monte Carlo), so an iterative repulsion pass nudges each new star until it clears every neighbor.",
      },
      {
        title: "Exported a 25-megapixel galaxy image, ~10x a phone screen, from an off-screen Skia surface",
        point: "Shareable prints render headlessly at full resolution instead of screenshotting the viewport.",
        detail:
          "The export draws the background, 80 ambient bodies, and every story star with a blur glow onto a 5,000 × 5,000 Skia surface (25 MP vs ~2.6 MP for a 1080 × 2400 screen), encodes it to PNG, and hands it to the native share sheet.",
      },
      {
        title: "Animated 80 celestial bodies with 0 React re-renders per frame using Reanimated worklets",
        point: "Motion, pan, zoom, and off-screen star indicators run on the UI thread and draw straight to a GPU Skia canvas.",
        detail:
          "Shared and derived values feed Skia directly, so frames never go through React reconciliation. Off-screen indicators compute each hidden star's bearing with atan2 in an animated reaction and pin an arrow to the screen edge.",
      },
      {
        title: "Opened the star map with 0 network requests by storing stories on-device",
        point: "Stories live in WatermelonDB (SQLite over JSI), so the map loads instantly, even offline.",
        detail:
          "The constellation screen observes the local database and re-renders when a story is added. Stories carry client-generated UUIDs, and the backend already has a last-write-wins sync endpoint for upcoming multi-device sync. The API runs as a container on Cloud Run, which scales to zero when idle, with Cloud SQL, Secret Manager, and Cloud Build CI/CD.",
      },
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
      {
        title: "Mapped raw combine results to 1–99 ratings with a tuned logistic curve",
        point: "A mid-range result rates 71 instead of a linear 50, and gains near the ceiling move the rating less.",
        detail:
          "Each metric is normalized against its own floor, ceiling, and direction (lower is better for a 40-yard dash, higher for a vertical jump), then passed through a sigmoid with k = 6 and x₀ = 0.35. A result a quarter of the way up the range rates 36 instead of 26; 90+ starts at 72% of the range, so the top 28% of results share the 90s. Pillar and overall ratings are weighted averages of these.",
      },
      {
        title: "Made spreadsheet imports idempotent: re-running one creates 0 duplicate stats",
        point: "Each stat's ID is built from player, metric, and date, so importing the same sheet twice overwrites instead of duplicating.",
        detail:
          "Rows already marked Imported are skipped, and stats are committed in Firestore write batches, so a 30-player, 10-metric evaluation day (300 stats) lands in 1 commit instead of 300 round trips.",
      },
      {
        title: "Exported a full roster to Google Sheets in 1 API request",
        point: "One bulk values update instead of a write per player keeps exports well inside Sheets' 60 writes-per-minute user quota.",
        detail:
          "Coaches grant a scoped Google OAuth token, and the app creates and formats eval-import, eval-archive, and Roster tabs with batchUpdate, then imports edited sheets back into Firestore. Structured Gemini (@google/genai) prompts turn the same evaluation data into scouting summaries.",
      },
      {
        title: "Enforced 5 roles in Firestore security rules, with leaderboards updating live",
        point: "Admins, coaches, assistant coaches, managers, and players each get only the reads and writes their role allows, checked by the database itself.",
        detail:
          "onSnapshot listeners push new evaluations to leaderboards, player lockers, and the clubhouse the moment a coach records them, with no polling or refresh. The rules also validate document shapes, team membership, and IDs (alphanumeric, at most 128 characters).",
      },
      {
        title: "Built the playbook editor on a Konva canvas with snap-to-scrimmage geometry",
        point: "Players snap to the line of scrimmage within 3 yards and align to teammates within 1 yard as they're dragged.",
        detail:
          "A canvas scene graph rather than DOM nodes, at 16 px per yard (853 px across a 53⅓-yard field), with distance-based hit testing for drawing and editing routes.",
      },
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
      {
        title: "Added items from any store with a 5-tier scraping fallback that never returns an error",
        point: "Every product link yields at least a title and icon, even when the retailer blocks scrapers.",
        detail:
          "1) Shopify stores answer from their public /products/*.json endpoint, skipping HTML entirely. 2) Otherwise the server fetches the page with full browser headers and parses JSON-LD (Schema.org Product) and Open Graph tags with Cheerio. 3) Captchas and bot walls are detected, and Amazon links fall back to the ASIN and URL slug. 4) The Microlink API is tried only after a direct fetch fails, conserving its free quota. 5) Last resort: the URL slug and the site's favicon.",
      },
      {
        title: "Protected gift surprises by stripping 8 purchase fields from the owner's API responses",
        point: "Hiding happens on the server until the day after the occasion, so a surprise can't leak through the browser's network tab.",
        detail:
          "Purchase status and date, buyer name, email, message, tracking, and receipt link and text are nulled per request, based on the registry's event date or the owner's next important date, then revealed automatically the day after, when purchased items also archive themselves off the list.",
      },
      {
        title: "Made every saved product link monetizable across 6 affiliate programs and 50,000+ merchants",
        point: "Retail links are rewritten server-side to the matching program, with a universal network as the fallback for any other store.",
        detail:
          "Direct programs cover Amazon (20 regional domains), eBay (8), Walmart, Target, Best Buy, and Etsy via Awin, and Amazon links are scrubbed of third-party referral tags first. Anything else falls back to Skimlinks or Sovrn, which together reach 50,000+ retailers. Programs live in the database behind admin endpoints, so adding or pausing one takes 0 deploys.",
      },
      {
        title: "Shrank uploaded photos ~98% with a server-side image pipeline",
        point: "A typical 12-megapixel phone photo (~3.5 MB) is stored as an ~70 KB WebP, so lists load fast on shared hosting.",
        detail:
          "Sharp auto-rotates by EXIF, resizes item images to fit 800 px and avatars to 500 px without ever upscaling, and re-encodes as WebP at quality 85–90. Uploads are capped at 2–50 MB by type. Size figures are typical estimates for a 4032 × 3024 JPEG.",
      },
      {
        title: "Ran the full production stack for $0 a month",
        point: "The React front end is served from Cloudflare Pages' global CDN, and the Express API and PostgreSQL run on existing shared hosting.",
        detail:
          "Splitting static hosting from the API put the front end on Cloudflare's edge with DDoS protection and Git-triggered deploys, while the 93-endpoint API runs under Phusion Passenger with Prisma migrations applied at each release.",
      },
      {
        title: "Gave every list 3 privacy levels with share links carrying 122 bits of randomness",
        point: "Lists are private, shared (link plus sign-in), or public, and UUID tokens make links effectively unguessable.",
        detail:
          "Access rules are enforced per request on the server. Under them sits a PostgreSQL schema modeled with Prisma: 12 cascading relations, so deleting a list cleans up every dependent row in one statement, and composite unique keys such as (listId, sharedWithEmail) that stop duplicate shares at the database. Lists can also back up one way to the user's own Google Drive, run in the browser with their own OAuth token, so Gebo stores no Google credentials.",
      },
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
      {
        title: "Chose each zone's runtime by scoring 180 candidate runtimes against every bed on the valve",
        point: "One valve often feeds beds with different needs, so the engine picks the runtime with the lowest combined error, penalizing underwatering 4x and overwatering 5x.",
        detail:
          "For each minute from 1 to 180, it projects every bed's final moisture and sums an asymmetric quadratic cost (1x inside the target band, 4x below it, 5x above it). Beds that end up outside their band get a recorded compromise note explaining the trade-off against their neighbors.",
      },
      {
        title: "Skipped watering whenever forecast rain of 0.25 in or more will cover the loss",
        point: "A rain guard compares infiltrated rain with projected evapotranspiration for every bed before recommending a run.",
        detail:
          "Rain is credited at 85% and capped by soil infiltration capacity (0.20–0.50 in/hr across 7 soil textures, over at most 12 hours), then weighed against crop ET from a simplified Penman-Monteith/Hargreaves model over a 36-hour lookahead. When every thirsty bed is covered, the zone is skipped and its pending recommendations are withdrawn.",
      },
      {
        title: "Recorded an auditable reasoning trail for 100% of watering decisions",
        point: "Every recommendation stores current moisture, projected ET, effective rain, deficit in gallons, and the runtime math behind it.",
        detail:
          "Deficits convert to gallons from root-zone volume (7.48 gal per cubic foot) and to minutes from the zone's summed emitter flow. Every bed is re-evaluated hourly, a nightly 2 AM job refits each bed's microclimate coefficients (solar 35%, temperature 30%, wind 20%, humidity 15%, bounded to 0.5–2x), and a newer recommendation expires the older pending one for its zone.",
      },
      {
        title: "Drove ESP32, Shelly, and Raspberry Pi valves through 1 hardware-agnostic command layer",
        point: "Every valve command carries a max runtime the device enforces locally, so a dropped connection can never leave water running.",
        detail:
          "Commands go out over REST or MQTT behind a single gateway interface, zones on a shared supply line are mutually excluded, and out-of-range probe readings fall back to ET-only modeling. Manual test runs are clamped to 2–60 s by a server-side watchdog, and one emergency-stop call closes every open valve on a property.",
      },
      {
        title: "Split the backend into 3 Maven modules with one-way dependencies",
        point: "The decision engine, web API, and shared domain model build separately, and the engine runs as its own Spring Boot application.",
        detail:
          "Java 21 and Spring Boot 3 over PostgreSQL 16, with H2 powering the in-browser demo; organization-scoped multi-tenancy with OWNER, MEMBER, and VIEWER roles. The React front end adds a to-scale react-konva bed designer and a per-plant moisture heatmap.",
      },
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
    cardHighlights: ["Live on web, Android early access", "Firestore real-time multiplayer", "Forge2D rigid-body physics"],
    summary:
      "A Flutter take on the classic dice game Shut the Box, with physics-driven dice, shake-to-roll, and asynchronous multiplayer. Released as a web game at lukkboksen.bjostad.dev, with the Android app in early access on Google Play.",
    highlights: [
      {
        title: "Cut database writes per turn 47% by committing each turn as one atomic batch",
        point: "Nearly doubles the games the free tier can host each day (~61 to ~113), and opponents never see a half-applied move.",
        detail:
          "The turn, every player's row, and the next game state commit together in one Firestore batch, so opponents never see a half-applied move. A Monte Carlo model of 200k simulated turns averages 6.4 rolls per turn: 6 writes per turn instead of ~11.4 if each roll were saved as it landed. Over a 4-player game that's ~117 writes and ~441 listener reads instead of ~211 and ~817, assuming every player stays online the whole game.",
      },
      {
        title: "Shrank replay data ~190x by storing dice results instead of physics",
        point: "A full turn replays from ~84 bytes instead of ~16 KB of recorded motion, and every roll stays a fair 1/6 on any device.",
        detail:
          "Dice values come from the RNG before the Forge2D animation starts and the physics is purely cosmetic, so each face is exactly 1/6 on any device or frame rate. Recording 60 fps position and rotation for two dice would take ~16 KB per turn; the stored JSON averages 84 bytes and never exceeds 120. A damping ramp caps every roll's animation at 0.5–3.0 s, so a turn never stalls waiting on jittering bodies to settle.",
      },
      {
        title: "Reduced reads ~270x by moving from a polling to a live listener architecture",
        point: "Opponents' moves now appear in under a second, down from ~5 minutes on the original 10-minute poll.",
        detail:
          "The first version polled a Google Sheets backend every 10 minutes. Firestore listeners now push only changed documents: ~18 reads per open hour for a typical game, where polling every 10 s would read ~4,900 and exhaust the free tier's 50k daily reads in ~10 player-hours. The merged stream waits for every game to load and renders the list once instead of up to 21 times for 10 games.",
      },
      {
        title: "Eliminated 75% of writes in update races with optimistic concurrency",
        point: "When several players' apps advance the same game at once, exactly one update lands and no score is ever lost.",
        detail:
          "Every client runs the same pure Dart rules engine, covered by 43 unit tests over a written decision table, and advances the game through a transaction that first re-checks the round and status. With 4 clients racing, one commit lands (5 writes instead of 20), and a client holding a stale snapshot can't overwrite newer scores.",
      },
      {
        title: "Enforced turn time limits at 0 extra reads by removing the need for a scheduler",
        point: "Players' own apps catch overdue turns, where a cron job would need the paid plan and use 29% of the free read quota.",
        detail:
          "Each open app re-checks its games every 60 s against state its listeners already hold, and only a real timeout writes anything. A scheduled Cloud Function would need the paid Blaze plan and, at minimum, 1,440 runs and 14,400 reads a day for just 10 active games.",
      },
      {
        title: "Secured multiplayer at $0 by making Firestore security rules the backend",
        point: "The database itself enforces who can see and change each game and rejects duplicate turns, with 0 extra reads.",
        detail:
          "Rules verify membership, keep the host and invite list immutable, and make turns append-only. Each turn's {round}_{email} document ID works as an idempotency key, so a double-tapped submit is rejected atomically instead of needing a check-then-write query (~17 reads per game) that could still race. Covered by 17 tests against the Firebase Emulator Suite.",
      },
    ],
    tags: ["Dart", "Flutter", "Riverpod", "Flame", "Forge2D", "Firebase", "Cloud Firestore"],
    links: [
      { label: "Play online", url: "https://lukkboksen.bjostad.dev/game" },
      // Early access only, so no public listing yet; the stamp comes off once the app is approved.
      {
        label: "Google Play",
        url: "https://play.google.com/store/apps/details?id=dev.bjostad.lukkboksen",
        stamp: "Early access only",
      },
    ],
    // Framing needs the landing page's CSP frame-ancestors to allow bjostad.dev (see lukk-boksen firebase.json).
    demoUrl: "https://lukkboksen.bjostad.dev",
  },
  {
    id: "pacemakr",
    title: "pacemakr.com",
    subtitle: "BPM-based Spotify workout playlists",
    cardHighlights: ["Spotify Web API integration", "Tempo-based track search", "React + Express full stack"],
    summary:
      "A Spotify playlist generator that builds a playlist from any sequence of BPM segments over any length of time: say 10 minutes of high BPM, a 3-minute low-BPM break, then a ramp back up, shaped to fit a workout, run, or ride.",
    highlights: [
      {
        title: "Kept the Spotify client secret off every user's device with an Express API in the middle",
        point: "The React client only ever talked to the Node.js server, which ran Spotify's OAuth authorization-code flow: 0 secrets shipped to the browser.",
        detail:
          "The server exchanged authorization codes for tokens and proxied Spotify Web API calls, so credentials stayed server-side while the React + Vite client handled the segment builder and timeline.",
      },
      {
        title: "Saved any playlist of up to 100 tracks in 2 Spotify API calls",
        point: "One call creates the playlist and one adds every track, chunked at Spotify's 100-item limit for longer sessions.",
        detail:
          "Track discovery asks the recommendations endpoint for 50 candidates per BPM segment in one request, seeded with a target tempo and up to 5 genres, the API's maximum.",
      },
      {
        title: "Kept the app fully demoable after Spotify's 2026 API changes by swapping 1 module",
        point: "Spotify's February 2026 changes removed the endpoints it relied on; a mock module with identical function signatures kept every screen working.",
        detail:
          "Sign-in, recommendations, genre listing, and playlist creation keep the same interface but return tempo-matched mock tracks (within ±5 BPM) with simulated latency, so the UI code didn't have to know.",
      },
    ],
    tags: ["JavaScript", "React", "Vite", "NodeJS", "Express"],
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
      {
        title: "Computed every team's daily score ceiling across 11 categories with a lineup optimizer",
        point: "For each stat it fills the 18 starting slots with the best eligible players, showing what a perfect lineup would have scored next to what the team actually did.",
        detail:
          "Players are sorted per category (ascending for ERA and WHIP, with ties broken on innings pitched) and placed in the scarcest eligible slot first (C, SS, 2B, 3B, 1B, OF, then Util; SP, RP, then P), so a multi-position player isn't wasted in a flexible slot. Daily ceilings roll up into weekly totals.",
      },
      {
        title: "Made nightly syncs and backfills idempotent across 8 data tables",
        point: "Rows upsert on composite keys, so rerunning a day or backfilling a season updates rows in place and creates 0 duplicates.",
        detail:
          "Each upsert reads the sheet once into a key-to-row map for constant-time lookups and appends all new rows in a single write. A time-driven trigger runs the sync nightly between 11 PM and midnight and logs failures to a SystemLogs tab.",
      },
      {
        title: "Loaded the whole dashboard in 1 HTTP request from a serverless Apps Script API",
        point: "A single endpoint returns team metadata, weekly stats, matchups, score ceilings, and season stats as one JSON payload, with no server to run or pay for.",
        detail:
          "The React + Vite front end builds its Recharts views on memoized transforms with custom tooltips. Lower-is-better categories like ERA and WHIP rank ascending, and rate stats keep three-decimal precision.",
      },
      {
        title: "Capped Yahoo API usage at 900 requests per hour with a cache-backed rate limiter",
        point: "A shared counter in Apps Script's CacheService refuses calls past the limit, protecting the developer account during syncs.",
        detail:
          "OAuth 2.0 handles Yahoo sign-in, and deeply nested responses (arrays that shift into objects) are flattened into pivot-friendly rows. Backfills bypass the limiter, so they're throttled by date range.",
      },
    ],
    tags: ["JavaScript", "React", "Vite", "Recharts", "Google Apps Script"],
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

/** The line under your name on your card (and in the list view) — what a
 * recruiter screens for first. Empty a field to drop it from the line. */
const status = {
  availability: "Open to the right role",
  location: "Seattle, WA",
  workSetup: "Remote, hybrid, or on-site",
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
    { label: "Resume (PDF)", url: "/resume.pdf#view=FitH" },
  ],
  position: { x: 0.85, y: 0.7 },
};

/**
 * The header's lens chips, one per kind of role. `projects` is your
 * ranking for that role, strongest first; the top few are enough (the
 * rest of the graph dims). `skills` are skill names as they appear in
 * project tags; any that aren't shown on your card are ignored.
 * Each lens has a shareable link: bjostad.dev/?lens=<id>.
 */
interface LensSeed {
  id: string;
  label: string;
  blurb?: string;
  skills: string[];
  projects: string[];
}

const lenses: LensSeed[] = [
  {
    id: "frontend",
    label: "Frontend",
    blurb: "React + TypeScript apps, including canvas editors and data visualization.",
    skills: ["TypeScript", "JavaScript", "React", "Konva", "Vite"],
    projects: ["9t9-club", "freyr-farm", "escapistball"],
  },
  {
    id: "backend",
    label: "Backend",
    blurb: "Java / Spring Boot and Node APIs over Postgres, deployed on GCP.",
    skills: ["Java", "Spring Boot", "NodeJS", "Express", "FastAPI", "Postgres", "GCP"],
    projects: ["freyr-farm", "staryteller", "gebo-ing"],
  },
  {
    id: "ai",
    label: "AI / LLM",
    blurb: "LLM products, from an agentic AI startup to streamed story generation.",
    skills: ["Python", "Langchain", "OpenAI", "Gemini", "FastAPI"],
    projects: ["smartsherpa", "staryteller", "9t9-club"],
  },
  {
    id: "mobile",
    label: "Mobile",
    blurb: "React Native and Flutter apps with GPU canvases, physics, and offline sync.",
    skills: ["React Native", "Flutter", "Dart", "TypeScript", "Firebase"],
    projects: ["staryteller", "lukk-boksen"],
  },
  {
    id: "data",
    label: "Data",
    blurb: "Rating models, analytics dashboards, and physics-based forecasting.",
    skills: ["Postgres", "Firebase", "Python", "Google Sheets API", "Google Apps Script"],
    projects: ["escapistball", "9t9-club", "freyr-farm"],
  },
];

function buildLenses(attributes: GraphAttribute[]): GraphLens[] {
  const attrIds = new Set(attributes.map((a) => a.id));
  const projectIds = new Set(projects.map((p) => p.id));
  return lenses.map((l) => ({
    id: l.id,
    label: l.label,
    blurb: l.blurb,
    skills: l.skills.map((s) => `skill-${slug(s)}`).filter((id) => attrIds.has(id)),
    projects: l.projects.filter((id) => projectIds.has(id)),
  }));
}

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
    const order = SKILL_ORDER.indexOf(skill);
    attributes.push({ id, label: skill, category: SKILL_CATEGORY[skill], rank: order === -1 ? undefined : order });
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
  const nodes: GraphNode[] = [
    { ...you, attributes, status: [status.availability, status.location, status.workSetup].filter(Boolean) },
    contact,
  ];
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

  return { nodes, edges, lenses: buildLenses(attributes) };
}
