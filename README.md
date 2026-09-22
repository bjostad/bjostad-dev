# bjostad.dev

Interactive portfolio: an entity-relationship-style graph of you, your projects,
and experience, rendered on a dark blueprint canvas with crow's-foot notation
on every connector. Every node is draggable. See `DESIGN.md` (or the design
doc artifact) for the full rationale.

## Local development

```bash
npm install
npm run dev      # http://localhost:5173
npm run build    # outputs to dist/
npm run preview  # serve the production build locally
```

## Editing content

Everything you need to update lives in **`src/data/graph.ts`**:

- `projects` — add a project by adding an entry with `id`, `title`, and `tags`
  (the tech stack). Fill in `summary` and `links` when ready.
- `you` — your name, title, one-line pitch, and (optional) `photo` path. Drop
  an image in `public/` (e.g. `public/you.jpg`) and set `photo: "/you.jpg"`.
  Leaving `photo` unset renders the initials fallback — both states are
  designed to look intentional.
- `experience` — add roles as you want them to appear; leave the array empty
  and the graph connects You directly to every project instead.
- `contact` — update email/GitHub/LinkedIn, and point the `Resume (PDF)` link
  at your actual résumé (see below).

**Skill attributes are automatic.** A skill becomes a field row on the "you"
card once it's used by two or more projects (see `buildAttributesAndEdges` in
`graph.ts`); a skill used by only one project stays a tag on that project's
card instead. Adding a second project with an existing skill promotes it to
an attribute row on the next build — no manual wiring needed. Give a skill a
`category` in `SKILL_CATEGORY` (language / framework / database / platform /
tool) to control its small type badge. Click an attribute row on the graph to
highlight the projects it connects to.

## Resume

Drop your résumé PDF at `public/resume.pdf` (referenced by the `contact` node's
`links`). It's shown both as an in-pane preview (via `<iframe>`) and as a
direct download when the Contact node is opened.

## Deploying to Cloudflare Pages

1. Push this repo to GitHub.
2. In the Cloudflare dashboard: **Workers & Pages → Create → Pages → Connect
   to Git**, and select the repo.
3. Build settings:
   - Framework preset: **Vite**
   - Build command: `npm run build`
   - Output directory: `dist`
4. **Custom domains** tab → add `bjostad.dev` (and `www.bjostad.dev` if
   wanted). If the domain's DNS is already on Cloudflare, SSL and routing are
   handled automatically.
5. Every push to `main` auto-deploys; pull requests get their own preview URL.

## Notes

- No backend/CMS — content changes are code changes (a `git push`), by design
  for a personal portfolio at this scale.
- The graph layout is recomputed from scratch (a light force-relaxation pass)
  whenever `graph.ts` content changes and the stored layout in
  `sessionStorage` no longer matches the current node set, so old dragged
  positions don't go stale-but-invisible after an edit.
- `prefers-reduced-motion` disables the load-in animation and drag/reset
  transitions.
