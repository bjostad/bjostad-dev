import type { GraphData, GraphNode } from "../data/types";

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
}

/** Vertical tier (top to bottom) each node type rests in by default. */
const TYPE_ROW_Y: Record<GraphNode["type"], number> = {
  you: -320,
  experience: -140,
  project: 160,
  contact: -320,
};

/**
 * Horizontal spacing between nodes sharing a row, per type. Project
 * spacing is intentionally tight: projects used to get pulled toward
 * their connected skill nodes' x position by relax()'s spring, which
 * naturally compacted the row — now that skills are attribute rows on
 * "you" rather than real nodes with a position, that spring no longer
 * applies to them, so the row's rendered spread is just this spacing
 * times the project count with nothing pulling it back in.
 */
const TYPE_SPACING: Record<GraphNode["type"], number> = {
  you: 0,
  experience: 220,
  project: 150,
  contact: 0,
};

/**
 * How far a row's nodes are allowed to wander off their resting y, per
 * type — this is what breaks the "straight line" look. Each node gets its
 * own offset derived from a hash of its id, so neighbors land at
 * unrelated points along the curve rather than alternating up/down in a
 * predictable zigzag. The offset also lets rows pack tighter horizontally
 * (adjacent cards separated vertically don't need as much x gap to avoid
 * touching), which is what makes a wide row of cards fit the canvas.
 */
const TYPE_STAGGER: Record<GraphNode["type"], number> = {
  you: 0,
  experience: 24,
  project: 0, // unused — projects use the alternating two-tier stagger below instead
  contact: 0,
};

/**
 * Projects alternate between two height tiers (rather than the
 * continuous per-id jitter every other row uses) — modeled on an actual
 * hand-arranged layout, which turned out to be two fairly tight rows
 * roughly ±116 apart, not a loose scatter. A little per-node jitter is
 * layered on top so it still doesn't read as a rigid grid.
 */
const PROJECT_TIER_OFFSET = 116;
const PROJECT_JITTER = 16;

/**
 * Places "you" at the top, then lays out each other type in its own
 * horizontal row below (experience, then project at the bottom). Rows
 * are staggered vertically (see TYPE_STAGGER) so they read as a loose
 * cluster rather than a rigid grid, then a cheap horizontal-only
 * relaxation pass nudges same-type nodes apart so they never overlap.
 * Row centers themselves never move, so the top-to-bottom hierarchy is
 * never disturbed — "you"'s attribute list can grow the card taller
 * without shifting anything, since canvas.ts pushes the rows below it
 * down after measuring the real rendered height (see
 * GraphCanvas.ensureClearanceBelowYou).
 */
export function computeInitialLayout(data: GraphData): Map<string, LayoutNode> {
  const positions = new Map<string, LayoutNode>();
  const typeById = new Map<string, GraphNode["type"]>();

  const byType = new Map<GraphNode["type"], GraphNode[]>();
  for (const n of data.nodes) {
    const list = byType.get(n.type) ?? [];
    list.push(n);
    byType.set(n.type, list);
    typeById.set(n.id, n.type);
  }

  for (const [type, nodes] of byType) {
    if (type === "contact" || type === "you") continue; // placed separately, see below
    const baseY = TYPE_ROW_Y[type];
    const spacing = TYPE_SPACING[type];
    const n = nodes.length;

    if (type === "project") {
      nodes.forEach((node, i) => {
        const x = spacing * (i - (n - 1) / 2) + PROJECT_JITTER * 0.5 * pseudoRandom(node.id, "x");
        const tier = i % 2 === 0 ? -1 : 1;
        const y = baseY + tier * PROJECT_TIER_OFFSET + PROJECT_JITTER * pseudoRandom(node.id, "y");
        positions.set(node.id, { id: node.id, x, y });
      });
      continue;
    }

    const stagger = TYPE_STAGGER[type];
    nodes.forEach((node, i) => {
      const x = spacing * (i - (n - 1) / 2) + stagger * 0.6 * pseudoRandom(node.id, "x");
      const y = baseY + stagger * pseudoRandom(node.id, "y");
      positions.set(node.id, { id: node.id, x, y });
    });
  }

  // "You" anchors the top-left of the page rather than top-center, with
  // "contact" mirroring it at top-right (set after relax below). Set
  // before relax (unlike contact) so anything that springs toward "you"
  // — e.g. an experience entry — pulls toward where it actually ends up,
  // not toward a since-moved placeholder.
  const you = byType.get("you")?.[0];
  if (you) positions.set(you.id, { id: you.id, x: -360, y: TYPE_ROW_Y.you });

  relax(data, positions, typeById, 120);

  // Contact sits off to the right of "you" at the same height, clear of
  // the project cluster below rather than buried in it. Placed after
  // relax (and with a fixed offset rather than one derived from the
  // cluster's width) so the you->contact spring can't pull it back
  // toward center or off-screen.
  const contact = byType.get("contact")?.[0];
  if (contact) positions.set(contact.id, { id: contact.id, x: 360, y: TYPE_ROW_Y.you });

  return positions;
}

/**
 * Reorders "you"'s attribute list (top-to-bottom row order, mutated in
 * place on the node) and the project row (left-to-right x order, mutated
 * in place on `data.nodes`) to cut down how much their connecting lines
 * cross — the ER-diagram equivalent of the classic layered-graph
 * crossing-reduction trick. An attribute wants to sit at the row height
 * closest to the average x of the projects it connects to, and a project
 * wants to sit at the x closest to the average row height of the
 * attributes that connect to it; this alternates a few passes of that
 * until it settles.
 *
 * Called once up front regardless of whether positions end up coming
 * from a fresh layout or a restored session — it only touches ordering
 * (attribute rows, project index), not x/y, so it's safe either way.
 */
export function reduceAttributeProjectCrossings(data: GraphData) {
  const you = data.nodes.find((n) => n.type === "you");
  const projects = data.nodes.filter((n) => n.type === "project");
  if (!you?.attributes?.length || !projects.length) return;

  const attrToProjects = new Map<string, string[]>();
  const projectToAttrs = new Map<string, string[]>();
  for (const e of data.edges) {
    if (e.kind !== "built-with") continue; // attribute -> project edges only
    (attrToProjects.get(e.from) ?? attrToProjects.set(e.from, []).get(e.from)!).push(e.to);
    (projectToAttrs.get(e.to) ?? projectToAttrs.set(e.to, []).get(e.to)!).push(e.from);
  }

  let attrOrder = you.attributes.map((a) => a.id);
  let projectOrder = projects.map((n) => n.id);

  const barycenter = (id: string, neighborsOf: Map<string, string[]>, otherIndex: Map<string, number>, fallback: number) => {
    const neighbors = neighborsOf.get(id);
    if (!neighbors?.length) return fallback;
    let sum = 0;
    for (const nid of neighbors) sum += otherIndex.get(nid) ?? fallback;
    return sum / neighbors.length;
  };

  for (let pass = 0; pass < 4; pass++) {
    const projectIndex = new Map(projectOrder.map((id, i) => [id, i]));
    const attrFallback = new Map(attrOrder.map((id, i) => [id, i]));
    attrOrder = [...attrOrder].sort(
      (a, b) =>
        barycenter(a, attrToProjects, projectIndex, attrFallback.get(a)!) -
        barycenter(b, attrToProjects, projectIndex, attrFallback.get(b)!),
    );

    const attrIndex = new Map(attrOrder.map((id, i) => [id, i]));
    const projectFallback = new Map(projectOrder.map((id, i) => [id, i]));
    projectOrder = [...projectOrder].sort(
      (a, b) =>
        barycenter(a, projectToAttrs, attrIndex, projectFallback.get(a)!) -
        barycenter(b, projectToAttrs, attrIndex, projectFallback.get(b)!),
    );
  }

  const attrById = new Map(you.attributes.map((a) => [a.id, a]));
  you.attributes = attrOrder.map((id) => attrById.get(id)!);

  const projectById = new Map(projects.map((n) => [n.id, n]));
  const orderedProjects = projectOrder.map((id) => projectById.get(id)!);
  const projectSlots = data.nodes.map((n) => (n.type === "project" ? orderedProjects.shift()! : n));
  data.nodes.splice(0, data.nodes.length, ...projectSlots);
}

/** Deterministic pseudo-random value in [-1, 1] derived from a string. */
function pseudoRandom(id: string, salt: string): number {
  let h = 2166136261;
  for (const ch of id + salt) {
    h ^= ch.charCodeAt(0);
    h = Math.imul(h, 16777619);
  }
  // Fold to [0, 1) then remap to [-1, 1).
  const unit = ((h >>> 0) % 100000) / 100000;
  return unit * 2 - 1;
}

function relax(
  data: GraphData,
  positions: Map<string, LayoutNode>,
  typeById: Map<string, GraphNode["type"]>,
  iterations: number,
) {
  const ids = data.nodes.map((n) => n.id);
  const minDist = 150;

  for (let iter = 0; iter < iterations; iter++) {
    // Horizontal repulsion between nodes of the same type (i.e. sharing a
    // row), so cards never overlap regardless of their vertical stagger.
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = positions.get(ids[i])!;
        const b = positions.get(ids[j])!;
        if (typeById.get(ids[i]) !== typeById.get(ids[j])) continue;
        let dx = b.x - a.x;
        const dist = Math.abs(dx) || 0.01;
        if (dist < minDist) {
          const push = (minDist - dist) / dist / 2;
          const sign = dx < 0 ? -1 : 1;
          const move = Math.abs(dx) * push * sign;
          if (a.id !== "you") a.x -= move;
          if (b.id !== "you") b.x += move;
        }
      }
    }

    // Mild horizontal spring pulling connected nodes toward each other's
    // centroid, without touching y.
    for (const e of data.edges) {
      const a = positions.get(e.from);
      const b = positions.get(e.to);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const pull = dx * 0.015;
      if (a.id !== "you") a.x += pull;
      if (b.id !== "you") b.x -= pull;
    }
  }
}
