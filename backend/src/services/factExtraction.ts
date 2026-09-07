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
  options: { concurrency?: number; minimumConfidence?: number } = {},
): Promise<DocumentFactExtractionResult> {
  const concurrency = options.concurrency ?? env.LLM_MAX_CONCURRENCY;
  const minimumConfidence = options.minimumConfidence ?? env.FACT_MIN_CONFIDENCE;
  if (!Number.isInteger(concurrency) || concurrency <= 0) {
    throw new Error("Fact extraction concurrency must be a positive integer.");
  }
  if (minimumConfidence < 0 || minimumConfidence > 1) {
    throw new Error("Fact extraction minimum confidence must be between 0 and 1.");
  }

  const extractedByChunk = await mapWithConcurrency(chunks, concurrency, (chunk) =>
    extractChunk(documentId, chunk, provider, cache),
  );
  const extracted = extractedByChunk.flatMap((drafts, index) => {
    const chunk = chunks[index];
    if (!chunk) {
      return [];
    }
    return drafts.map((draft) => ({ chunkId: chunk.id, chunkIndex: chunk.chunkIndex, draft }));
  });
  const eligibleDrafts = extracted.filter(({ draft }) => draft.confidence >= minimumConfidence);
  const lowConfidenceDrafts = extracted.filter(({ draft }) => draft.confidence < minimumConfidence);

  await prisma.$transaction(async (transaction) => {
    await transaction.processingIssue.deleteMany({
      where: { documentId, stage: "EXTRACTING", issueType: "LOW_FACT_CONFIDENCE" },
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
  });

  return { eligibleDrafts, lowConfidenceCount: lowConfidenceDrafts.length };
}
