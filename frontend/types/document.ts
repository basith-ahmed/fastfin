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
  metrics: ProcessingMetrics;
  startedAt: string | null;
  finishedAt: string | null;
};

export type ProcessingMetrics = Record<string, unknown> & {
  activity?: string;
  pages?: number;
  chunks?: number;
  chunksProcessed?: number;
  chunksTotal?: number;
  failedChunks?: number;
  factCandidates?: number;
  factsAccepted?: number;
  factsRejected?: number;
  entitiesResolved?: number;
  embeddingsGenerated?: number;
  candidatePairs?: number;
  relationshipsCreated?: number;
  issues?: number;
  llmCalls?: number;
  durationMs?: number;
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
  metrics?: ProcessingMetrics;
};

export type DocumentMetadata = Pick<
  DocumentRecord,
  "id" | "originalFilename" | "mimeType" | "pageCount" | "status" | "createdAt" | "updatedAt"
>;
