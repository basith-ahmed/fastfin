import type { Fact } from "@/types/fact";

export type RelationshipType =
  | "CORROBORATES"
  | "CONTRADICTS"
  | "RECONCILABLE"
  | "UNCERTAIN";

export type Relationship = {
  id: string;
  leftFactId: string;
  rightFactId: string;
  relationshipType: RelationshipType;
  confidence: number;
  explanation: string;
  contextComparison: unknown;
  ruleSignals: unknown;
  decisionMethod: string;
  modelName: string | null;
  promptVersion: string;
  createdAt: string;
  leftFact: Fact;
  rightFact: Fact;
};

export type RelationshipDetail = {
  relationship: Omit<Relationship, "leftFact" | "rightFact">;
  leftFact: Omit<Fact, "document" | "evidence">;
  leftDocument: import("@/types/document").DocumentMetadata;
  leftEvidence: import("@/types/fact").Evidence[];
  rightFact: Omit<Fact, "document" | "evidence">;
  rightDocument: import("@/types/document").DocumentMetadata;
  rightEvidence: import("@/types/fact").Evidence[];
  contextComparison: unknown;
  ruleSignals: unknown;
  classification: RelationshipType;
  confidence: number;
  explanation: string;
  decisionMethod: string;
};
