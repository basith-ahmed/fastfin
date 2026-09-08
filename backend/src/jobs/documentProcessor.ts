import type { DocumentStatus, Prisma } from "@prisma/client";

import { GeminiEmbeddingProvider } from "../ai/geminiEmbedding";
import { OpenAIFactExtractionProvider } from "../ai/openaiFactExtractionProvider";
import type {
  EmbeddingProvider,
  FactExtractionProvider,
  RelationshipReasoningProvider,
} from "../ai/types";
import { prisma } from "../config/database";
import { persistGroundedFacts } from "../services/factPersistence";
import {
  extractDocumentFactDrafts,
  type ExtractionCache,
} from "../services/factExtraction";
import { verifyDocumentFactDrafts } from "../services/evidenceVerifier";
import { resolveDocumentFactEntities } from "../services/entityResolver";
import { embedDocumentFacts } from "../services/factEmbedding";
import { parseAndPersistDocument } from "../services/documentParsing";
import { evaluateDocumentRelationships } from "../services/relationshipReasoner";

const noCache: ExtractionCache = {
  get: async () => null,
  set: async () => undefined,
};

export type DocumentProcessingMetrics = {
  pages: number;
  chunks: number;
  factCandidates: number;
  factsAccepted: number;
  factsRejected: number;
  entitiesResolved: number;
  embeddingsGenerated: number;
  candidatePairs: number;
  relationshipsCreated: number;
  issues: number;
  llmCalls: number;
  embeddingCalls: number;
  durationMs: number;
};

type LiveProcessingMetrics = DocumentProcessingMetrics & {
  activity: string;
  chunksProcessed: number;
  chunksTotal: number;
  failedChunks: number;
};

export type DocumentProcessorContext = {
  bullJobId: string;
  attempt: number;
};

export type DocumentProcessorDependencies = {
  extractionProvider?: FactExtractionProvider;
  extractionCache?: ExtractionCache;
  embeddingProvider?: EmbeddingProvider;
  relationshipProvider?: RelationshipReasoningProvider;
  now?: () => Date;
};

function emptyMetrics(): DocumentProcessingMetrics {
  return {
    pages: 0,
    chunks: 0,
    factCandidates: 0,
    factsAccepted: 0,
    factsRejected: 0,
    entitiesResolved: 0,
    embeddingsGenerated: 0,
    candidatePairs: 0,
    relationshipsCreated: 0,
    issues: 0,
    llmCalls: 0,
    embeddingCalls: 0,
    durationMs: 0,
  };
}

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

function liveMetrics(
  metrics: DocumentProcessingMetrics,
  activity: string,
  progress: Partial<Pick<LiveProcessingMetrics, "chunksProcessed" | "chunksTotal" | "failedChunks">> = {},
): LiveProcessingMetrics {
  return {
    ...metrics,
    activity,
    chunksProcessed: progress.chunksProcessed ?? 0,
    chunksTotal: progress.chunksTotal ?? metrics.chunks,
    failedChunks: progress.failedChunks ?? 0,
  };
}

function messageFor(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown document processing failure.";
}

async function updateStage(
  documentId: string,
  processingJobId: string,
  status: DocumentStatus,
  progress: number,
  metrics: DocumentProcessingMetrics,
  activity: string,
): Promise<void> {
  await prisma.$transaction([
    prisma.document.update({ where: { id: documentId }, data: { status } }),
    prisma.processingJob.update({
      where: { id: processingJobId },
      data: { stage: status, progress, metrics: json(liveMetrics(metrics, activity)) },
    }),
  ]);
}

async function recordNormalizationFailure(
  documentId: string,
  chunkId: string,
  error: unknown,
): Promise<void> {
  await prisma.processingIssue.create({
    data: {
      documentId,
      chunkId,
      stage: "NORMALIZING",
      issueType: "NORMALIZATION_FAILURE",
      severity: "WARNING",
      message: "A grounded fact could not be normalized and persisted.",
      metadata: { error: messageFor(error) },
    },
  });
}

async function recordFatalFailure(
  documentId: string,
  processingJobId: string,
  stage: string,
  parseCompleted: boolean,
  error: unknown,
  metrics: DocumentProcessingMetrics,
  now: () => Date,
  startedAt: Date,
): Promise<void> {
  const message = messageFor(error);
  const issueType = stage === "PARSING" && !parseCompleted ? "PDF_PARSE_FAILURE" : "UNKNOWN";
  const finishedAt = now();
  metrics.durationMs = Math.max(0, finishedAt.getTime() - startedAt.getTime());

  await prisma.$transaction([
    prisma.processingIssue.deleteMany({
      where: { documentId, stage, issueType },
    }),
    prisma.processingIssue.create({
      data: {
        documentId,
        stage,
        issueType,
        severity: "ERROR",
        message:
          issueType === "PDF_PARSE_FAILURE"
            ? "The PDF could not be parsed."
            : "Document processing stopped before usable processing could complete.",
        metadata: { error: message },
      },
    }),
    prisma.document.update({
      where: { id: documentId },
      data: { status: "FAILED", processingCompletedAt: finishedAt },
    }),
    prisma.processingJob.update({
      where: { id: processingJobId },
      data: {
        status: "FAILED",
        stage,
        error: message,
        finishedAt,
        metrics: json(metrics),
      },
    }),
  ]);
}

export async function processDocument(
  documentId: string,
  context: DocumentProcessorContext,
  dependencies: DocumentProcessorDependencies = {},
): Promise<DocumentProcessingMetrics> {
  const now = dependencies.now ?? (() => new Date());
  const [document, storedJob] = await Promise.all([
    prisma.document.findUnique({ where: { id: documentId } }),
    prisma.processingJob.findFirst({
      where: { documentId, bullJobId: context.bullJobId },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  if (!document) {
    throw new Error(`Document ${documentId} does not exist.`);
  }
  if (!storedJob) {
    throw new Error(`ProcessingJob for document ${documentId} does not exist.`);
  }

  const startedAt = now();
  const metrics = emptyMetrics();
  let currentStage: DocumentStatus = "PARSING";
  let parseCompleted = false;

  try {
    await prisma.$transaction(async (transaction) => {
      await transaction.processingIssue.deleteMany({ where: { documentId } });
      await transaction.fact.deleteMany({ where: { documentId } });
      await transaction.chunk.deleteMany({ where: { documentId } });
      await transaction.documentPage.deleteMany({ where: { documentId } });
      await transaction.document.update({
        where: { id: documentId },
        data: {
          status: "PARSING",
          pageCount: null,
          processingStartedAt: startedAt,
          processingCompletedAt: null,
        },
      });
      await transaction.processingJob.update({
        where: { id: storedJob.id },
        data: {
          status: "RUNNING",
          stage: "PARSING",
          progress: 5,
          attempt: Math.max(storedJob.attempt, context.attempt),
          startedAt,
          finishedAt: null,
          error: null,
          metrics: json(liveMetrics(metrics, "Parsing PDF pages and building text chunks")),
        },
      });
    });

    const parsing = await parseAndPersistDocument(documentId, document.filePath);
    parseCompleted = true;
    metrics.pages = parsing.pageCount;
    metrics.chunks = parsing.chunkCount;
    if (parsing.chunkCount === 0) {
      throw new Error("The PDF contains no chunks with usable text.");
    }

    currentStage = "EXTRACTING";
    await updateStage(
      documentId,
      storedJob.id,
      currentStage,
      20,
      metrics,
      "Preparing chunks for fact extraction",
    );
    const chunks = await prisma.chunk.findMany({
      where: { documentId },
      select: { id: true, chunkIndex: true, sha256: true, text: true },
      orderBy: { chunkIndex: "asc" },
    });
    const extractionProvider =
      dependencies.extractionProvider ?? new OpenAIFactExtractionProvider();
    const extraction = await extractDocumentFactDrafts(
      documentId,
      chunks,
      extractionProvider,
      dependencies.extractionCache ?? noCache,
      {
        continueOnError: true,
        onProgress: async ({ processed, total, candidatesFound, failedChunks }) => {
          const progress = 20 + Math.round((35 * processed) / total);
          metrics.factCandidates = candidatesFound;
          await prisma.processingJob.update({
            where: { id: storedJob.id },
            data: {
              progress,
              metrics: json(
                liveMetrics(metrics, `Extracted chunk ${processed} of ${total}`, {
                  chunksProcessed: processed,
                  chunksTotal: total,
                  failedChunks,
                }),
              ),
            },
          });
        },
      },
    );
    metrics.factCandidates =
      extraction.eligibleDrafts.length + extraction.lowConfidenceCount;
    metrics.llmCalls = chunks.length;

    const grounded = await verifyDocumentFactDrafts(
      documentId,
      extraction.eligibleDrafts,
      extractionProvider.model,
    );
    metrics.factsRejected =
      extraction.lowConfidenceCount + extraction.eligibleDrafts.length - grounded.length;

    currentStage = "NORMALIZING";
    await updateStage(
      documentId,
      storedJob.id,
      currentStage,
      55,
      metrics,
      "Verifying evidence and normalizing accepted facts",
    );
    await prisma.processingIssue.deleteMany({
      where: { documentId, stage: "NORMALIZING", issueType: "NORMALIZATION_FAILURE" },
    });
    for (const [index, groundedFact] of grounded.entries()) {
      try {
        const persisted = await persistGroundedFacts(documentId, [groundedFact]);
        metrics.factsAccepted += persisted.createdCount;
        metrics.factsRejected += persisted.duplicateCount;
      } catch (error: unknown) {
        metrics.factsRejected += 1;
        await recordNormalizationFailure(documentId, groundedFact.chunkId, error);
      }
      const progress = 55 + Math.round((10 * (index + 1)) / grounded.length);
      await prisma.processingJob.update({
        where: { id: storedJob.id },
        data: {
          progress,
          metrics: json(liveMetrics(metrics, `Normalized fact ${index + 1} of ${grounded.length}`)),
        },
      });
    }

    currentStage = "RESOLVING_ENTITIES";
    await updateStage(documentId, storedJob.id, currentStage, 65, metrics, "Resolving fact subjects to entities");
    const entities = await resolveDocumentFactEntities(documentId);
    metrics.entitiesResolved = entities.resolvedCount;
    await prisma.processingJob.update({
      where: { id: storedJob.id },
      data: { progress: 75, metrics: json(liveMetrics(metrics, "Entity resolution complete")) },
    });

    currentStage = "EMBEDDING";
    await updateStage(documentId, storedJob.id, currentStage, 75, metrics, "Generating fact embeddings");
    const embeddings = await embedDocumentFacts(
      documentId,
      dependencies.embeddingProvider ?? new GeminiEmbeddingProvider(),
    );
    metrics.embeddingsGenerated = embeddings.embeddedCount;
    metrics.embeddingCalls = embeddings.embeddedCount;
    await prisma.processingJob.update({
      where: { id: storedJob.id },
      data: { progress: 82, metrics: json(liveMetrics(metrics, "Fact embeddings complete")) },
    });

    currentStage = "MATCHING";
    await updateStage(documentId, storedJob.id, currentStage, 82, metrics, "Finding cross-document fact candidates");
    currentStage = "REASONING";
    await updateStage(documentId, storedJob.id, currentStage, 90, metrics, "Classifying candidate relationships");
    const relationships = await evaluateDocumentRelationships(
      documentId,
      dependencies.relationshipProvider,
    );
    metrics.candidatePairs = relationships.candidatesEvaluated;
    metrics.relationshipsCreated = relationships.relationshipsCreated;
    await prisma.processingJob.update({
      where: { id: storedJob.id },
      data: { progress: 98, metrics: json(liveMetrics(metrics, "Finalizing processing results")) },
    });

    metrics.issues = await prisma.processingIssue.count({ where: { documentId } });
    const finishedAt = now();
    metrics.durationMs = Math.max(0, finishedAt.getTime() - startedAt.getTime());
    const completionStatus: DocumentStatus =
      metrics.issues === 0 ? "COMPLETED" : "COMPLETED_WITH_ISSUES";
    await prisma.$transaction([
      prisma.document.update({
        where: { id: documentId },
        data: { status: completionStatus, processingCompletedAt: finishedAt },
      }),
      prisma.processingJob.update({
        where: { id: storedJob.id },
        data: {
          status: completionStatus,
          stage: completionStatus,
          progress: 100,
          finishedAt,
          metrics: json(metrics),
        },
      }),
    ]);
    return metrics;
  } catch (error: unknown) {
    await recordFatalFailure(
      documentId,
      storedJob.id,
      currentStage,
      parseCompleted,
      error,
      metrics,
      now,
      startedAt,
    );
    throw error;
  }
}
