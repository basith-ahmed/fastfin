import type { DocumentMetadata } from "@/types/document";

export type Entity = {
  id: string;
  canonicalName: string;
  normalizedName: string;
  entityType: string;
};

export type Evidence = {
  id: string;
  documentId: string;
  pageNumber: number;
  quote: string;
  contextBefore: string;
  contextAfter: string;
  boundingBoxes: unknown;
  verificationMethod: string;
  verificationScore: number;
};

export type Fact = {
  id: string;
  documentId: string;
  entityId: string | null;
  subjectRaw: string;
  subjectNormalized: string;
  predicateRaw: string;
  predicateCanonical: string;
  valueRaw: string;
  valueType: string;
  normalizedText: string | null;
  normalizedNumber: string | null;
  normalizedDate: string | null;
  unit: string | null;
  currency: string | null;
  qualifiers: unknown;
  normalizedContext: unknown;
  confidence: number;
  extractionMethod: string;
  entity: Entity | null;
  document: DocumentMetadata;
  evidence: Evidence[];
  relationshipsSummary?: {
    total: number;
    byType: Record<import("@/types/relationship").RelationshipType, number>;
  };
};
