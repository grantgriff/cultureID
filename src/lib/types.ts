export type AnalysisMode = "hire" | "customer" | "employer";

export type NetworkRole =
  | "hub"
  | "broker"
  | "boundary_spanner"
  | "gatekeeper"
  | "peripheral"
  | "isolate";

export type RelationshipType = "direct" | "indirect" | "inferred";
export type EdgeStrength = "strong" | "moderate" | "weak" | "inferred";
export type Severity = "low" | "medium" | "high";
export type Density = "sparse" | "moderate" | "dense";
export type Centralization =
  | "decentralized"
  | "moderate"
  | "highly_centralized";

export interface AnalysisInput {
  name: string;
  company?: string;
  title?: string;
  mode: AnalysisMode;
}

export interface NetworkNode {
  id: string;
  name: string;
  company: string;
  title: string;
  role: NetworkRole;
  centrality_score: number;
  cluster_id: string;
  relationship_to_target: RelationshipType;
}

export interface NetworkEdge {
  source: string;
  target: string;
  strength: EdgeStrength;
  evidence: string;
}

export interface NetworkCluster {
  id: string;
  label: string;
  node_ids: string[];
}

export interface CulturalDimension {
  score: number;
  evidence: string[];
}

export interface RiskFlag {
  flag: string;
  severity: Severity;
  evidence: string;
}

export interface AnalysisResult {
  target: {
    name: string;
    title: string;
    company: string;
    profile_url: string;
  };
  network: {
    nodes: NetworkNode[];
    edges: NetworkEdge[];
    clusters: NetworkCluster[];
  };
  structure_metrics: {
    density: Density;
    centralization: Centralization;
    most_central_node: string;
    key_brokers: string[];
  };
  cultural_signals: {
    pace_intensity: CulturalDimension;
    collaboration: CulturalDimension;
    work_life: CulturalDimension;
    values_detected: string[];
  };
  risk_flags: RiskFlag[];
  recommendations: string[];
  data_limitations: string[];
  report_markdown: string;
}

export type AnalysisStage =
  | "idle"
  | "searching"
  | "mapping"
  | "analyzing"
  | "generating"
  | "complete"
  | "error";
