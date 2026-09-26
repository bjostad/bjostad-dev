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
  /** "you" node only: availability, location, etc., shown under the name. */
  status?: string[];
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

/**
 * A hand-picked view of the graph for one kind of role (frontend,
 * backend, …): the header's lens chips light up these projects, in rank
 * order, and these skill attributes on "you"'s card.
 */
export interface GraphLens {
  id: string;
  label: string;
  blurb?: string;
  /** Attribute ids (skill-…), in the order they should be read. */
  skills: string[];
  /** Project ids, strongest first. */
  projects: string[];
}

/**
 * What the canvas and list view highlight while nothing is hovered or
 * pinned: a lens, or the results of a skill search. Ranked focuses number
 * their projects on the cards; search results are unranked.
 */
export interface Focus {
  label: string;
  projects: string[];
  skills: string[];
  ranked: boolean;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
  lenses: GraphLens[];
}
