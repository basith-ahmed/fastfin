export type DocumentStatus =
  | "UPLOADED"
  | "QUEUED"
  | "PARSING"
  | "EXTRACTING"
  | "NORMALIZING"
  | "RESOLVING_ENTITIES"
  | "EMBEDDING"
  | "MATCHING"
  | "REASONING"
  | "COMPLETED"
  | "COMPLETED_WITH_ISSUES"
  | "FAILED";

export type ProcessingJob = {
  id: string;
  stage: string;
  progress: number;
  attempt: number;
  status: string;
  error: string | null;
  metrics: Record<string, unknown>;
  startedAt: string | null;
  finishedAt: string | null;
};

export type DocumentRecord = {
  id: string;
  filename: string;
  originalFilename: string;
  mimeType: string;
  sha256: string;
  fileSizeBytes: number;
  pageCount: number | null;
  status: DocumentStatus;
  processingStartedAt: string | null;
  processingCompletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  counts?: { facts: number; relationships: number; issues: number };
  latestProcessingJob?: ProcessingJob | null;
  metrics?: Record<string, unknown>;
};

export type DocumentMetadata = Pick<
  DocumentRecord,
  "id" | "originalFilename" | "mimeType" | "pageCount" | "status" | "createdAt" | "updatedAt"
>;
