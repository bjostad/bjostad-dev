export type NodeType = "you" | "project" | "experience" | "contact";
export type SkillCategory = "language" | "framework" | "database" | "platform" | "tool";
export type EdgeKind = "built-with" | "worked-at" | "related";

export interface GraphLink {
  label: string;
  url: string;
}

export interface Screenshot {
  /** Path to an image in /public, e.g. "/screenshots/gebo.webp". */
  src: string;
  caption?: string;
}

export interface GraphField {
  label: string;
  value: string;
}

/**
 * A skill promoted to attribute status (used by 2+ projects) — rendered
 * as a field row on the "you" entity card, ER-style, rather than as its
 * own node. Edges reference it by `id` the same way they'd reference a
 * node id.
 */
export interface GraphAttribute {
  id: string;
  label: string;
  category?: SkillCategory;
}

export interface GraphNode {
  id: string;
  type: NodeType;
  title: string;
  subtitle?: string;
  summary?: string;
  highlights?: string[];
  /** A few short phrases shown directly on the graph card. */
  cardHighlights?: string[];
  /** Project detail section media: an embeddable live demo URL wins over screenshots. */
  demoUrl?: string;
  screenshots?: Screenshot[];
  fields?: GraphField[];
  links?: GraphLink[];
  tags?: string[];
  category?: SkillCategory;
  photo?: string;
  /** "you" node only — see GraphAttribute. */
  attributes?: GraphAttribute[];
  /** Default layout hint, roughly -1..1 on each axis; canvas scales to viewport. */
  position?: { x: number; y: number };
}

export interface GraphEdge {
  from: string;
  to: string;
  kind: EdgeKind;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}
