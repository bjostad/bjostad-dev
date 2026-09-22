import type { GraphData, GraphNode } from "../data/types";

export interface LayoutNode {
  id: string;
  x: number;
  y: number;
}

const TYPE_RADIUS: Record<GraphNode["type"], number> = {
  you: 0,
  experience: 220,
  skill: 260,
  project: 440,
  contact: 420,
};

/**
 * Places "you" at the center, then rings out by type (experience/skill in a
 * middle ring, projects/contact further out), then relaxes with a cheap
 * repulsion pass so nodes sharing a ring don't overlap and skill hubs drift
 * toward the centroid of the projects they connect to.
 */
export function computeInitialLayout(data: GraphData): Map<string, LayoutNode> {
  const positions = new Map<string, LayoutNode>();

  const byType = new Map<GraphNode["type"], GraphNode[]>();
  for (const n of data.nodes) {
    const list = byType.get(n.type) ?? [];
    list.push(n);
    byType.set(n.type, list);
  }

  for (const [type, nodes] of byType) {
    const radius = TYPE_RADIUS[type];
    if (type === "you") {
      positions.set(nodes[0].id, { id: nodes[0].id, x: 0, y: 0 });
      continue;
    }
    const count = nodes.length;
    nodes.forEach((n, i) => {
      // Golden-angle spacing avoids the "spokes on a wheel" look of an even split.
      const angle = i * 2.399963 + (type === "skill" ? Math.PI / 5 : 0);
      const jitteredRadius = radius * (0.85 + 0.3 * ((i % 3) / 3));
      positions.set(n.id, {
        id: n.id,
        x: Math.cos(angle) * jitteredRadius,
        y: Math.sin(angle) * jitteredRadius,
      });
      void count;
    });
  }

  relax(data, positions, 120);
  return positions;
}

function relax(data: GraphData, positions: Map<string, LayoutNode>, iterations: number) {
  const ids = data.nodes.map((n) => n.id);
  const minDist = 150;

  for (let iter = 0; iter < iterations; iter++) {
    // Repulsion between every pair (cheap at this node count).
    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const a = positions.get(ids[i])!;
        const b = positions.get(ids[j])!;
        let dx = b.x - a.x;
        let dy = b.y - a.y;
        let dist = Math.hypot(dx, dy) || 0.01;
        if (dist < minDist) {
          const push = (minDist - dist) / dist / 2;
          dx *= push;
          dy *= push;
          if (a.id !== "you") {
            a.x -= dx;
            a.y -= dy;
          }
          if (b.id !== "you") {
            b.x += dx;
            b.y += dy;
          }
        }
      }
    }

    // Mild spring toward edge partners so skill hubs settle near their projects.
    for (const e of data.edges) {
      const a = positions.get(e.from);
      const b = positions.get(e.to);
      if (!a || !b) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const dist = Math.hypot(dx, dy) || 0.01;
      const targetDist = e.kind === "built-with" ? 260 : 320;
      const pull = (dist - targetDist) / dist * 0.02;
      if (a.id !== "you") {
        a.x += dx * pull;
        a.y += dy * pull;
      }
      if (b.id !== "you") {
        b.x -= dx * pull;
        b.y -= dy * pull;
      }
    }
  }
}
