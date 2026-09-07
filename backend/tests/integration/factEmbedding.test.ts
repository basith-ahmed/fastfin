import { randomUUID } from "node:crypto";

import type { Entity, Prisma } from "@prisma/client";

import type { EmbeddingProvider } from "../../src/ai/types";
import { connectDatabase, disconnectDatabase, prisma } from "../../src/config/database";
import {
  buildFactComparisonText,
  createFactEmbedding,
  embedFact,
  retrieveFactCandidates,
} from "../../src/services/factEmbedding";

const documentPrefix = "phase-8-integration";
const entityPrefix = "Phase 8 Test";

function vector(x: number, y: number): number[] {
  return [x, y, ...Array.from({ length: 766 }, () => 0)];
}

class FakeEmbeddingProvider implements EmbeddingProvider {
  readonly model = "fake-embedding-v1";
  readonly dimensions = 768;
  readonly embed = jest.fn(async () => vector(1, 0));
}

describe("Phase 8 fact embeddings and semantic retrieval", () => {
  beforeAll(connectDatabase);

  beforeEach(async () => {
    await prisma.document.deleteMany({
      where: { originalFilename: { startsWith: documentPrefix } },
    });
    await prisma.entity.deleteMany({ where: { canonicalName: { startsWith: entityPrefix } } });
  });

  afterEach(async () => {
    await prisma.document.deleteMany({
      where: { originalFilename: { startsWith: documentPrefix } },
    });
    await prisma.entity.deleteMany({ where: { canonicalName: { startsWith: entityPrefix } } });
  });

  afterAll(disconnectDatabase);

  async function createEntity(name = `${entityPrefix} Acme`): Promise<Entity> {
    return prisma.entity.create({
      data: {
        canonicalName: name,
        normalizedName: `${name.toLocaleLowerCase("en").replaceAll(" ", "-")}-${randomUUID()}`,
        entityType: "ORGANIZATION",
        metadata: {},
      },
    });
  }

  async function createFact(input: {
    documentId?: string;
    entityId?: string | null;
    subject?: string;
    predicate?: string;
    valueType?: "MONEY" | "NUMBER";
    context?: Prisma.InputJsonValue;
  } = {}) {
    const id = randomUUID();
    const document = input.documentId
      ? await prisma.document.findUniqueOrThrow({
          where: { id: input.documentId },
          include: { chunks: true },
        })
      : await prisma.document.create({
          data: {
            filename: `${id}.pdf`,
            originalFilename: `${documentPrefix}-${id}.pdf`,
            mimeType: "application/pdf",
            sha256: id.replaceAll("-", "").padEnd(64, "0"),
            filePath: `/tmp/${id}.pdf`,
            fileSizeBytes: 1n,
            chunks: {
              create: {
                chunkIndex: 0,
                pageStart: 1,
                pageEnd: 1,
                text: "Embedding integration test",
                tokenCount: 3,
                sha256: `${id}-chunk`,
                metadata: {},
              },
            },
          },
          include: { chunks: true },
        });
    const chunk = document.chunks[0];
    if (!chunk) {
      throw new Error("Expected a source chunk.");
    }
    const subject = input.subject ?? `${entityPrefix} Acme`;
    return prisma.fact.create({
      data: {
        documentId: document.id,
        chunkId: chunk.id,
        entityId: input.entityId,
        subjectRaw: subject,
        subjectType: "ORGANIZATION",
        subjectNormalized: subject.toLocaleLowerCase("en"),
        predicateRaw: input.predicate ?? "annual revenue",
        predicateCanonical: input.predicate ?? "annual_revenue",
        valueRaw: "$999 million",
        valueType: input.valueType ?? "MONEY",
        normalizedNumber: 999_000_000,
        currency: "USD",
        unit: "USD",
        qualifiers: {},
        normalizedContext:
          input.context ?? {
            time: { kind: "FISCAL_YEAR", label: "FY2025", start: null, end: null },
            scope: "consolidated",
          },
        confidence: 0.99,
        extractionMethod: "HYBRID",
        factSignature: randomUUID().replaceAll("-", "").padEnd(64, "0"),
      },
      include: { entity: { select: { canonicalName: true } } },
    });
  }

  it("builds semantic text without the raw value and reuses a matching stored embedding", async () => {
    const entity = await createEntity();
    const fact = await createFact({ entityId: entity.id });
    const text = buildFactComparisonText(fact);

    expect(text).toContain(`Entity: ${entity.canonicalName}`);
    expect(text).toContain("Predicate: annual_revenue");
    expect(text).toContain("Period: FY2025");
    expect(text).toContain("Scope: consolidated");
    expect(text).not.toContain("$999 million");
    expect(text).not.toContain("999000000");

    const provider = new FakeEmbeddingProvider();
    await expect(embedFact(fact.id, provider)).resolves.toMatchObject({ cached: false });
    await expect(embedFact(fact.id, provider)).resolves.toMatchObject({ cached: true });
    expect(provider.embed).toHaveBeenCalledTimes(1);
  });

  it("retrieves direct and semantic cross-document candidates without filtering context", async () => {
    const entity = await createEntity();
    const source = await createFact({ entityId: entity.id });
    const direct = await createFact({ entityId: entity.id });
    const synonym = await createFact({
      entityId: entity.id,
      predicate: "turnover",
      context: {
        time: { kind: "HALF_YEAR", label: "H1 FY2025", start: null, end: null },
        scope: "regional",
      },
    });
    const unrelatedEntity = await createEntity(`${entityPrefix} Other`);
    const unrelated = await createFact({ entityId: unrelatedEntity.id, predicate: "turnover" });

    const sameDocumentFact = await createFact({
      documentId: source.documentId,
      entityId: entity.id,
      predicate: "turnover",
    });

    await Promise.all([
      createFactEmbedding({
        factId: source.id,
        comparisonText: "source",
        embedding: vector(1, 0),
        model: "fake",
      }),
      createFactEmbedding({
        factId: direct.id,
        comparisonText: "direct",
        embedding: vector(0, 1),
        model: "fake",
      }),
      createFactEmbedding({
        factId: synonym.id,
        comparisonText: "synonym",
        embedding: vector(0.99, 0.1),
        model: "fake",
      }),
      createFactEmbedding({
        factId: unrelated.id,
        comparisonText: "unrelated",
        embedding: vector(1, 0),
        model: "fake",
      }),
      createFactEmbedding({
        factId: sameDocumentFact.id,
        comparisonText: "same document",
        embedding: vector(1, 0),
        model: "fake",
      }),
    ]);

    const candidates = await retrieveFactCandidates(source.id, {
      similarityThreshold: 0.9,
      topK: 5,
    });

    expect(candidates.map(({ factId }) => factId)).toEqual([direct.id, synonym.id]);
    expect(candidates.map(({ matchReason }) => matchReason)).toEqual([
      "ENTITY_PREDICATE",
      "ENTITY_VECTOR",
    ]);
    expect(candidates[1]?.fact.normalizedContext).toMatchObject({ scope: "regional" });
    expect(candidates.map(({ factId }) => factId)).not.toContain(sameDocumentFact.id);
    expect(candidates.map(({ factId }) => factId)).not.toContain(unrelated.id);
  });

  it("enforces the similarity threshold and top K", async () => {
    const entity = await createEntity();
    const source = await createFact({ entityId: entity.id, predicate: "sales" });
    await createFactEmbedding({
      factId: source.id,
      comparisonText: "source",
      embedding: vector(1, 0),
      model: "fake",
    });

    const candidates = await Promise.all(
      [0.05, 0.1, 0.2].map(async (y, index) => {
        const fact = await createFact({ entityId: entity.id, predicate: `turnover_${index}` });
        await createFactEmbedding({
          factId: fact.id,
          comparisonText: `candidate ${index}`,
          embedding: vector(1, y),
          model: "fake",
        });
        return fact;
      }),
    );
    const belowThreshold = await createFact({ entityId: entity.id, predicate: "income" });
    await createFactEmbedding({
      factId: belowThreshold.id,
      comparisonText: "below threshold",
      embedding: vector(0, 1),
      model: "fake",
    });

    const retrieved = await retrieveFactCandidates(source.id, {
      similarityThreshold: 0.95,
      topK: 2,
    });

    expect(retrieved).toHaveLength(2);
    expect(retrieved.map(({ factId }) => factId)).toEqual(candidates.slice(0, 2).map(({ id }) => id));
    expect(retrieved.map(({ factId }) => factId)).not.toContain(belowThreshold.id);
  });

  it("requires both a strong subject match and a stronger vector match for unresolved entities", async () => {
    const subject = `${entityPrefix} Unresolved Holdings`;
    const source = await createFact({ entityId: null, subject, predicate: "revenue" });
    const matching = await createFact({ entityId: null, subject, predicate: "turnover" });
    const arbitrary = await createFact({
      entityId: null,
      subject: `${entityPrefix} Completely Different`,
      predicate: "turnover",
    });
    await Promise.all([
      createFactEmbedding({
        factId: source.id,
        comparisonText: "source",
        embedding: vector(1, 0),
        model: "fake",
      }),
      createFactEmbedding({
        factId: matching.id,
        comparisonText: "matching unresolved subject",
        embedding: vector(1, 0.05),
        model: "fake",
      }),
      createFactEmbedding({
        factId: arbitrary.id,
        comparisonText: "arbitrary unresolved subject",
        embedding: vector(1, 0),
        model: "fake",
      }),
    ]);

    await expect(
      retrieveFactCandidates(source.id, { similarityThreshold: 0.8, topK: 5 }),
    ).resolves.toEqual([
      expect.objectContaining({
        factId: matching.id,
        matchReason: "UNRESOLVED_SUBJECT_VECTOR",
      }),
    ]);
  });
});
