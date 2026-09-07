import { Prisma, type Entity, type EntityAlias, type EntityType } from "@prisma/client";

import { prisma } from "../config/database";

const DEFAULT_SIMILARITY_THRESHOLD = 0.85;
const DEFAULT_CANDIDATE_LIMIT = 5;

const ORGANIZATION_SUFFIXES = [
  ["private", "limited"],
  ["pvt", "limited"],
  ["pvt", "ltd"],
  ["public", "limited"],
  ["incorporated"],
  ["corporation"],
  ["company"],
  ["limited"],
  ["llc"],
  ["corp"],
  ["ltd"],
  ["inc"],
  ["co"],
] as const;

export type EntityMatchMethod = "ALIAS_EXACT" | "CANONICAL_EXACT" | "TRIGRAM" | "CREATED";

export type EntityCandidate = Entity & {
  aliases: EntityAlias[];
  similarity: number;
};

export type EntityResolutionInput = {
  subject: string;
  entityType: EntityType;
  documentId?: string | null;
};

export type EntityResolutionResult = {
  entity: Entity;
  matchMethod: EntityMatchMethod;
  similarity: number;
  aliasLearned: boolean;
};

export type DocumentEntityResolutionResult = {
  resolvedCount: number;
  createdCount: number;
  matchedCount: number;
  issueCount: number;
};

function displayName(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ");
}

function hasSuffix(tokens: string[], suffix: readonly string[]): boolean {
  if (suffix.length > tokens.length) {
    return false;
  }
  return suffix.every((token, index) => token === tokens[tokens.length - suffix.length + index]);
}

export function normalizeEntityName(value: string, entityType?: EntityType): string {
  const normalized = displayName(value)
    .toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim()
    .replace(/\s+/gu, " ");
  const tokens = normalized.length > 0 ? normalized.split(" ") : [];

  if (entityType === undefined || entityType === "ORGANIZATION") {
    let removedSuffix = true;
    while (tokens.length > 0 && removedSuffix) {
      removedSuffix = false;
      for (const suffix of ORGANIZATION_SUFFIXES) {
        if (hasSuffix(tokens, suffix)) {
          tokens.splice(tokens.length - suffix.length, suffix.length);
          removedSuffix = true;
          break;
        }
      }
    }
  }

  return tokens.join(" ");
}

type SimilarityRow = {
  id: string;
  similarity: number;
};

export async function findEntityCandidates(
  normalizedName: string,
  entityType: EntityType,
  limit = DEFAULT_CANDIDATE_LIMIT,
): Promise<EntityCandidate[]> {
  if (!Number.isInteger(limit) || limit <= 0) {
    throw new Error("Entity candidate limit must be a positive integer.");
  }

  const rows = await prisma.$queryRaw<SimilarityRow[]>(Prisma.sql`
    SELECT
      e.id,
      GREATEST(
        similarity(e.normalized_name, ${normalizedName}),
        COALESCE(MAX(similarity(a.normalized_alias, ${normalizedName})), 0)
      )::double precision AS similarity
    FROM entities e
    LEFT JOIN entity_aliases a ON a.entity_id = e.id
    WHERE e.entity_type = ${entityType}::"EntityType"
    GROUP BY e.id, e.normalized_name
    ORDER BY similarity DESC, e.created_at ASC
    LIMIT ${limit}
  `);
  if (rows.length === 0) {
    return [];
  }

  const entities = await prisma.entity.findMany({
    where: { id: { in: rows.map(({ id }) => id) } },
    include: { aliases: { orderBy: { createdAt: "asc" } } },
  });
  const entitiesById = new Map(entities.map((entity) => [entity.id, entity]));
  return rows.flatMap((row) => {
    const entity = entitiesById.get(row.id);
    return entity ? [{ ...entity, similarity: row.similarity }] : [];
  });
}

async function learnAlias(
  entity: Entity,
  input: EntityResolutionInput,
  normalizedAlias: string,
  confidence: number,
): Promise<boolean> {
  const existing = await prisma.entityAlias.findUnique({
    where: {
      entityId_normalizedAlias: {
        entityId: entity.id,
        normalizedAlias,
      },
    },
  });
  if (existing) {
    return false;
  }

  await prisma.entityAlias.upsert({
    where: {
      entityId_normalizedAlias: {
        entityId: entity.id,
        normalizedAlias,
      },
    },
    update: {},
    create: {
      entityId: entity.id,
      alias: displayName(input.subject),
      normalizedAlias,
      documentId: input.documentId ?? null,
      confidence,
    },
  });
  return true;
}

async function matchedResult(
  entity: Entity,
  input: EntityResolutionInput,
  normalizedName: string,
  matchMethod: Exclude<EntityMatchMethod, "CREATED">,
  similarity: number,
): Promise<EntityResolutionResult> {
  const aliasLearned = await learnAlias(entity, input, normalizedName, similarity);
  return { entity, matchMethod, similarity, aliasLearned };
}

export async function resolveEntity(
  input: EntityResolutionInput,
  options: { similarityThreshold?: number } = {},
): Promise<EntityResolutionResult> {
  const normalizedName = normalizeEntityName(input.subject, input.entityType);
  if (normalizedName.length === 0) {
    throw new Error("Entity subject does not contain a meaningful name.");
  }

  const alias = await prisma.entityAlias.findFirst({
    where: { normalizedAlias: normalizedName, entity: { entityType: input.entityType } },
    include: { entity: true },
    orderBy: { createdAt: "asc" },
  });
  if (alias) {
    return matchedResult(alias.entity, input, normalizedName, "ALIAS_EXACT", 1);
  }

  const canonical = await prisma.entity.findUnique({
    where: {
      normalizedName_entityType: {
        normalizedName,
        entityType: input.entityType,
      },
    },
  });
  if (canonical) {
    return matchedResult(canonical, input, normalizedName, "CANONICAL_EXACT", 1);
  }

  const similarityThreshold = options.similarityThreshold ?? DEFAULT_SIMILARITY_THRESHOLD;
  if (similarityThreshold < 0 || similarityThreshold > 1) {
    throw new Error("Entity similarity threshold must be between 0 and 1.");
  }
  const [bestCandidate] = await findEntityCandidates(normalizedName, input.entityType);
  if (bestCandidate && bestCandidate.similarity >= similarityThreshold) {
    return matchedResult(
      bestCandidate,
      input,
      normalizedName,
      "TRIGRAM",
      bestCandidate.similarity,
    );
  }

  const entity = await prisma.entity.upsert({
    where: {
      normalizedName_entityType: {
        normalizedName,
        entityType: input.entityType,
      },
    },
    update: {},
    create: {
      canonicalName: displayName(input.subject),
      normalizedName,
      entityType: input.entityType,
      metadata: {},
    },
  });
  return {
    entity,
    matchMethod: "CREATED",
    similarity: bestCandidate?.similarity ?? 0,
    aliasLearned: false,
  };
}

export async function resolveDocumentFactEntities(
  documentId: string,
): Promise<DocumentEntityResolutionResult> {
  const facts = await prisma.fact.findMany({
    where: { documentId, entityId: null },
    select: { id: true, subjectRaw: true, subjectType: true },
    orderBy: { createdAt: "asc" },
  });
  let createdCount = 0;
  let matchedCount = 0;
  let issueCount = 0;

  await prisma.processingIssue.deleteMany({
    where: { documentId, stage: "ENTITY_RESOLUTION", issueType: "AMBIGUOUS_ENTITY" },
  });

  for (const fact of facts) {
    try {
      const result = await resolveEntity({
        subject: fact.subjectRaw,
        entityType: fact.subjectType,
        documentId,
      });
      await prisma.fact.update({ where: { id: fact.id }, data: { entityId: result.entity.id } });
      if (result.matchMethod === "CREATED") {
        createdCount += 1;
      } else {
        matchedCount += 1;
      }
    } catch (error) {
      issueCount += 1;
      await prisma.processingIssue.create({
        data: {
          documentId,
          factId: fact.id,
          stage: "ENTITY_RESOLUTION",
          issueType: "AMBIGUOUS_ENTITY",
          severity: "WARNING",
          message: "The fact subject could not be resolved to an entity.",
          metadata: {
            subject: fact.subjectRaw,
            error: error instanceof Error ? error.message : "Unknown entity resolution error",
          },
        },
      });
    }
  }

  return {
    resolvedCount: facts.length - issueCount,
    createdCount,
    matchedCount,
    issueCount,
  };
}
