export type NodeType = "you" | "project" | "skill" | "experience" | "contact";
export type SkillCategory = "language" | "framework" | "database" | "platform" | "tool";
export type EdgeKind = "built-with" | "worked-at" | "related";

export interface GraphLink {
  label: string;
  url: string;
}

export interface GraphField {
  label: string;
  value: string;
}

export interface GraphNode {
  id: string;
  type: NodeType;
  title: string;
  subtitle?: string;
  summary?: string;
  fields?: GraphField[];
  links?: GraphLink[];
  tags?: string[];
  category?: SkillCategory;
  photo?: string;
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
