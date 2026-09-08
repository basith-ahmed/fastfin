import { Prisma } from "@prisma/client";

import { extractNumericalCandidates } from "../ai/numericalCandidateExtractor";
import { factDraftArraySchema, type FactDraft, type FactExtractionProvider } from "../ai/types";
import { env } from "../config/env";
import { prisma } from "../config/database";

export type ExtractionCache = {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<unknown>;
};

export type ExtractionChunk = {
  id: string;
  chunkIndex: number;
  sha256: string;
  text: string;
};

export type ExtractedFactDraft = {
  chunkId: string;
  chunkIndex: number;
  draft: FactDraft;
};

export type DocumentFactExtractionResult = {
  eligibleDrafts: ExtractedFactDraft[];
  lowConfidenceCount: number;
};

export function factExtractionCacheKey(
  promptVersion: string,
  model: string,
  chunkSha: string,
): string {
  return `fact-extraction:${promptVersion}:${model}:${chunkSha}`;
}

async function extractChunk(
  documentId: string,
  chunk: ExtractionChunk,
  provider: FactExtractionProvider,
  cache: ExtractionCache,
): Promise<FactDraft[]> {
  const cacheKey = factExtractionCacheKey(provider.promptVersion, provider.model, chunk.sha256);
  const cached = await cache.get(cacheKey);
  if (cached !== null) {
    try {
      return factDraftArraySchema.parse(JSON.parse(cached) as unknown);
    } catch {
      // Invalid cache data is ignored and replaced only after a validated provider response.
    }
  }

  const drafts = factDraftArraySchema.parse(
    await provider.extractFacts({
      documentId,
      chunkSha: chunk.sha256,
      chunkText: chunk.text,
      numericalCandidates: extractNumericalCandidates(chunk.text),
    }),
  );
  await cache.set(cacheKey, JSON.stringify(drafts));
  return drafts;
}

async function mapWithConcurrency<T, R>(
  values: T[],
  concurrency: number,
  task: (value: T) => Promise<R>,
): Promise<R[]> {
  const results = new Array<R>(values.length);
  let nextIndex = 0;

  const worker = async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      const value = values[index];
      if (value !== undefined) {
        results[index] = await task(value);
      }
    }
  };

  const workerCount = Math.min(concurrency, values.length);
  await Promise.all(Array.from({ length: workerCount }, worker));
  return results;
}

export async function extractDocumentFactDrafts(
  documentId: string,
  chunks: ExtractionChunk[],
  provider: FactExtractionProvider,
  cache: ExtractionCache,
  options: {
    concurrency?: number;
    minimumConfidence?: number;
    continueOnError?: boolean;
    onProgress?: (processed: number, total: number) => Promise<void> | void;
  } = {},
): Promise<DocumentFactExtractionResult> {
  const concurrency = options.concurrency ?? env.LLM_MAX_CONCURRENCY;
  const minimumConfidence = options.minimumConfidence ?? env.FACT_MIN_CONFIDENCE;
  if (!Number.isInteger(concurrency) || concurrency <= 0) {
    throw new Error("Fact extraction concurrency must be a positive integer.");
  }
  if (minimumConfidence < 0 || minimumConfidence > 1) {
    throw new Error("Fact extraction minimum confidence must be between 0 and 1.");
  }

  let processed = 0;
  let progressUpdates = Promise.resolve();
  const extractedByChunk = await mapWithConcurrency(chunks, concurrency, async (chunk) => {
    try {
      return { chunk, drafts: await extractChunk(documentId, chunk, provider, cache), error: null };
    } catch (error: unknown) {
      if (!options.continueOnError) {
        throw error;
      }
      return { chunk, drafts: [], error };
    } finally {
      processed += 1;
      if (options.onProgress) {
        const completed = processed;
        progressUpdates = progressUpdates.then(() => options.onProgress?.(completed, chunks.length));
        await progressUpdates;
      }
    }
  });
  const extracted = extractedByChunk.flatMap(({ chunk, drafts }) =>
    drafts.map((draft) => ({ chunkId: chunk.id, chunkIndex: chunk.chunkIndex, draft })),
  );
  const eligibleDrafts = extracted.filter(({ draft }) => draft.confidence >= minimumConfidence);
  const lowConfidenceDrafts = extracted.filter(({ draft }) => draft.confidence < minimumConfidence);
  const failedChunks = extractedByChunk.filter(
    (result): result is typeof result & { error: unknown } => result.error !== null,
  );

  await prisma.$transaction(async (transaction) => {
    await transaction.processingIssue.deleteMany({
      where: {
        documentId,
        stage: "EXTRACTING",
        issueType: { in: ["LOW_FACT_CONFIDENCE", "LLM_REQUEST_FAILURE"] },
      },
    });
    if (lowConfidenceDrafts.length > 0) {
      await transaction.processingIssue.createMany({
        data: lowConfidenceDrafts.map(({ chunkId, draft }) => ({
          documentId,
          chunkId,
          stage: "EXTRACTING",
          issueType: "LOW_FACT_CONFIDENCE",
          severity: "INFO",
          message: "A fact candidate was below the automatic processing confidence threshold.",
          metadata: {
            confidence: draft.confidence,
            threshold: minimumConfidence,
            subject: draft.subject.text,
            predicate: draft.predicate.canonical,
            value: draft.value.raw,
          } as Prisma.InputJsonValue,
        })),
      });
    }
    if (failedChunks.length > 0) {
      await transaction.processingIssue.createMany({
        data: failedChunks.map(({ chunk, error }) => ({
          documentId,
          chunkId: chunk.id,
          stage: "EXTRACTING",
          issueType: "LLM_REQUEST_FAILURE" as const,
          severity: "ERROR" as const,
          message: "Fact extraction failed for this chunk after provider retries.",
          metadata: {
            chunkIndex: chunk.chunkIndex,
            model: provider.model,
            error: error instanceof Error ? error.message : "Unknown fact extraction failure.",
          } as Prisma.InputJsonValue,
        })),
      });
    }
  });

  return {
    eligibleDrafts,
    lowConfidenceCount: lowConfidenceDrafts.length,
  };
}
