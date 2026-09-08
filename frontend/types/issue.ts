import type { DocumentMetadata } from "@/types/document";
import type { Fact } from "@/types/fact";

export type IssueSeverity = "INFO" | "WARNING" | "ERROR";

export type ProcessingIssue = {
  id: string;
  documentId: string;
  chunkId: string | null;
  factId: string | null;
  stage: string;
  issueType: string;
  severity: IssueSeverity;
  message: string;
  metadata: unknown;
  createdAt: string;
  document: DocumentMetadata;
  fact?: Partial<Fact> | null;
};
