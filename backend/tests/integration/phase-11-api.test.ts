import { createHash, randomUUID } from "node:crypto";
import { unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import request from "supertest";

import { app } from "../../src/app";
import { connectDatabase, disconnectDatabase, prisma } from "../../src/config/database";
import { ensureStorageDirectories, pdfStoragePath } from "../../src/config/storage";

const testPrefix = "phase-11-api";

function hash(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

async function removeFileIfPresent(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
  }
}

async function cleanFixtures(): Promise<void> {
  const documents = await prisma.document.findMany({
    where: { originalFilename: { startsWith: testPrefix } },
    select: { filePath: true },
  });
  await prisma.document.deleteMany({
    where: { originalFilename: { startsWith: testPrefix } },
  });
  await prisma.entity.deleteMany({
    where: { canonicalName: { startsWith: testPrefix } },
  });
  await Promise.all(documents.map(({ filePath }) => removeFileIfPresent(filePath)));
}

async function createFixtures() {
  ensureStorageDirectories();
  const documentIds = [randomUUID(), randomUUID()];
  const documents = await Promise.all(
    documentIds.map(async (id, index) => {
      const filePath = path.join(pdfStoragePath, `${id}.pdf`);
      if (index === 0) await writeFile(filePath, Buffer.from("%PDF-1.4\nphase 11\n%%EOF\n"));
      return prisma.document.create({
        data: {
          id,
          filename: `${id}.pdf`,
          originalFilename: `${testPrefix}-${index + 1}.pdf`,
          mimeType: "application/pdf",
          sha256: hash(`${testPrefix}-${id}`),
          filePath,
          fileSizeBytes: 27,
          pageCount: 1,
          status: "COMPLETED",
          processingJobs:
            index === 0
              ? {
                  create: {
                    bullJobId: id,
                    stage: "COMPLETED",
                    progress: 100,
                    attempt: 1,
                    status: "COMPLETED",
                    metrics: { durationMs: 12, factsAccepted: 1 },
                  },
                }
              : undefined,
          pages: {
            create: {
              pageNumber: 1,
              text: `Revenue evidence ${index + 1}`,
              textItems: [],
              width: 612,
              height: 792,
            },
          },
          chunks: {
            create: {
              chunkIndex: 0,
              pageStart: 1,
              pageEnd: 1,
              text: `Revenue evidence ${index + 1}`,
              tokenCount: 3,
              sha256: hash(`${testPrefix}-chunk-${id}`),
              metadata: {},
            },
          },
        },
        include: { chunks: true },
      });
    }),
  );
  const entity = await prisma.entity.create({
    data: {
      canonicalName: `${testPrefix} Acme Limited`,
      normalizedName: `${testPrefix}-${randomUUID()}`,
      entityType: "ORGANIZATION",
      metadata: {},
    },
  });
  const factIds = [randomUUID(), randomUUID()].sort();
  const facts = await Promise.all(
    documents.map((document, index) =>
      prisma.fact.create({
        data: {
          id: factIds[index],
          documentId: document.id,
          chunkId: document.chunks[0]!.id,
          entityId: entity.id,
          subjectRaw: "Acme Limited",
          subjectType: "ORGANIZATION",
          subjectNormalized: "acme",
          predicateRaw: "reported revenue",
          predicateCanonical: "revenue",
          valueRaw: index === 0 ? "$10 million" : "$12 million",
          valueType: "MONEY",
          normalizedNumber: index === 0 ? 10_000_000 : 12_000_000,
          unit: "USD",
          currency: "USD",
          qualifiers: {},
          normalizedContext: { time: { kind: "FISCAL_YEAR", label: "FY2025" } },
          confidence: index === 0 ? 0.96 : 0.88,
          extractionMethod: "HYBRID",
          factSignature: hash(`${testPrefix}-fact-${document.id}`),
          evidence: {
            create: {
              documentId: document.id,
              pageNumber: 1,
              quote: `Revenue evidence ${index + 1}`,
              normalizedQuote: `revenue evidence ${index + 1}`,
              contextBefore: "",
              contextAfter: "",
              verificationMethod: "EXACT",
              verificationScore: 1,
            },
          },
        },
      }),
    ),
  );
  const relationship = await prisma.factRelationship.create({
    data: {
      leftFactId: facts[0]!.id,
      rightFactId: facts[1]!.id,
      relationshipType: "CONTRADICTS",
      confidence: 0.91,
      explanation: "The same period reports different revenue values.",
      contextComparison: { period: "same", scope: "same" },
      ruleSignals: { valueMatch: false },
      decisionMethod: "LLM",
      modelName: "phase-11-test",
      promptVersion: "test-v1",
    },
  });
  const issue = await prisma.processingIssue.create({
    data: {
      documentId: documents[0]!.id,
      factId: facts[0]!.id,
      stage: "EMBEDDING",
      issueType: "EMBEDDING_FAILURE",
      severity: "WARNING",
      message: "Embedding was retried.",
      metadata: { retry: true },
    },
  });

  return { documents, entity, facts, relationship, issue };
}

describe("Phase 11 backend REST API", () => {
  beforeAll(async () => {
    await connectDatabase();
  });

  beforeEach(cleanFixtures);
  afterEach(cleanFixtures);

  afterAll(async () => {
    await disconnectDatabase();
  });

  it("returns enriched document detail, pages, PDF, and nested resources", async () => {
    const fixture = await createFixtures();
    const documentId = fixture.documents[0]!.id;
    const [detail, pages, pdf, facts, relationships, issues] = await Promise.all([
      request(app).get(`/api/documents/${documentId}`),
      request(app).get(`/api/documents/${documentId}/pages?page=1&pageSize=1`),
      request(app).get(`/api/documents/${documentId}/pdf`),
      request(app).get(`/api/documents/${documentId}/facts`),
      request(app).get(`/api/documents/${documentId}/relationships`),
      request(app).get(`/api/documents/${documentId}/issues`),
    ]);

    expect(detail.status).toBe(200);
    expect(detail.body.data).toMatchObject({
      id: documentId,
      pageCount: 1,
      counts: { facts: 1, relationships: 1, issues: 1 },
      metrics: { durationMs: 12, factsAccepted: 1 },
      latestProcessingJob: { status: "COMPLETED", progress: 100 },
    });
    expect(detail.body.data).not.toHaveProperty("filePath");
    expect(pages.body.pagination).toEqual({ page: 1, pageSize: 1, total: 1, totalPages: 1 });
    expect(pages.body.data[0]).toMatchObject({ pageNumber: 1, text: "Revenue evidence 1" });
    expect(pdf.status).toBe(200);
    expect(pdf.headers["content-type"]).toMatch(/^application\/pdf/);
    expect(facts.body.pagination.total).toBe(1);
    expect(relationships.body.pagination.total).toBe(1);
    expect(issues.body.pagination.total).toBe(1);

    const missingFile = await request(app).get(`/api/documents/${fixture.documents[1]!.id}/pdf`);
    expect(missingFile.status).toBe(404);
    expect(missingFile.body.error.code).toBe("DOCUMENT_FILE_NOT_FOUND");

    const uploadWithoutFile = await request(app).post("/api/documents/upload");
    expect(uploadWithoutFile.status).toBe(400);
    expect(uploadWithoutFile.body.error.code).toBe("PDF_REQUIRED");
  });

  it("filters and paginates facts and returns complete fact detail", async () => {
    const fixture = await createFixtures();
    const response = await request(app).get("/api/facts").query({
      documentId: fixture.documents[0]!.id,
      entityId: fixture.entity.id,
      predicate: "REV",
      valueType: "MONEY",
      minConfidence: "0.9",
      search: "million",
      page: "1",
      pageSize: "1",
    });

    expect(response.status).toBe(200);
    expect(response.body.pagination).toEqual({ page: 1, pageSize: 1, total: 1, totalPages: 1 });
    expect(response.body.data[0]).toMatchObject({
      id: fixture.facts[0]!.id,
      entity: { id: fixture.entity.id },
      document: { id: fixture.documents[0]!.id },
      evidence: [{ quote: "Revenue evidence 1", pageNumber: 1 }],
    });

    const detail = await request(app).get(`/api/facts/${fixture.facts[0]!.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.relationshipsSummary).toEqual({
      total: 1,
      byType: { CORROBORATES: 0, CONTRADICTS: 1, RECONCILABLE: 0, UNCERTAIN: 0 },
    });
    expect(detail.body.data).toMatchObject({
      entity: { id: fixture.entity.id },
      evidence: [{ pageNumber: 1 }],
      document: { id: fixture.documents[0]!.id },
    });
  });

  it("filters relationships and returns both evidence-grounded sides", async () => {
    const fixture = await createFixtures();
    const response = await request(app).get("/api/relationships").query({
      type: "CONTRADICTS",
      documentId: fixture.documents[0]!.id,
      entityId: fixture.entity.id,
      minConfidence: "0.9",
      page: "1",
      pageSize: "10",
    });

    expect(response.status).toBe(200);
    expect(response.body.pagination).toEqual({ page: 1, pageSize: 10, total: 1, totalPages: 1 });
    expect(response.body.data[0]).toMatchObject({
      id: fixture.relationship.id,
      relationshipType: "CONTRADICTS",
      leftFact: { evidence: [{ pageNumber: 1 }] },
      rightFact: { evidence: [{ pageNumber: 1 }] },
    });

    const detail = await request(app).get(`/api/relationships/${fixture.relationship.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data).toMatchObject({
      classification: "CONTRADICTS",
      confidence: 0.91,
      decisionMethod: "LLM",
      leftDocument: { id: fixture.documents[0]!.id },
      leftEvidence: [{ quote: "Revenue evidence 1" }],
      rightDocument: { id: fixture.documents[1]!.id },
      rightEvidence: [{ quote: "Revenue evidence 2" }],
      contextComparison: { period: "same", scope: "same" },
      ruleSignals: { valueMatch: false },
    });
  });

  it("filters issues and returns the knowledge summary shape", async () => {
    const fixture = await createFixtures();
    const response = await request(app).get("/api/issues").query({
      documentId: fixture.documents[0]!.id,
      stage: "embedding",
      issueType: "EMBEDDING_FAILURE",
      severity: "WARNING",
      page: "1",
      pageSize: "20",
    });

    expect(response.status).toBe(200);
    expect(response.body.pagination).toEqual({ page: 1, pageSize: 20, total: 1, totalPages: 1 });
    expect(response.body.data[0]).toMatchObject({
      id: fixture.issue.id,
      document: { id: fixture.documents[0]!.id },
    });

    const detail = await request(app).get(`/api/issues/${fixture.issue.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data).toMatchObject({
      fact: { id: fixture.facts[0]!.id, evidence: [{ pageNumber: 1 }] },
      document: { id: fixture.documents[0]!.id },
    });

    const summary = await request(app).get("/api/knowledge/summary");
    expect(summary.status).toBe(200);
    expect(summary.body.data).toMatchObject({
      documents: expect.any(Number),
      facts: expect.any(Number),
      entities: expect.any(Number),
      relationships: {
        corroborates: expect.any(Number),
        contradicts: expect.any(Number),
        reconcilable: expect.any(Number),
        uncertain: expect.any(Number),
      },
      issues: expect.any(Number),
    });
    expect(summary.body.data.relationships.contradicts).toBeGreaterThanOrEqual(1);
  });

  it("rejects invalid parameters and reports missing singular resources", async () => {
    await createFixtures();
    const missingId = randomUUID();
    const invalidResponses = await Promise.all([
      request(app).get("/api/facts/not-a-uuid"),
      request(app).get("/api/relationships/not-a-uuid"),
      request(app).get("/api/issues/not-a-uuid"),
      request(app).get("/api/facts?pageSize=101"),
      request(app).get("/api/relationships?type=INVALID"),
      request(app).get("/api/issues?severity=CRITICAL"),
    ]);
    for (const response of invalidResponses) {
      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe("INVALID_REQUEST");
    }

    const missingResponses = await Promise.all([
      request(app).get(`/api/facts/${missingId}`),
      request(app).get(`/api/relationships/${missingId}`),
      request(app).get(`/api/issues/${missingId}`),
      request(app).get(`/api/documents/${missingId}/facts`),
    ]);
    expect(missingResponses.map((response) => response.status)).toEqual([404, 404, 404, 404]);
    expect(missingResponses.map((response) => response.body.error.code)).toEqual([
      "FACT_NOT_FOUND",
      "RELATIONSHIP_NOT_FOUND",
      "ISSUE_NOT_FOUND",
      "DOCUMENT_NOT_FOUND",
    ]);
  });
});
