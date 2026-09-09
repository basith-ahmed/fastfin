import { Prisma, type Fact } from "@prisma/client";
import { z } from "zod";

import { GeminiEmbeddingProvider, validateEmbedding } from "../ai/geminiEmbedding";
import type { EmbeddingProvider } from "../ai/types";
import { prisma } from "../config/database";
import { env } from "../config/env";
import { workerLogger } from "../utils/logger";

const UNRESOLVED_SUBJECT_THRESHOLD = 0.85;
const UNRESOLVED_VECTOR_THRESHOLD_BONUS = 0.1;

const embeddingSchema = z.array(z.number().finite()).length(env.EMBEDDING_DIMENSIONS);

const factEmbeddingInputSchema = z.object({
  factId: z.uuid(),
  comparisonText: z.string().trim().min(1).max(8_000),
  embedding: embeddingSchema,
  model: z.string().trim().min(1),
});

const retrievalOptionsSchema = z.object({
  topK: z.number().int().positive().optional(),
  similarityThreshold: z.number().min(0).max(1).optional(),
});

export type CreateFactEmbeddingInput = z.input<typeof factEmbeddingInputSchema>;

export type FactComparisonInput = Pick<
  Fact,
  | "subjectRaw"
  | "subjectNormalized"
  | "predicateCanonical"
  | "valueType"
  | "normalizedContext"
> & {
  entity: { canonicalName: string } | null;
};

export type EmbedFactResult = {
  factId: string;
  comparisonText: string;
  cached: boolean;
};

export type EmbedDocumentFactsResult = {
  embeddedCount: number;
  cachedCount: number;
  issueCount: number;
};

export type CandidateMatchReason =
  | "ENTITY_PREDICATE"
  | "ENTITY_VECTOR"
  | "UNRESOLVED_SUBJECT_VECTOR";

export type CandidateFact = {
  factId: string;
  fact: Fact;
  cosineDistance: number;
  similarity: number;
  matchReason: CandidateMatchReason;
};

type CandidateRow = {
  factId: string;
  cosineDistance: number;
  directPredicateMatch: boolean;
  unresolvedSubjectMatch: boolean;
};

function isRecord(value: Prisma.JsonValue): value is Prisma.JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function contextLabel(context: Prisma.JsonValue, key: "time" | "scope"): string {
  if (!isRecord(context)) {
    return "unspecified";
  }
  const value = context[key];
  if (typeof value === "string" && value.trim().length > 0) {
    return value.trim();
  }
  if (key === "time" && value !== undefined && isRecord(value)) {
    const label = value.label;
    if (typeof label === "string" && label.trim().length > 0) {
      return label.trim();
    }
  }
  return "unspecified";
}

export function buildFactComparisonText(fact: FactComparisonInput): string {
  const entity = fact.entity?.canonicalName.trim() || fact.subjectNormalized.trim();
  const predicate = fact.predicateCanonical.trim();
  if (!entity || !predicate) {
    throw new Error("A fact needs an entity and predicate before it can be embedded.");
  }

  return [
    "Task: identify facts that describe the same entity property for cross-document comparison.",
    `Entity: ${entity}`,
    `Predicate: ${predicate}`,
    `Value type: ${fact.valueType}`,
    `Period: ${contextLabel(fact.normalizedContext, "time")}`,
    `Scope: ${contextLabel(fact.normalizedContext, "scope")}`,
  ].join("\n");
}

export async function createFactEmbedding(input: CreateFactEmbeddingInput): Promise<void> {
  const validated = factEmbeddingInputSchema.parse(input);
  const vectorLiteral = `[${validated.embedding.join(",")}]`;

  await prisma.$executeRaw(Prisma.sql`
    INSERT INTO "fact_embeddings" (
      "fact_id",
      "comparison_text",
      "embedding",
      "model",
      "dimensions"
    ) VALUES (
      ${validated.factId}::uuid,
      ${validated.comparisonText},
      ${vectorLiteral}::vector,
      ${validated.model},
      ${env.EMBEDDING_DIMENSIONS}
    )
    ON CONFLICT ("fact_id") DO UPDATE SET
      "comparison_text" = EXCLUDED."comparison_text",
      "embedding" = EXCLUDED."embedding",
      "model" = EXCLUDED."model",
      "dimensions" = EXCLUDED."dimensions",
      "created_at" = CURRENT_TIMESTAMP
  `);
}

export async function embedFact(
  factId: string,
  provider?: EmbeddingProvider,
): Promise<EmbedFactResult> {
  const fact = await prisma.fact.findUnique({
    where: { id: factId },
    include: { entity: { select: { canonicalName: true } } },
  });
  if (!fact) {
    throw new Error(`Fact ${factId} was not found.`);
  }

  const comparisonText = buildFactComparisonText(fact);
  const embeddingProvider = provider ?? new GeminiEmbeddingProvider();
  if (embeddingProvider.dimensions !== env.EMBEDDING_DIMENSIONS) {
    throw new Error(`Embedding provider must produce ${env.EMBEDDING_DIMENSIONS} dimensions.`);
  }

  const cached = await prisma.factEmbedding.findUnique({
    where: { factId },
    select: { comparisonText: true, model: true, dimensions: true },
  });
  if (
    cached?.comparisonText === comparisonText &&
    cached.model === embeddingProvider.model &&
    cached.dimensions === embeddingProvider.dimensions
  ) {
    return { factId, comparisonText, cached: true };
  }

  const embedding = validateEmbedding(
    await embeddingProvider.embed(comparisonText),
    env.EMBEDDING_DIMENSIONS,
  );
  await createFactEmbedding({
    factId,
    comparisonText,
    embedding,
    model: embeddingProvider.model,
  });
  return { factId, comparisonText, cached: false };
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown embedding failure.";
}

export async function embedDocumentFacts(
  documentId: string,
  provider?: EmbeddingProvider,
): Promise<EmbedDocumentFactsResult> {
  const embeddingProvider = provider ?? new GeminiEmbeddingProvider();
  const facts = await prisma.fact.findMany({
    where: { documentId },
    select: { id: true },
    orderBy: { createdAt: "asc" },
  });
  let embeddedCount = 0;
  let cachedCount = 0;
  let issueCount = 0;

  workerLogger.info(
    { documentId, factCount: facts.length, model: embeddingProvider.model },
    "Starting document fact embedding",
  );
  for (const [index, fact] of facts.entries()) {
    const startedAt = Date.now();
    workerLogger.info(
      { documentId, factId: fact.id, fact: `${index + 1}/${facts.length}`, model: embeddingProvider.model },
      "Generating embedding for fact",
    );
    try {
      const result = await embedFact(fact.id, embeddingProvider);
      if (result.cached) {
        cachedCount += 1;
      } else {
        embeddedCount += 1;
      }
      await prisma.processingIssue.deleteMany({
        where: { factId: fact.id, stage: "EMBEDDING", issueType: "EMBEDDING_FAILURE" },
      });
      workerLogger.info(
        {
          documentId,
          factId: fact.id,
          fact: `${index + 1}/${facts.length}`,
          cached: result.cached,
          durationMs: Date.now() - startedAt,
        },
        result.cached ? "Using cached fact embedding" : "Fact embedding generated and persisted",
      );
    } catch (error: unknown) {
      issueCount += 1;
      workerLogger.error(
        { err: error, documentId, factId: fact.id, fact: `${index + 1}/${facts.length}` },
        "Fact embedding failed",
      );
      await prisma.processingIssue.deleteMany({
        where: { factId: fact.id, stage: "EMBEDDING", issueType: "EMBEDDING_FAILURE" },
      });
      await prisma.processingIssue.create({
        data: {
          documentId,
          factId: fact.id,
          stage: "EMBEDDING",
          issueType: "EMBEDDING_FAILURE",
          severity: "ERROR",
          message: errorMessage(error),
          metadata: { model: embeddingProvider.model },
        },
      });
    }
  }

  return { embeddedCount, cachedCount, issueCount };
}

export async function retrieveFactCandidates(
  factId: string,
  options: { topK?: number; similarityThreshold?: number } = {},
): Promise<CandidateFact[]> {
  const validatedOptions = retrievalOptionsSchema.parse(options);
  const topK = validatedOptions.topK ?? env.CANDIDATE_TOP_K;
  const similarityThreshold =
    validatedOptions.similarityThreshold ?? env.CANDIDATE_VECTOR_THRESHOLD;
  const maximumDistance = 1 - similarityThreshold;
  const unresolvedVectorThreshold = Math.min(
    1,
    similarityThreshold + UNRESOLVED_VECTOR_THRESHOLD_BONUS,
  );

  const sourceEmbedding = await prisma.factEmbedding.findUnique({
    where: { factId },
    select: { factId: true },
  });
  if (!sourceEmbedding) {
    throw new Error(`Fact ${factId} does not have an embedding.`);
  }

  const rows = await prisma.$queryRaw<CandidateRow[]>(Prisma.sql`
    WITH source AS (
      SELECT f.*, fe.embedding AS source_embedding
      FROM facts f
      JOIN fact_embeddings fe ON fe.fact_id = f.id
      WHERE f.id = ${factId}::uuid
    )
    SELECT
      candidate.id AS "factId",
      (candidate_embedding.embedding <=> source.source_embedding)::double precision
        AS "cosineDistance",
      (
        source.entity_id IS NOT NULL
        AND candidate.entity_id = source.entity_id
        AND candidate.predicate_canonical = source.predicate_canonical
      ) AS "directPredicateMatch",
      (source.entity_id IS NULL) AS "unresolvedSubjectMatch"
    FROM source
    JOIN facts candidate ON candidate.document_id <> source.document_id
    JOIN fact_embeddings candidate_embedding ON candidate_embedding.fact_id = candidate.id
    WHERE
      (
        source.entity_id IS NOT NULL
        AND candidate.entity_id = source.entity_id
        AND (
          candidate.predicate_canonical = source.predicate_canonical
          OR (
            candidate.value_type = source.value_type
            AND (candidate_embedding.embedding <=> source.source_embedding) <= ${maximumDistance}
          )
        )
      )
      OR
      (
        source.entity_id IS NULL
        AND similarity(candidate.subject_normalized, source.subject_normalized)
          >= ${UNRESOLVED_SUBJECT_THRESHOLD}
        AND candidate.value_type = source.value_type
        AND (1 - (candidate_embedding.embedding <=> source.source_embedding))
          >= ${unresolvedVectorThreshold}
      )
    ORDER BY "directPredicateMatch" DESC, "cosineDistance" ASC, candidate.created_at ASC
    LIMIT ${topK}
  `);

  if (rows.length === 0) {
    return [];
  }
  const facts = await prisma.fact.findMany({ where: { id: { in: rows.map((row) => row.factId) } } });
  const factsById = new Map(facts.map((fact) => [fact.id, fact]));

  return rows.flatMap((row) => {
    const fact = factsById.get(row.factId);
    if (!fact) {
      return [];
    }
    return [
      {
        factId: row.factId,
        fact,
        cosineDistance: row.cosineDistance,
        similarity: 1 - row.cosineDistance,
        matchReason: row.directPredicateMatch
          ? "ENTITY_PREDICATE"
          : row.unresolvedSubjectMatch
            ? "UNRESOLVED_SUBJECT_VECTOR"
            : "ENTITY_VECTOR",
      },
    ];
  });
}
