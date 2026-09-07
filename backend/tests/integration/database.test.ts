import { randomUUID } from "node:crypto";

import { Prisma } from "@prisma/client";

import { connectDatabase, disconnectDatabase, prisma } from "../../src/config/database";
import { createFactEmbedding } from "../../src/services/factEmbedding";

const testPrefix = "phase-1-integration";

async function createDocument(sha256 = randomUUID()) {
  const unique = randomUUID();

  return prisma.document.create({
    data: {
      filename: `${testPrefix}-${unique}.pdf`,
      originalFilename: `${testPrefix}-${unique}.pdf`,
      mimeType: "application/pdf",
      sha256,
      filePath: `/tmp/${testPrefix}-${unique}.pdf`,
      fileSizeBytes: 1_024n,
    },
  });
}

async function createChunk(documentId: string, chunkIndex = 0) {
  return prisma.chunk.create({
    data: {
      documentId,
      chunkIndex,
      pageStart: 1,
      pageEnd: 1,
      text: "Revenue was INR 125 million in fiscal year 2025.",
      tokenCount: 11,
      sha256: randomUUID(),
      metadata: { headings: ["Financial highlights"] },
    },
  });
}

async function createFact(documentId: string, chunkId: string) {
  const unique = randomUUID();

  return prisma.fact.create({
    data: {
      documentId,
      chunkId,
      subjectRaw: "FastFin Limited",
      subjectNormalized: "fastfin limited",
      predicateRaw: "reported revenue",
      predicateCanonical: "revenue",
      valueRaw: "₹12.5 crore",
      valueType: "MONEY",
      normalizedNumber: new Prisma.Decimal("125000000"),
      unit: "INR",
      currency: "INR",
      qualifiers: {
        reportingPeriod: { kind: "fiscal-year", value: "FY2025" },
        audited: true,
        sourceLabels: ["revenue", "net sales"],
      },
      normalizedContext: {
        period: { start: "2024-04-01", end: "2025-03-31" },
        scope: "consolidated",
        geography: null,
      },
      confidence: 0.98,
      extractionMethod: "HYBRID",
      factSignature: `fastfin-limited|revenue|FY2025|${unique}`,
      evidence: {
        create: {
          documentId,
          pageNumber: 1,
          quote: "Revenue was ₹12.5 crore in fiscal year 2025.",
          normalizedQuote: "revenue was inr 12.5 crore in fiscal year 2025",
          contextBefore: "Financial highlights.",
          contextAfter: "The result was audited.",
          startChar: 21,
          endChar: 68,
          boundingBoxes: [{ x: 10, y: 20, width: 200, height: 14 }],
          verificationMethod: "EXACT",
          verificationScore: 1,
        },
      },
    },
    include: { evidence: true },
  });
}

describe("Phase 1 PostgreSQL persistence", () => {
  beforeAll(async () => {
    await connectDatabase();
  });

  afterAll(async () => {
    await prisma.document.deleteMany({
      where: { originalFilename: { startsWith: testPrefix } },
    });
    await prisma.entity.deleteMany({
      where: { normalizedName: { startsWith: testPrefix } },
    });
    await disconnectDatabase();
  });

  it("connects to PostgreSQL", async () => {
    const result = await prisma.$queryRaw<Array<{ value: number }>>`SELECT 1 AS value`;

    expect(result).toEqual([{ value: 1 }]);
  });

  it("has the vector and pg_trgm extensions", async () => {
    const extensions = await prisma.$queryRaw<Array<{ extname: string }>>`
      SELECT extname
      FROM pg_extension
      WHERE extname IN ('vector', 'pg_trgm')
      ORDER BY extname
    `;

    expect(extensions.map(({ extname }) => extname)).toEqual(["pg_trgm", "vector"]);
  });

  it("creates every Phase 1 domain table and required index", async () => {
    const tables = await prisma.$queryRaw<Array<{ tablename: string }>>`
      SELECT tablename
      FROM pg_tables
      WHERE schemaname = 'public'
        AND tablename <> '_prisma_migrations'
      ORDER BY tablename
    `;
    const indexes = await prisma.$queryRaw<Array<{ indexname: string }>>`
      SELECT indexname
      FROM pg_indexes
      WHERE schemaname = 'public'
    `;

    expect(tables.map(({ tablename }) => tablename)).toEqual([
      "chunks",
      "document_pages",
      "documents",
      "entities",
      "entity_aliases",
      "evidence",
      "fact_embeddings",
      "fact_relationships",
      "facts",
      "model_invocations",
      "processing_issues",
      "processing_jobs",
    ]);
    expect(indexes.map(({ indexname }) => indexname)).toEqual(
      expect.arrayContaining([
        "documents_sha256_key",
        "document_pages_document_id_page_number_key",
        "chunks_document_id_idx",
        "chunks_document_id_chunk_index_key",
        "entity_aliases_entity_id_idx",
        "entity_aliases_normalized_alias_idx",
        "facts_document_id_idx",
        "facts_entity_id_idx",
        "facts_predicate_canonical_idx",
        "facts_value_type_idx",
        "facts_fact_signature_idx",
        "evidence_fact_id_idx",
        "evidence_document_id_idx",
        "evidence_document_id_page_number_idx",
        "fact_relationships_left_fact_id_right_fact_id_key",
      ]),
    );
  });

  it("creates a Document and applies the initial status", async () => {
    const document = await createDocument();

    expect(document.id).toEqual(expect.any(String));
    expect(document.status).toBe("UPLOADED");
    expect(document.fileSizeBytes).toBe(1_024n);
  });

  it("rejects duplicate document SHA-256 values", async () => {
    const sha256 = randomUUID();
    await createDocument(sha256);

    await expect(createDocument(sha256)).rejects.toMatchObject({ code: "P2002" });
  });

  it("enforces one DocumentPage per document and page number", async () => {
    const document = await createDocument();
    const data = {
      documentId: document.id,
      pageNumber: 1,
      text: "Page text",
      textItems: [{ text: "Page", transform: [1, 0, 0, 1, 12, 40] }],
      width: 612,
      height: 792,
    };

    await prisma.documentPage.create({ data });

    await expect(prisma.documentPage.create({ data })).rejects.toMatchObject({ code: "P2002" });
  });

  it("enforces one Chunk per document and chunk index", async () => {
    const document = await createDocument();
    await createChunk(document.id);

    await expect(createChunk(document.id)).rejects.toMatchObject({ code: "P2002" });
  });

  it("persists flexible qualifiers, normalized context, a Fact, and verified Evidence", async () => {
    const document = await createDocument();
    const chunk = await createChunk(document.id);
    const fact = await createFact(document.id, chunk.id);

    expect(fact.qualifiers).toEqual({
      reportingPeriod: { kind: "fiscal-year", value: "FY2025" },
      audited: true,
      sourceLabels: ["revenue", "net sales"],
    });
    expect(fact.normalizedContext).toEqual({
      period: { start: "2024-04-01", end: "2025-03-31" },
      scope: "consolidated",
      geography: null,
    });
    expect(fact.evidence).toHaveLength(1);
    expect(fact.evidence[0]?.verificationMethod).toBe("EXACT");
  });

  it("enforces relationship pair uniqueness and ordered, distinct fact IDs", async () => {
    const leftDocument = await createDocument();
    const rightDocument = await createDocument();
    const leftChunk = await createChunk(leftDocument.id);
    const rightChunk = await createChunk(rightDocument.id);
    const firstFact = await createFact(leftDocument.id, leftChunk.id);
    const secondFact = await createFact(rightDocument.id, rightChunk.id);
    const [leftFactId, rightFactId] = [firstFact.id, secondFact.id].sort();
    const relationship = {
      leftFactId: leftFactId!,
      rightFactId: rightFactId!,
      relationshipType: "CORROBORATES" as const,
      confidence: 0.96,
      explanation: "The normalized values and reporting contexts agree.",
      contextComparison: { period: "same", scope: "same" },
      ruleSignals: { normalizedValueEqual: true },
      decisionMethod: "RULE" as const,
      promptVersion: "rules-v1",
    };

    await prisma.factRelationship.create({ data: relationship });

    await expect(prisma.factRelationship.create({ data: relationship })).rejects.toMatchObject({
      code: "P2002",
    });
    await expect(
      prisma.factRelationship.create({
        data: { ...relationship, leftFactId: firstFact.id, rightFactId: firstFact.id },
      }),
    ).rejects.toThrow("fact_relationships_ordered_pair_check");
  });

  it("stores only 768-dimensional FactEmbedding vectors through the application boundary", async () => {
    const document = await createDocument();
    const chunk = await createChunk(document.id);
    const fact = await createFact(document.id, chunk.id);
    const embedding = Array.from({ length: 768 }, (_, index) => index / 768);

    await createFactEmbedding({
      factId: fact.id,
      comparisonText: "fastfin limited | revenue | 125000000 INR | FY2025 | consolidated",
      embedding,
      model: "integration-test-embedding",
    });

    const stored = await prisma.$queryRaw<
      Array<{ dimensions: number; vectorDimensions: number }>
    >(Prisma.sql`
      SELECT "dimensions", vector_dims("embedding") AS "vectorDimensions"
      FROM "fact_embeddings"
      WHERE "fact_id" = ${fact.id}::uuid
    `);

    expect(stored).toEqual([{ dimensions: 768, vectorDimensions: 768 }]);
    await expect(
      createFactEmbedding({
        factId: fact.id,
        comparisonText: "invalid vector",
        embedding: [0, 1],
        model: "integration-test-embedding",
      }),
    ).rejects.toThrow("Too small");
  });

  it("cascades document deletion through derived records and relationships but retains entities", async () => {
    const entity = await prisma.entity.create({
      data: {
        canonicalName: "Phase 1 Test Entity",
        normalizedName: `${testPrefix}-${randomUUID()}`,
        entityType: "ORGANIZATION",
        metadata: { test: true },
      },
    });
    const deletedDocument = await createDocument();
    const retainedDocument = await createDocument();
    await prisma.documentPage.create({
      data: {
        documentId: deletedDocument.id,
        pageNumber: 1,
        text: "Evidence page",
        textItems: [],
        width: 612,
        height: 792,
      },
    });
    const deletedChunk = await createChunk(deletedDocument.id);
    const retainedChunk = await createChunk(retainedDocument.id);
    const deletedFact = await createFact(deletedDocument.id, deletedChunk.id);
    const retainedFact = await createFact(retainedDocument.id, retainedChunk.id);
    await prisma.fact.update({
      where: { id: deletedFact.id },
      data: { entityId: entity.id },
    });
    await createFactEmbedding({
      factId: deletedFact.id,
      comparisonText: "cascade test",
      embedding: Array.from({ length: 768 }, () => 0),
      model: "integration-test-embedding",
    });
    await prisma.processingIssue.create({
      data: {
        documentId: deletedDocument.id,
        chunkId: deletedChunk.id,
        factId: deletedFact.id,
        stage: "EVIDENCE_VERIFICATION",
        issueType: "EVIDENCE_AMBIGUOUS",
        severity: "WARNING",
        message: "Cascade test issue",
        metadata: {},
      },
    });
    await prisma.processingJob.create({
      data: {
        documentId: deletedDocument.id,
        stage: "PARSING",
        progress: 50,
        status: "RUNNING",
        metrics: {},
      },
    });
    const [leftFactId, rightFactId] = [deletedFact.id, retainedFact.id].sort();
    await prisma.factRelationship.create({
      data: {
        leftFactId: leftFactId!,
        rightFactId: rightFactId!,
        relationshipType: "UNCERTAIN",
        confidence: 0.5,
        explanation: "Cascade test relationship.",
        contextComparison: {},
        ruleSignals: {},
        decisionMethod: "RULE",
        promptVersion: "rules-v1",
      },
    });

    await prisma.document.delete({ where: { id: deletedDocument.id } });

    const [pages, chunks, facts, evidence, embeddings, issues, jobs, relationships, entities] =
      await Promise.all([
        prisma.documentPage.count({ where: { documentId: deletedDocument.id } }),
        prisma.chunk.count({ where: { documentId: deletedDocument.id } }),
        prisma.fact.count({ where: { documentId: deletedDocument.id } }),
        prisma.evidence.count({ where: { documentId: deletedDocument.id } }),
        prisma.$queryRaw<Array<{ count: bigint }>>(Prisma.sql`
          SELECT COUNT(*) AS "count"
          FROM "fact_embeddings"
          WHERE "fact_id" = ${deletedFact.id}::uuid
        `),
        prisma.processingIssue.count({ where: { documentId: deletedDocument.id } }),
        prisma.processingJob.count({ where: { documentId: deletedDocument.id } }),
        prisma.factRelationship.count({
          where: { OR: [{ leftFactId: deletedFact.id }, { rightFactId: deletedFact.id }] },
        }),
        prisma.entity.count({ where: { id: entity.id } }),
      ]);

    expect({ pages, chunks, facts, evidence, issues, jobs, relationships }).toEqual({
      pages: 0,
      chunks: 0,
      facts: 0,
      evidence: 0,
      issues: 0,
      jobs: 0,
      relationships: 0,
    });
    expect(embeddings).toEqual([{ count: 0n }]);
    expect(entities).toBe(1);
  });

  it("enforces processing progress between zero and one hundred", async () => {
    const document = await createDocument();

    await expect(
      prisma.processingJob.create({
        data: {
          documentId: document.id,
          stage: "PARSING",
          progress: 101,
          status: "RUNNING",
          metrics: {},
        },
      }),
    ).rejects.toThrow("processing_jobs_progress_check");
  });
});
