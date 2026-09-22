import type { GraphData, GraphNode } from "../data/types";

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
}

/** Vertical tier (top to bottom) each node type rests in by default. */
const TYPE_ROW_Y: Record<GraphNode["type"], number> = {
  you: -320,
  experience: -170,
  skill: 0,
  project: 260,
  contact: 320,
};

/** Horizontal spacing between nodes sharing a row, per type. */
const TYPE_SPACING: Record<GraphNode["type"], number> = {
  you: 0,
  experience: 220,
  skill: 190,
  project: 210,
  contact: 210,
};

/**
 * How far a row's nodes are allowed to wander off their resting y, per
 * type — this is what breaks the "straight line" look. Each node gets its
 * own offset derived from a hash of its id, so neighbors land at
 * unrelated points along the curve rather than alternating up/down in a
 * predictable zigzag. The offset also lets rows pack tighter horizontally
 * (adjacent cards separated vertically don't need as much x gap to avoid
 * touching), which is what makes a wide row of 7-8 cards fit the canvas.
 */
const TYPE_STAGGER: Record<GraphNode["type"], number> = {
  you: 0,
  experience: 24,
  skill: 34,
  project: 38,
  contact: 0,
};

/**
 * Places "you" at the top, then lays out each other type in its own
 * horizontal row below (experience, then skill, then project/contact at
 * the bottom). Rows are staggered vertically (see TYPE_STAGGER) so they
 * read as a loose cluster rather than a rigid grid, then a cheap
 * horizontal-only relaxation pass nudges same-type nodes apart so they
 * never overlap and pulls skill hubs toward the horizontal centroid of
 * the projects they connect to. Row centers themselves never move, so
 * the top-to-bottom hierarchy is never disturbed.
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

  reduceSkillProjectCrossings(data, byType);

  for (const [type, nodes] of byType) {
    if (type === "contact") continue; // placed separately, after relaxation
    const baseY = TYPE_ROW_Y[type];
    const spacing = TYPE_SPACING[type];
    const stagger = TYPE_STAGGER[type];
    const n = nodes.length;
    nodes.forEach((node, i) => {
      const x = spacing * (i - (n - 1) / 2) + stagger * 0.6 * pseudoRandom(node.id, "x");
      const y = baseY + stagger * pseudoRandom(node.id, "y");
      positions.set(node.id, { id: node.id, x, y });
    });
  }

  relax(data, positions, typeById, 120);

  // Contact sits off to the right of "you", clear of the skill/project
  // cluster below rather than buried in it. Placed after relax (and with
  // a fixed offset rather than one derived from the cluster's width) so
  // neither the you->contact spring nor a wide row of cards can pull it
  // back toward center or off-screen.
  const contact = byType.get("contact")?.[0];
  if (contact) positions.set(contact.id, { id: contact.id, x: 380, y: TYPE_ROW_Y.you });

  return positions;
}

/**
 * Reorders the skill and project rows (in place, within `byType`) to cut
 * down how much their connecting lines cross. A skill/project pair that
 * shares an edge wants to sit near the same horizontal slot; this runs a
 * few passes of the classic layered-graph trick — sort each row by the
 * average position ("barycenter") of the nodes it connects to in the
 * other row, alternating rows each pass until it settles. It only
 * changes ordering (which sets each node's slot index); x/y values are
 * still assigned afterward by the normal per-row layout.
 */
function reduceSkillProjectCrossings(data: GraphData, byType: Map<GraphNode["type"], GraphNode[]>) {
  const skills = byType.get("skill");
  const projects = byType.get("project");
  if (!skills?.length || !projects?.length) return;

  const skillToProjects = new Map<string, string[]>();
  const projectToSkills = new Map<string, string[]>();
  for (const e of data.edges) {
    if (e.kind !== "built-with") continue; // skill -> project edges only
    (skillToProjects.get(e.from) ?? skillToProjects.set(e.from, []).get(e.from)!).push(e.to);
    (projectToSkills.get(e.to) ?? projectToSkills.set(e.to, []).get(e.to)!).push(e.from);
  }

  let skillOrder = skills.map((n) => n.id);
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
    const skillFallback = new Map(skillOrder.map((id, i) => [id, i]));
    skillOrder = [...skillOrder].sort(
      (a, b) =>
        barycenter(a, skillToProjects, projectIndex, skillFallback.get(a)!) -
        barycenter(b, skillToProjects, projectIndex, skillFallback.get(b)!),
    );

    const skillIndex = new Map(skillOrder.map((id, i) => [id, i]));
    const projectFallback = new Map(projectOrder.map((id, i) => [id, i]));
    projectOrder = [...projectOrder].sort(
      (a, b) =>
        barycenter(a, projectToSkills, skillIndex, projectFallback.get(a)!) -
        barycenter(b, projectToSkills, skillIndex, projectFallback.get(b)!),
    );
  }

  const skillById = new Map(skills.map((n) => [n.id, n]));
  const projectById = new Map(projects.map((n) => [n.id, n]));
  byType.set("skill", skillOrder.map((id) => skillById.get(id)!));
  byType.set("project", projectOrder.map((id) => projectById.get(id)!));
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

    // Mild horizontal spring pulling skill hubs toward the centroid of the
    // projects they connect to (and vice versa), without touching y.
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
