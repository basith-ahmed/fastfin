import { randomUUID } from "node:crypto";

import type { Entity, Fact, Prisma } from "@prisma/client";

import type {
  RelationshipReasoningInput,
  RelationshipReasoningProvider,
  RelationshipReasoningResult,
} from "../../src/ai/types";
import { connectDatabase, disconnectDatabase, prisma } from "../../src/config/database";
import {
  arePredicatesCompatible,
  evaluateFactPair,
  isCompatiblePair,
  tryDeterministicCorroboration,
} from "../../src/services/relationshipReasoner";

const testPrefix = "phase-9-test";

// ── Fake LLM Provider ───────────────────────────────────────────────

class FakeRelationshipProvider implements RelationshipReasoningProvider {
  readonly model = "fake-relationship-v1";
  readonly promptVersion = "test-v1";
  private nextResult: RelationshipReasoningResult = {
    classification: "UNCERTAIN",
    confidence: 0.8,
    explanation: "Default fake result.",
    decisiveContext: [],
  };

  setResult(result: Partial<RelationshipReasoningResult>): void {
    this.nextResult = {
      classification: result.classification ?? "UNCERTAIN",
      confidence: result.confidence ?? 0.8,
      explanation: result.explanation ?? "Fake explanation.",
      decisiveContext: result.decisiveContext ?? [],
    };
  }

  async reasonRelationship(_input: RelationshipReasoningInput): Promise<RelationshipReasoningResult> {
    return { ...this.nextResult };
  }
}

// ── Test Data Helpers ───────────────────────────────────────────────

async function createEntity(name: string): Promise<Entity> {
  return prisma.entity.create({
    data: {
      canonicalName: name,
      normalizedName: `${name.toLocaleLowerCase("en").replaceAll(" ", "-")}-${randomUUID()}`,
      entityType: "ORGANIZATION",
      metadata: {},
    },
  });
}

async function createDocument(suffix: string) {
  const id = randomUUID();
  return prisma.document.create({
    data: {
      filename: `${id}.pdf`,
      originalFilename: `${testPrefix}-${suffix}-${id}.pdf`,
      mimeType: "application/pdf",
      sha256: id.replaceAll("-", "").padEnd(64, "0"),
      filePath: `/tmp/${id}.pdf`,
      fileSizeBytes: 1n,
      chunks: {
        create: {
          chunkIndex: 0,
          pageStart: 1,
          pageEnd: 1,
          text: `Test chunk for ${suffix}`,
          tokenCount: 5,
          sha256: `${id}-chunk`.padEnd(64, "0"),
          metadata: {},
        },
      },
    },
    include: { chunks: true },
  });
}

async function createFact(input: {
  documentId: string;
  chunkId: string;
  entityId?: string | null;
  subject?: string;
  predicate?: string;
  valueRaw?: string;
  valueType?: "MONEY" | "NUMBER" | "TEXT" | "PERCENTAGE";
  normalizedNumber?: number | null;
  currency?: string | null;
  unit?: string | null;
  context?: Prisma.InputJsonValue;
  qualifiers?: Prisma.InputJsonValue;
}): Promise<Fact> {
  const subject = input.subject ?? `${testPrefix} Acme`;
  return prisma.fact.create({
    data: {
      documentId: input.documentId,
      chunkId: input.chunkId,
      entityId: input.entityId ?? undefined,
      subjectRaw: subject,
      subjectType: "ORGANIZATION",
      subjectNormalized: subject.toLocaleLowerCase("en"),
      predicateRaw: input.predicate ?? "annual_revenue",
      predicateCanonical: input.predicate ?? "annual_revenue",
      valueRaw: input.valueRaw ?? "$12,000,000",
      valueType: input.valueType ?? "MONEY",
      normalizedNumber: input.normalizedNumber ?? 12_000_000,
      currency: input.currency ?? "USD",
      unit: input.unit ?? "USD",
      qualifiers: input.qualifiers ?? {},
      normalizedContext:
        input.context ?? {
          time: { kind: "FISCAL_YEAR", label: "FY2025", start: null, end: null },
          geography: null,
          scope: "consolidated",
          segment: null,
          basis: null,
          statusAsOf: null,
          extra: {},
        },
      confidence: 0.95,
      extractionMethod: "HYBRID",
      factSignature: randomUUID().replaceAll("-", "").padEnd(64, "0"),
    },
  });
}

async function createEvidence(factId: string, documentId: string, quote: string) {
  return prisma.evidence.create({
    data: {
      factId,
      documentId,
      pageNumber: 1,
      quote,
      normalizedQuote: quote.toLocaleLowerCase("en"),
      contextBefore: "",
      contextAfter: "",
      verificationMethod: "EXACT",
      verificationScore: 0.95,
    },
  });
}

// ── Tests ───────────────────────────────────────────────────────────

describe("Phase 9 — Cross-Document Relationship Reasoning", () => {
  beforeAll(connectDatabase);

  afterEach(async () => {
    // Clean up test data
    await prisma.factRelationship.deleteMany({});
    await prisma.processingIssue.deleteMany({
      where: { documentId: { in: (await prisma.document.findMany({
        where: { originalFilename: { startsWith: testPrefix } },
        select: { id: true },
      })).map((d) => d.id) } },
    });
    await prisma.document.deleteMany({
      where: { originalFilename: { startsWith: testPrefix } },
    });
    await prisma.entity.deleteMany({
      where: { canonicalName: { startsWith: testPrefix } },
    });
  });

  afterAll(disconnectDatabase);

  describe("isCompatiblePair", () => {
    it.each([
      ["ebitda_profit_fy24", "ebitda", true],
      ["annual_revenue", "revenue", true],
      ["adjusted_ebitda", "ebitda", false],
      ["revenue", "employee_count", false],
    ])("compares predicate concepts %s and %s", (left, right, expected) => {
      expect(arePredicatesCompatible(left, right)).toBe(expected);
    });

    it("returns true for facts with matching entity and predicate", async () => {
      const entity = await createEntity(`${testPrefix} CompatCo`);
      const docA = await createDocument("compat-a");
      const docB = await createDocument("compat-b");
      const factA = await createFact({
        documentId: docA.id,
        chunkId: docA.chunks[0]!.id,
        entityId: entity.id,
        subject: `${testPrefix} CompatCo`,
        predicate: "annual_revenue",
      });
      const factB = await createFact({
        documentId: docB.id,
        chunkId: docB.chunks[0]!.id,
        entityId: entity.id,
        subject: `${testPrefix} CompatCo`,
        predicate: "annual_revenue",
      });
      expect(isCompatiblePair(factA, factB)).toBe(true);
    });

    it("returns false for facts with different entities and different predicates", async () => {
      const entityA = await createEntity(`${testPrefix} AlphaCo`);
      const entityB = await createEntity(`${testPrefix} BetaCo`);
      const docA = await createDocument("incompat-a");
      const docB = await createDocument("incompat-b");
      const factA = await createFact({
        documentId: docA.id,
        chunkId: docA.chunks[0]!.id,
        entityId: entityA.id,
        subject: `${testPrefix} AlphaCo`,
        predicate: "annual_revenue",
      });
      const factB = await createFact({
        documentId: docB.id,
        chunkId: docB.chunks[0]!.id,
        entityId: entityB.id,
        subject: `${testPrefix} BetaCo`,
        predicate: "employee_count",
        valueType: "NUMBER",
        normalizedNumber: 500,
        currency: null,
        unit: null,
      });
      expect(isCompatiblePair(factA, factB)).toBe(false);
    });

    it("returns false for same entity but unrelated predicates (revenue vs employee_count)", async () => {
      const entity = await createEntity(`${testPrefix} UnrelatedCo`);
      const docA = await createDocument("unrel-a");
      const docB = await createDocument("unrel-b");
      const factA = await createFact({
        documentId: docA.id,
        chunkId: docA.chunks[0]!.id,
        entityId: entity.id,
        subject: `${testPrefix} UnrelatedCo`,
        predicate: "annual_revenue",
      });
      const factB = await createFact({
        documentId: docB.id,
        chunkId: docB.chunks[0]!.id,
        entityId: entity.id,
        subject: `${testPrefix} UnrelatedCo`,
        predicate: "employee_count",
        valueType: "NUMBER",
        normalizedNumber: 2000,
        currency: null,
        unit: null,
      });
      expect(isCompatiblePair(factA, factB)).toBe(false);
    });

    it("accepts the same metric with period/status modifiers", async () => {
      const entity = await createEntity(`${testPrefix} ModifierCo`);
      const docA = await createDocument("modifier-a");
      const docB = await createDocument("modifier-b");
      const factA = await createFact({
        documentId: docA.id,
        chunkId: docA.chunks[0]!.id,
        entityId: entity.id,
        predicate: "ebitda_profit_fy24",
      });
      const factB = await createFact({
        documentId: docB.id,
        chunkId: docB.chunks[0]!.id,
        entityId: entity.id,
        predicate: "ebitda",
      });

      expect(isCompatiblePair(factA, factB)).toBe(true);
    });
  });

  describe("tryDeterministicCorroboration", () => {
    it("returns CORROBORATES with confidence 1.0 for identical normalized facts", async () => {
      const entity = await createEntity(`${testPrefix} DetCo`);
      const docA = await createDocument("det-a");
      const docB = await createDocument("det-b");
      const factA = await createFact({
        documentId: docA.id,
        chunkId: docA.chunks[0]!.id,
        entityId: entity.id,
        subject: `${testPrefix} DetCo`,
        predicate: "annual_revenue",
        valueRaw: "$12m",
        normalizedNumber: 12_000_000,
        currency: "USD",
        unit: "USD",
      });
      const factB = await createFact({
        documentId: docB.id,
        chunkId: docB.chunks[0]!.id,
        entityId: entity.id,
        subject: `${testPrefix} DetCo`,
        predicate: "annual_revenue",
        valueRaw: "USD 12,000,000",
        normalizedNumber: 12_000_000,
        currency: "USD",
        unit: "USD",
      });

      const result = tryDeterministicCorroboration(factA, factB);
      expect(result).not.toBeNull();
      expect(result!.classification).toBe("CORROBORATES");
      expect(result!.confidence).toBe(1.0);
      expect(result!.decisionMethod).toBe("RULE");
    });

    it("returns null when values differ", async () => {
      const entity = await createEntity(`${testPrefix} DiffValCo`);
      const docA = await createDocument("diffval-a");
      const docB = await createDocument("diffval-b");
      const factA = await createFact({
        documentId: docA.id,
        chunkId: docA.chunks[0]!.id,
        entityId: entity.id,
        subject: `${testPrefix} DiffValCo`,
        normalizedNumber: 12_000_000,
      });
      const factB = await createFact({
        documentId: docB.id,
        chunkId: docB.chunks[0]!.id,
        entityId: entity.id,
        subject: `${testPrefix} DiffValCo`,
        normalizedNumber: 18_000_000,
      });

      expect(tryDeterministicCorroboration(factA, factB)).toBeNull();
    });

    it("corroborates tightly rounded values with equivalent predicate modifiers", async () => {
      const entity = await createEntity(`${testPrefix} RoundedCo`);
      const docA = await createDocument("rounded-a");
      const docB = await createDocument("rounded-b");
      const unknownTime = { time: { kind: "UNKNOWN", label: null }, scope: null };
      const factA = await createFact({
        documentId: docA.id,
        chunkId: docA.chunks[0]!.id,
        entityId: entity.id,
        predicate: "ebitda_loss_fy23",
        valueRaw: "₹4,516 million",
        normalizedNumber: 4_516_000_000,
        currency: "INR",
        unit: "INR",
        context: unknownTime,
        qualifiers: { reportingPeriod: "FY23" },
      });
      const factB = await createFact({
        documentId: docB.id,
        chunkId: docB.chunks[0]!.id,
        entityId: entity.id,
        predicate: "ebitda",
        valueRaw: "₹452 Cr",
        normalizedNumber: 4_520_000_000,
        currency: "INR",
        unit: "INR",
        context: unknownTime,
        qualifiers: { reporting_period: "FY23" },
      });

      expect(tryDeterministicCorroboration(factA, factB)).toMatchObject({
        classification: "CORROBORATES",
        confidence: 1,
        decisionMethod: "RULE",
      });
    });

    it("returns null when periods differ", async () => {
      const entity = await createEntity(`${testPrefix} PeriodDiffCo`);
      const docA = await createDocument("period-a");
      const docB = await createDocument("period-b");
      const factA = await createFact({
        documentId: docA.id,
        chunkId: docA.chunks[0]!.id,
        entityId: entity.id,
        subject: `${testPrefix} PeriodDiffCo`,
        context: {
          time: { kind: "HALF_YEAR", label: "H1 FY2025", start: null, end: null },
          scope: "consolidated",
        },
      });
      const factB = await createFact({
        documentId: docB.id,
        chunkId: docB.chunks[0]!.id,
        entityId: entity.id,
        subject: `${testPrefix} PeriodDiffCo`,
        context: {
          time: { kind: "FISCAL_YEAR", label: "FY2025", start: null, end: null },
          scope: "consolidated",
        },
      });

      expect(tryDeterministicCorroboration(factA, factB)).toBeNull();
    });
  });

  describe("evaluateFactPair", () => {
    const fakeProvider = new FakeRelationshipProvider();

    it("uses fast deterministic path for identical facts (no LLM call)", async () => {
      const entity = await createEntity(`${testPrefix} FastPathCo`);
      const docA = await createDocument("fast-a");
      const docB = await createDocument("fast-b");
      const factA = await createFact({
        documentId: docA.id,
        chunkId: docA.chunks[0]!.id,
        entityId: entity.id,
        subject: `${testPrefix} FastPathCo`,
      });
      const factB = await createFact({
        documentId: docB.id,
        chunkId: docB.chunks[0]!.id,
        entityId: entity.id,
        subject: `${testPrefix} FastPathCo`,
      });

      const result = await evaluateFactPair(factA, factB, fakeProvider);
      expect(result.classification).toBe("CORROBORATES");
      expect(result.confidence).toBe(1.0);
      expect(result.decisionMethod).toBe("RULE");
      expect(result.skipped).toBe(false);

      // Verify persisted
      const [leftFactId, rightFactId] =
        factA.id < factB.id ? [factA.id, factB.id] : [factB.id, factA.id];
      const persisted = await prisma.factRelationship.findUnique({
        where: { leftFactId_rightFactId: { leftFactId, rightFactId } },
      });
      expect(persisted).not.toBeNull();
      expect(persisted!.relationshipType).toBe("CORROBORATES");
      expect(persisted!.decisionMethod).toBe("RULE");
    });

    it("uses LLM for contradiction (same entity/predicate/period, different values)", async () => {
      const entity = await createEntity(`${testPrefix} ContradictCo`);
      const docA = await createDocument("contra-a");
      const docB = await createDocument("contra-b");
      const factA = await createFact({
        documentId: docA.id,
        chunkId: docA.chunks[0]!.id,
        entityId: entity.id,
        subject: `${testPrefix} ContradictCo`,
        valueRaw: "$12m",
        normalizedNumber: 12_000_000,
      });
      const factB = await createFact({
        documentId: docB.id,
        chunkId: docB.chunks[0]!.id,
        entityId: entity.id,
        subject: `${testPrefix} ContradictCo`,
        valueRaw: "$18m",
        normalizedNumber: 18_000_000,
      });

      await createEvidence(factA.id, docA.id, "FY2025 revenue $12m");
      await createEvidence(factB.id, docB.id, "FY2025 revenue $18m");

      fakeProvider.setResult({
        classification: "CONTRADICTS",
        confidence: 0.92,
        explanation: "Both report FY2025 revenue for the same entity with materially different values.",
      });

      const result = await evaluateFactPair(factA, factB, fakeProvider);
      expect(result.classification).toBe("CONTRADICTS");
      expect(result.decisionMethod).toBe("LLM");
      expect(result.skipped).toBe(false);

      const persisted = await prisma.factRelationship.findUnique({
        where: {
          leftFactId_rightFactId: {
            leftFactId: result.leftFactId,
            rightFactId: result.rightFactId,
          },
        },
      });
      expect(persisted?.modelName).toBe(fakeProvider.model);
      expect(persisted?.promptVersion).toBe(fakeProvider.promptVersion);
    });

    it("uses LLM for reconciliation (H1 vs FY)", async () => {
      const entity = await createEntity(`${testPrefix} ReconcileCo`);
      const docA = await createDocument("recon-a");
      const docB = await createDocument("recon-b");
      const factA = await createFact({
        documentId: docA.id,
        chunkId: docA.chunks[0]!.id,
        entityId: entity.id,
        subject: `${testPrefix} ReconcileCo`,
        valueRaw: "$6m",
        normalizedNumber: 6_000_000,
        context: {
          time: { kind: "HALF_YEAR", label: "H1 FY2025", start: null, end: null },
          scope: "consolidated",
        },
      });
      const factB = await createFact({
        documentId: docB.id,
        chunkId: docB.chunks[0]!.id,
        entityId: entity.id,
        subject: `${testPrefix} ReconcileCo`,
        valueRaw: "$12m",
        normalizedNumber: 12_000_000,
        context: {
          time: { kind: "FISCAL_YEAR", label: "FY2025", start: null, end: null },
          scope: "consolidated",
        },
      });

      fakeProvider.setResult({
        classification: "RECONCILABLE",
        confidence: 0.88,
        explanation: "H1 revenue is approximately half of full-year revenue, consistent with a half-year reporting period.",
        decisiveContext: [
          { dimension: "period", factA: "H1 FY2025", factB: "FY2025", effect: "EXPLAINS_DIFFERENCE" },
        ],
      });

      const result = await evaluateFactPair(factA, factB, fakeProvider);
      expect(result.classification).toBe("RECONCILABLE");
      expect(result.decisionMethod).toBe("LLM");
    });

    it("uses LLM for uncertain (USD vs EUR, no conversion)", async () => {
      const entity = await createEntity(`${testPrefix} UncertainCo`);
      const docA = await createDocument("uncert-a");
      const docB = await createDocument("uncert-b");
      const factA = await createFact({
        documentId: docA.id,
        chunkId: docA.chunks[0]!.id,
        entityId: entity.id,
        subject: `${testPrefix} UncertainCo`,
        valueRaw: "$12m",
        normalizedNumber: 12_000_000,
        currency: "USD",
        unit: "USD",
      });
      const factB = await createFact({
        documentId: docB.id,
        chunkId: docB.chunks[0]!.id,
        entityId: entity.id,
        subject: `${testPrefix} UncertainCo`,
        valueRaw: "€12m",
        normalizedNumber: 12_000_000,
        currency: "EUR",
        unit: "EUR",
      });

      fakeProvider.setResult({
        classification: "UNCERTAIN",
        confidence: 0.65,
        explanation: "Same numeric value but different currencies (USD vs EUR) without conversion evidence.",
      });

      const result = await evaluateFactPair(factA, factB, fakeProvider);
      expect(result.classification).toBe("UNCERTAIN");
    });

    it("downgrades to UNCERTAIN when LLM confidence is below 0.60", async () => {
      const entity = await createEntity(`${testPrefix} LowConfCo`);
      const docA = await createDocument("lowconf-a");
      const docB = await createDocument("lowconf-b");
      const factA = await createFact({
        documentId: docA.id,
        chunkId: docA.chunks[0]!.id,
        entityId: entity.id,
        subject: `${testPrefix} LowConfCo`,
        normalizedNumber: 12_000_000,
      });
      const factB = await createFact({
        documentId: docB.id,
        chunkId: docB.chunks[0]!.id,
        entityId: entity.id,
        subject: `${testPrefix} LowConfCo`,
        normalizedNumber: 18_000_000,
      });

      fakeProvider.setResult({
        classification: "CONTRADICTS",
        confidence: 0.50,
        explanation: "Low confidence contradiction.",
      });

      const result = await evaluateFactPair(factA, factB, fakeProvider);
      expect(result.classification).toBe("UNCERTAIN");
      expect(result.confidence).toBe(0.50);

      // Verify ProcessingIssue was created
      const issues = await prisma.processingIssue.findMany({
        where: {
          factId: factA.id,
          issueType: "RELATIONSHIP_UNCERTAIN",
        },
      });
      expect(issues.length).toBe(1);
      expect(issues[0]!.message).toContain("0.50");
      expect(issues[0]!.message).toContain("UNCERTAIN");
    });

    it("skips incompatible pairs (different entity + different predicate)", async () => {
      const entityA = await createEntity(`${testPrefix} SkipAlpha`);
      const entityB = await createEntity(`${testPrefix} SkipBeta`);
      const docA = await createDocument("skip-a");
      const docB = await createDocument("skip-b");
      const factA = await createFact({
        documentId: docA.id,
        chunkId: docA.chunks[0]!.id,
        entityId: entityA.id,
        subject: `${testPrefix} SkipAlpha`,
        predicate: "annual_revenue",
      });
      const factB = await createFact({
        documentId: docB.id,
        chunkId: docB.chunks[0]!.id,
        entityId: entityB.id,
        subject: `${testPrefix} SkipBeta`,
        predicate: "employee_count",
        valueType: "NUMBER",
        normalizedNumber: 2000,
        currency: null,
        unit: null,
      });

      const result = await evaluateFactPair(factA, factB, fakeProvider);
      expect(result.skipped).toBe(true);
      expect(result.skipReason).toBe("Incompatible pair.");

      // No relationship should be persisted
      const [leftFactId, rightFactId] =
        factA.id < factB.id ? [factA.id, factB.id] : [factB.id, factA.id];
      const persisted = await prisma.factRelationship.findUnique({
        where: { leftFactId_rightFactId: { leftFactId, rightFactId } },
      });
      expect(persisted).toBeNull();
    });

    it("skips facts from the same document", async () => {
      const entity = await createEntity(`${testPrefix} SameDocumentCo`);
      const document = await createDocument("same-document");
      const factA = await createFact({
        documentId: document.id,
        chunkId: document.chunks[0]!.id,
        entityId: entity.id,
        subject: `${testPrefix} SameDocumentCo`,
        normalizedNumber: 12_000_000,
      });
      const factB = await createFact({
        documentId: document.id,
        chunkId: document.chunks[0]!.id,
        entityId: entity.id,
        subject: `${testPrefix} SameDocumentCo`,
        normalizedNumber: 18_000_000,
      });

      const result = await evaluateFactPair(factA, factB, fakeProvider);

      expect(result.skipped).toBe(true);
      expect(result.skipReason).toBe("Same-document pair.");
      expect(
        await prisma.factRelationship.findUnique({
          where: {
            leftFactId_rightFactId: {
              leftFactId: result.leftFactId,
              rightFactId: result.rightFactId,
            },
          },
        }),
      ).toBeNull();
    });

    it("records a visible issue when relationship reasoning fails", async () => {
      const entity = await createEntity(`${testPrefix} FailedReasoningCo`);
      const docA = await createDocument("failed-reasoning-a");
      const docB = await createDocument("failed-reasoning-b");
      const factA = await createFact({
        documentId: docA.id,
        chunkId: docA.chunks[0]!.id,
        entityId: entity.id,
        subject: `${testPrefix} FailedReasoningCo`,
        normalizedNumber: 12_000_000,
      });
      const factB = await createFact({
        documentId: docB.id,
        chunkId: docB.chunks[0]!.id,
        entityId: entity.id,
        subject: `${testPrefix} FailedReasoningCo`,
        normalizedNumber: 18_000_000,
      });
      const failingProvider: RelationshipReasoningProvider = {
        model: "failing-reasoner",
        promptVersion: "failure-test-v1",
        reasonRelationship: async () => {
          throw new Error("simulated relationship provider outage");
        },
      };

      const result = await evaluateFactPair(factA, factB, failingProvider);

      expect(result.skipped).toBe(true);
      expect(result.skipReason).toBe("LLM reasoning failed.");
      expect(result.classification).toBe("UNCERTAIN");
      expect(
        await prisma.processingIssue.findFirst({
          where: { factId: factA.id, issueType: "RELATIONSHIP_REASONING_FAILURE" },
        }),
      ).toMatchObject({
        documentId: docA.id,
        severity: "ERROR",
        message: "simulated relationship provider outage",
      });
    });

    it("is idempotent — evaluating the same pair twice returns the cached result", async () => {
      const entity = await createEntity(`${testPrefix} IdempotentCo`);
      const docA = await createDocument("idemp-a");
      const docB = await createDocument("idemp-b");
      const factA = await createFact({
        documentId: docA.id,
        chunkId: docA.chunks[0]!.id,
        entityId: entity.id,
        subject: `${testPrefix} IdempotentCo`,
      });
      const factB = await createFact({
        documentId: docB.id,
        chunkId: docB.chunks[0]!.id,
        entityId: entity.id,
        subject: `${testPrefix} IdempotentCo`,
      });

      // First evaluation (deterministic path)
      const first = await evaluateFactPair(factA, factB, fakeProvider);
      expect(first.skipped).toBe(false);
      expect(first.classification).toBe("CORROBORATES");

      // Second evaluation — should return cached
      const second = await evaluateFactPair(factA, factB, fakeProvider);
      expect(second.skipped).toBe(true);
      expect(second.skipReason).toBe("Already evaluated.");
      expect(second.classification).toBe("CORROBORATES");

      // Only one record in DB
      const [leftFactId, rightFactId] =
        factA.id < factB.id ? [factA.id, factB.id] : [factB.id, factA.id];
      const count = await prisma.factRelationship.count({
        where: { leftFactId, rightFactId },
      });
      expect(count).toBe(1);
    });

    it("enforces canonical ordering: leftFactId < rightFactId regardless of input order", async () => {
      const entity = await createEntity(`${testPrefix} OrderCo`);
      const docA = await createDocument("order-a");
      const docB = await createDocument("order-b");
      const factA = await createFact({
        documentId: docA.id,
        chunkId: docA.chunks[0]!.id,
        entityId: entity.id,
        subject: `${testPrefix} OrderCo`,
      });
      const factB = await createFact({
        documentId: docB.id,
        chunkId: docB.chunks[0]!.id,
        entityId: entity.id,
        subject: `${testPrefix} OrderCo`,
      });

      // Evaluate with B, A (reversed order)
      const result = await evaluateFactPair(factB, factA, fakeProvider);
      expect(result.leftFactId < result.rightFactId).toBe(true);

      // Should match the same canonical ordering
      const [expectedLeft, expectedRight] =
        factA.id < factB.id ? [factA.id, factB.id] : [factB.id, factA.id];
      expect(result.leftFactId).toBe(expectedLeft);
      expect(result.rightFactId).toBe(expectedRight);
    });

    it("handles reconciliation for scope differences (India vs global)", async () => {
      const entity = await createEntity(`${testPrefix} ScopeCo`);
      const docA = await createDocument("scope-a");
      const docB = await createDocument("scope-b");
      const factA = await createFact({
        documentId: docA.id,
        chunkId: docA.chunks[0]!.id,
        entityId: entity.id,
        subject: `${testPrefix} ScopeCo`,
        valueRaw: "$3m",
        normalizedNumber: 3_000_000,
        context: {
          time: { kind: "FISCAL_YEAR", label: "FY2025", start: null, end: null },
          geography: "india",
          scope: "india",
        },
      });
      const factB = await createFact({
        documentId: docB.id,
        chunkId: docB.chunks[0]!.id,
        entityId: entity.id,
        subject: `${testPrefix} ScopeCo`,
        valueRaw: "$12m",
        normalizedNumber: 12_000_000,
        context: {
          time: { kind: "FISCAL_YEAR", label: "FY2025", start: null, end: null },
          geography: null,
          scope: "global",
        },
      });

      fakeProvider.setResult({
        classification: "RECONCILABLE",
        confidence: 0.85,
        explanation: "India revenue vs global revenue — regional vs total scope explains the value difference.",
        decisiveContext: [
          { dimension: "scope", factA: "india", factB: "global", effect: "EXPLAINS_DIFFERENCE" },
        ],
      });

      const result = await evaluateFactPair(factA, factB, fakeProvider);
      expect(result.classification).toBe("RECONCILABLE");
      expect(result.decisionMethod).toBe("LLM");
    });

    it("handles status chronology (active in January, resigned in March)", async () => {
      const entity = await createEntity(`${testPrefix} ChronologyCo`);
      const docA = await createDocument("chronology-a");
      const docB = await createDocument("chronology-b");
      const factA = await createFact({
        documentId: docA.id,
        chunkId: docA.chunks[0]!.id,
        entityId: entity.id,
        subject: `${testPrefix} ChronologyCo`,
        predicate: "director_status",
        valueRaw: "active",
        valueType: "TEXT",
        normalizedNumber: null,
        currency: null,
        unit: null,
        context: {
          time: { kind: "DATE", label: "January 2025", start: "2025-01-01", end: null },
          scope: null,
          statusAsOf: "2025-01-31",
        },
      });
      const factB = await createFact({
        documentId: docB.id,
        chunkId: docB.chunks[0]!.id,
        entityId: entity.id,
        subject: `${testPrefix} ChronologyCo`,
        predicate: "director_status",
        valueRaw: "resigned",
        valueType: "TEXT",
        normalizedNumber: null,
        currency: null,
        unit: null,
        context: {
          time: { kind: "DATE", label: "March 2025", start: "2025-03-01", end: null },
          scope: null,
          statusAsOf: "2025-03-31",
        },
      });
      fakeProvider.setResult({
        classification: "RECONCILABLE",
        confidence: 0.93,
        explanation: "The director was active in January and later resigned in March.",
        decisiveContext: [
          {
            dimension: "status date",
            factA: "January 2025",
            factB: "March 2025",
            effect: "EXPLAINS_DIFFERENCE",
          },
        ],
      });

      const result = await evaluateFactPair(factA, factB, fakeProvider);

      expect(result.classification).toBe("RECONCILABLE");
      expect(result.decisionMethod).toBe("LLM");
    });
  });
});
