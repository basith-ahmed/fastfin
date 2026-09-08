import { Prisma, type Fact } from "@prisma/client";

import { OpenAIRelationshipReasoningProvider } from "../ai/openaiRelationshipReasoningProvider";
import type {
  RelationshipClassification,
  RelationshipFactInput,
  RelationshipReasoningProvider,
  RelationshipReasoningResult,
} from "../ai/types";
import { prisma } from "../config/database";
import { logger } from "../utils/logger";
import { retrieveFactCandidates } from "./factEmbedding";

// ── Types ───────────────────────────────────────────────────────────

type DecisionMethod = "RULE" | "LLM";

export type FactPairResult = {
  leftFactId: string;
  rightFactId: string;
  classification: RelationshipClassification;
  confidence: number;
  explanation: string;
  decisionMethod: DecisionMethod;
  skipped: boolean;
  skipReason?: string;
};

export type DocumentRelationshipResult = {
  documentId: string;
  factsProcessed: number;
  candidatesEvaluated: number;
  relationshipsCreated: number;
  skipped: number;
  issueCount: number;
  byType: Record<RelationshipClassification, number>;
};

// ── Helpers ─────────────────────────────────────────────────────────

function isRecord(value: Prisma.JsonValue): value is Prisma.JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getContextField(context: Prisma.JsonValue, field: string): string | null {
  if (!isRecord(context)) return null;
  const value = context[field];
  if (typeof value === "string" && value.trim().length > 0) return value.trim();
  return null;
}

function getTimeLabel(context: Prisma.JsonValue): string | null {
  if (!isRecord(context)) return null;
  const time = context.time;
  if (typeof time === "string" && time.trim().length > 0) return time.trim();
  if (time !== undefined && time !== null && isRecord(time)) {
    const label = time.label;
    if (typeof label === "string" && label.trim().length > 0) return label.trim();
  }
  return null;
}

function getTimeKind(context: Prisma.JsonValue): string | null {
  if (!isRecord(context)) return null;
  const time = context.time;
  if (time !== undefined && time !== null && isRecord(time)) {
    const kind = time.kind;
    if (typeof kind === "string" && kind.trim().length > 0) return kind.trim();
  }
  return null;
}

function getQualifierPeriod(qualifiers: Prisma.JsonValue): string | null {
  if (!isRecord(qualifiers)) return null;
  for (const key of ["reportingPeriod", "reporting_period", "period"]) {
    const value = qualifiers[key];
    if (typeof value === "string" && value.trim().length > 0) return value.trim();
  }
  return null;
}

function getFactPeriod(fact: Fact): string | null {
  return getTimeLabel(fact.normalizedContext) ?? getQualifierPeriod(fact.qualifiers);
}

/**
 * Canonical ordering ensures leftFactId < rightFactId to satisfy
 * the DB CHECK constraint `fact_relationships_ordered_pair_check`.
 */
function orderFactIds(idA: string, idB: string): [string, string] {
  return idA < idB ? [idA, idB] : [idB, idA];
}

function buildFactInput(fact: Fact, quote: string | null): RelationshipFactInput {
  return {
    entity: fact.subjectNormalized,
    predicate: fact.predicateCanonical,
    value: fact.valueRaw,
    unit: fact.unit,
    currency: fact.currency,
    period: getFactPeriod(fact),
    scope: getContextField(fact.normalizedContext, "scope"),
    segment: getContextField(fact.normalizedContext, "segment"),
    quote,
  };
}

// ── Compatibility Guard ─────────────────────────────────────────────

/**
 * Quickly filter out clearly incompatible pairs.
 * Returns true if the pair is worth evaluating.
 */
export function isCompatiblePair(factA: Fact, factB: Fact): boolean {
  // Check entity compatibility
  const sameEntity =
    (factA.entityId !== null && factA.entityId === factB.entityId) ||
    factA.subjectNormalized === factB.subjectNormalized;

  if (!sameEntity) return false;

  // Different value kinds are not comparable even when their predicate words overlap
  // (for example, EBITDA amount versus EBITDA margin).
  if (factA.valueType !== factB.valueType) return false;

  if (!arePredicatesCompatible(factA.predicateCanonical, factB.predicateCanonical)) return false;

  return true;
}

const PREDICATE_CONTEXT_MODIFIERS = new Set([
  "annual",
  "quarterly",
  "reported",
  "profit",
  "loss",
  "positive",
  "negative",
]);

function predicateConcept(predicate: string): string {
  return predicate
    .split("_")
    .filter(
      (token) =>
        token.length > 0 &&
        !PREDICATE_CONTEXT_MODIFIERS.has(token) &&
        !/^fy\d{2,4}$/u.test(token) &&
        !/^q[1-4]$/u.test(token) &&
        !/^\d{4}$/u.test(token),
    )
    .join("_");
}

export function arePredicatesCompatible(left: string, right: string): boolean {
  if (left === right) return true;
  const leftConcept = predicateConcept(left);
  const rightConcept = predicateConcept(right);
  return leftConcept.length > 0 && leftConcept === rightConcept;
}

// ── Fast Deterministic Corroboration Path ────────────────────────────

/**
 * If both facts have identical normalized entity, predicate, period,
 * scope, and value — classify as CORROBORATES with confidence 1.0.
 * Returns null if the fast path does not apply.
 */
export function tryDeterministicCorroboration(
  factA: Fact,
  factB: Fact,
): FactPairResult | null {
  // Entity must match (resolved or normalized subject)
  const entityMatch =
    (factA.entityId !== null && factA.entityId === factB.entityId) ||
    factA.subjectNormalized === factB.subjectNormalized;
  if (!entityMatch) return null;

  if (factA.valueType !== factB.valueType) return null;
  if (!arePredicatesCompatible(factA.predicateCanonical, factB.predicateCanonical)) return null;

  // Period must match (same kind + label)
  const timeKindA = getTimeKind(factA.normalizedContext);
  const timeKindB = getTimeKind(factB.normalizedContext);
  if (timeKindA !== timeKindB) return null;

  const timeLabelA = getFactPeriod(factA);
  const timeLabelB = getFactPeriod(factB);
  if (timeLabelA !== timeLabelB) return null;

  // Scope must match
  const scopeA = getContextField(factA.normalizedContext, "scope");
  const scopeB = getContextField(factB.normalizedContext, "scope");
  if (scopeA !== scopeB) return null;

  // Value must match: compare normalizedNumber (with currency/unit) or normalizedText
  if (factA.normalizedNumber !== null && factB.normalizedNumber !== null) {
    const left = Math.abs(factA.normalizedNumber.toNumber());
    const right = Math.abs(factB.normalizedNumber.toNumber());
    const scale = Math.max(left, right);
    const relativeDifference = scale === 0 ? 0 : Math.abs(left - right) / scale;
    // Financial reports commonly round the same value at different scales
    // (for example, millions versus crores). Keep this tolerance deliberately tight.
    if (relativeDifference > 0.005) return null;
    if (factA.currency !== factB.currency) return null;
    if (factA.unit !== factB.unit) return null;
  } else if (factA.normalizedText !== null && factB.normalizedText !== null) {
    if (factA.normalizedText !== factB.normalizedText) return null;
  } else {
    // Mismatched value representations
    return null;
  }

  const [leftFactId, rightFactId] = orderFactIds(factA.id, factB.id);
  return {
    leftFactId,
    rightFactId,
    classification: "CORROBORATES",
    confidence: 1.0,
    explanation:
      "Both documents state equivalent normalized values, allowing only a small reporting-rounding difference, under the same entity, period, and scope.",
    decisionMethod: "RULE",
    skipped: false,
  };
}

// ── Core Evaluation ─────────────────────────────────────────────────

const CONFIDENCE_GATE_THRESHOLD = 0.60;

/**
 * Evaluate a single fact pair: compatibility → deterministic → LLM → persist.
 */
export async function evaluateFactPair(
  factA: Fact,
  factB: Fact,
  provider?: RelationshipReasoningProvider,
): Promise<FactPairResult> {
  const [leftFactId, rightFactId] = orderFactIds(factA.id, factB.id);

  // Idempotency: check if already evaluated
  const existing = await prisma.factRelationship.findUnique({
    where: { leftFactId_rightFactId: { leftFactId, rightFactId } },
    select: { relationshipType: true, confidence: true, explanation: true, decisionMethod: true },
  });
  if (existing) {
    return {
      leftFactId,
      rightFactId,
      classification: existing.relationshipType as RelationshipClassification,
      confidence: existing.confidence,
      explanation: existing.explanation,
      decisionMethod: existing.decisionMethod as DecisionMethod,
      skipped: true,
      skipReason: "Already evaluated.",
    };
  }

  // Relationship reasoning is intentionally cross-document only. Candidate
  // retrieval already enforces this, but keep the public pair evaluator safe.
  if (factA.documentId === factB.documentId) {
    return {
      leftFactId,
      rightFactId,
      classification: "UNCERTAIN",
      confidence: 0,
      explanation: "Same-document facts are not evaluated as cross-document relationships.",
      decisionMethod: "RULE",
      skipped: true,
      skipReason: "Same-document pair.",
    };
  }

  // Compatibility guard
  if (!isCompatiblePair(factA, factB)) {
    return {
      leftFactId,
      rightFactId,
      classification: "UNCERTAIN",
      confidence: 0,
      explanation: "Incompatible pair — different entity or predicate.",
      decisionMethod: "RULE",
      skipped: true,
      skipReason: "Incompatible pair.",
    };
  }

  // Fast deterministic corroboration path
  const deterministic = tryDeterministicCorroboration(factA, factB);
  if (deterministic) {
    await persistRelationship(deterministic, null, null, "rule-only");
    return deterministic;
  }

  // LLM reasoning path
  const reasoner = provider ?? new OpenAIRelationshipReasoningProvider();

  // Fetch evidence quotes for context
  const [evidenceA, evidenceB] = await Promise.all([
    prisma.evidence.findFirst({
      where: { factId: factA.id },
      select: { quote: true },
      orderBy: { verificationScore: "desc" },
    }),
    prisma.evidence.findFirst({
      where: { factId: factB.id },
      select: { quote: true },
      orderBy: { verificationScore: "desc" },
    }),
  ]);

  const inputA = buildFactInput(factA, evidenceA?.quote ?? null);
  const inputB = buildFactInput(factB, evidenceB?.quote ?? null);

  let llmResult: RelationshipReasoningResult;
  try {
    llmResult = await reasoner.reasonRelationship({ factA: inputA, factB: inputB });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown reasoning failure.";
    logger.error({ err: error, leftFactId, rightFactId }, "Relationship reasoning failed");

    // Record issue and return
    await prisma.processingIssue.create({
      data: {
        documentId: factA.documentId,
        factId: factA.id,
        stage: "RELATIONSHIP_REASONING",
        issueType: "RELATIONSHIP_REASONING_FAILURE",
        severity: "ERROR",
        message,
        metadata: { leftFactId, rightFactId },
      },
    });

    return {
      leftFactId,
      rightFactId,
      classification: "UNCERTAIN",
      confidence: 0,
      explanation: `Reasoning failed: ${message}`,
      decisionMethod: "LLM",
      skipped: true,
      skipReason: "LLM reasoning failed.",
    };
  }

  // Apply confidence gate
  let classification = llmResult.classification;
  if (llmResult.confidence < CONFIDENCE_GATE_THRESHOLD) {
    classification = "UNCERTAIN";
    await prisma.processingIssue.create({
      data: {
        documentId: factA.documentId,
        factId: factA.id,
        stage: "RELATIONSHIP_REASONING",
        issueType: "RELATIONSHIP_UNCERTAIN",
        severity: "WARNING",
        message: `LLM confidence ${llmResult.confidence.toFixed(2)} below threshold ${CONFIDENCE_GATE_THRESHOLD}. Classification downgraded to UNCERTAIN.`,
        metadata: {
          leftFactId,
          rightFactId,
          originalClassification: llmResult.classification,
          originalConfidence: llmResult.confidence,
        },
      },
    });
  }

  const result: FactPairResult = {
    leftFactId,
    rightFactId,
    classification,
    confidence: llmResult.confidence,
    explanation: llmResult.explanation,
    decisionMethod: "LLM",
    skipped: false,
  };

  await persistRelationship(result, llmResult, reasoner.model, reasoner.promptVersion);
  return result;
}

// ── Persistence ─────────────────────────────────────────────────────

async function persistRelationship(
  result: FactPairResult,
  llmResult: RelationshipReasoningResult | null,
  modelName: string | null,
  promptVersion: string,
): Promise<void> {
  await prisma.factRelationship.upsert({
    where: {
      leftFactId_rightFactId: {
        leftFactId: result.leftFactId,
        rightFactId: result.rightFactId,
      },
    },
    create: {
      leftFactId: result.leftFactId,
      rightFactId: result.rightFactId,
      relationshipType: result.classification,
      confidence: result.confidence,
      explanation: result.explanation,
      contextComparison: (llmResult?.decisiveContext as Prisma.InputJsonValue) ?? [],
      ruleSignals: { decisionMethod: result.decisionMethod },
      decisionMethod: result.decisionMethod,
      modelName,
      promptVersion,
    },
    update: {
      relationshipType: result.classification,
      confidence: result.confidence,
      explanation: result.explanation,
      contextComparison: (llmResult?.decisiveContext as Prisma.InputJsonValue) ?? [],
      ruleSignals: { decisionMethod: result.decisionMethod },
      decisionMethod: result.decisionMethod,
      modelName,
      promptVersion,
    },
  });
}

// ── Document-Level Orchestration ────────────────────────────────────

/**
 * Evaluate all cross-document relationships for facts in a given document.
 * For each fact, retrieve embedding candidates and evaluate each pair.
 */
export async function evaluateDocumentRelationships(
  documentId: string,
  provider?: RelationshipReasoningProvider,
): Promise<DocumentRelationshipResult> {
  const facts = await prisma.fact.findMany({
    where: { documentId },
    orderBy: { createdAt: "asc" },
  });

  const result: DocumentRelationshipResult = {
    documentId,
    factsProcessed: facts.length,
    candidatesEvaluated: 0,
    relationshipsCreated: 0,
    skipped: 0,
    issueCount: 0,
    byType: { CORROBORATES: 0, CONTRADICTS: 0, RECONCILABLE: 0, UNCERTAIN: 0 },
  };

  // Track evaluated pairs to avoid duplicates within this run
  const evaluatedPairs = new Set<string>();

  for (const fact of facts) {
    let candidates;
    try {
      candidates = await retrieveFactCandidates(fact.id);
    } catch (error: unknown) {
      logger.warn(
        { err: error, factId: fact.id },
        "Failed to retrieve candidates for fact — skipping",
      );
      continue;
    }

    for (const candidate of candidates) {
      const [left, right] = orderFactIds(fact.id, candidate.factId);
      const pairKey = `${left}:${right}`;
      if (evaluatedPairs.has(pairKey)) continue;
      evaluatedPairs.add(pairKey);

      result.candidatesEvaluated += 1;

      try {
        const pairResult = await evaluateFactPair(fact, candidate.fact, provider);
        if (pairResult.skipped) {
          result.skipped += 1;
          if (pairResult.skipReason === "Incompatible pair.") continue;
        } else {
          result.relationshipsCreated += 1;
        }
        result.byType[pairResult.classification] += 1;
      } catch (error: unknown) {
        result.issueCount += 1;
        logger.error(
          { err: error, factId: fact.id, candidateId: candidate.factId },
          "Unexpected error evaluating fact pair",
        );
      }
    }
  }

  return result;
}
