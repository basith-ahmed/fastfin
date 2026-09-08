import { randomUUID } from "node:crypto";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import type { FactDraft, RelationshipReasoningProvider } from "../../src/ai/types";
import { connectDatabase, disconnectDatabase, prisma } from "../../src/config/database";
import { processDocument } from "../../src/jobs/documentProcessor";
import { createTestPdf } from "../fixtures/pdf";

const testPrefix = "Phase 10 Test";
const filenamePrefix = "phase-10-integration";

const quotes = {
  revenue100: `${testPrefix} Acme Corp reported revenue of $100 million for FY2025.`,
  revenue50: `${testPrefix} Acme Corp reported H1 revenue of $50 million for FY2025.`,
  employees1000: `${testPrefix} Acme Corp reported 1,000 employees for FY2025.`,
  employees900: `${testPrefix} Acme Corp reported 900 employees for FY2025.`,
};

function draft(input: {
  predicate: string;
  value: string;
  valueType: "MONEY" | "NUMBER" | "PERCENTAGE";
  period: string;
  quote: string;
}): FactDraft {
  return {
    subject: { text: `${testPrefix} Acme Corp`, type: "ORGANIZATION" },
    predicate: { raw: input.predicate, canonical: input.predicate },
    value: { raw: input.value, type: input.valueType },
    qualifiers: {},
    context: {
      time: input.period,
      geography: null,
      scope: "consolidated",
      segment: null,
      basis: null,
      statusAsOf: null,
    },
    evidence: [{ pageNumber: 1, quote: input.quote }],
    confidence: 0.99,
  };
}

const draftsByMarker: Record<string, FactDraft[]> = {
  DOC_A: [
    draft({
      predicate: "annual_revenue",
      value: "$100 million",
      valueType: "MONEY",
      period: "FY2025",
      quote: quotes.revenue100,
    }),
    draft({
      predicate: "employee_count",
      value: "1,000",
      valueType: "NUMBER",
      period: "FY2025",
      quote: quotes.employees1000,
    }),
  ],
  DOC_B: [
    draft({
      predicate: "annual_revenue",
      value: "$100 million",
      valueType: "MONEY",
      period: "FY2025",
      quote: quotes.revenue100,
    }),
    draft({
      predicate: "employee_count",
      value: "900",
      valueType: "NUMBER",
      period: "FY2025",
      quote: quotes.employees900,
    }),
  ],
  DOC_C: [
    draft({
      predicate: "annual_revenue",
      value: "$50 million",
      valueType: "MONEY",
      period: "H1 FY2025",
      quote: quotes.revenue50,
    }),
    draft({
      predicate: "operating_margin",
      value: "12%",
      valueType: "PERCENTAGE",
      period: "FY2025",
      quote: "This evidence quote is intentionally absent from the PDF.",
    }),
  ],
  DOC_D: [
    draft({
      predicate: "annual_revenue",
      value: "$100 million",
      valueType: "MONEY",
      period: "FY2025",
      quote: quotes.revenue100,
    }),
  ],
};

const extractionProvider = {
  model: "phase-10-fake-extraction",
  promptVersion: "phase-10-test-v1",
  extractFacts: async ({ chunkText }: { chunkText: string }) => {
    const marker = Object.keys(draftsByMarker).find((candidate) => chunkText.includes(candidate));
    return marker ? (draftsByMarker[marker] ?? []) : [];
  },
};

const embeddingProvider = {
  model: "phase-10-fake-embedding",
  dimensions: 768,
  embed: async () => [1, ...Array.from({ length: 767 }, () => 0)],
};

class FakeRelationshipProvider implements RelationshipReasoningProvider {
  readonly model = "phase-10-fake-reasoner";
  readonly promptVersion = "phase-10-test-v1";

  async reasonRelationship(input: Parameters<RelationshipReasoningProvider["reasonRelationship"]>[0]) {
    const periodDiffers = input.factA.period !== input.factB.period;
    return {
      classification: periodDiffers ? ("RECONCILABLE" as const) : ("CONTRADICTS" as const),
      confidence: 0.95,
      explanation: periodDiffers
        ? "The values describe different reporting periods."
        : "The values differ under the same reporting context.",
      decisiveContext: [
        {
          dimension: "period",
          factA: input.factA.period,
          factB: input.factB.period,
          effect: periodDiffers ? ("EXPLAINS_DIFFERENCE" as const) : ("SUPPORTS_CONTRADICTION" as const),
        },
      ],
    };
  }
}

describe("Phase 10 document processing orchestrator", () => {
  let fixtureDirectory: string;

  beforeAll(async () => {
    await connectDatabase();
    fixtureDirectory = await mkdtemp(path.join(tmpdir(), "fastfin-phase-10-"));
  });

  afterEach(async () => {
    await prisma.document.deleteMany({
      where: { originalFilename: { startsWith: filenamePrefix } },
    });
    await prisma.entity.deleteMany({
      where: { canonicalName: { startsWith: testPrefix } },
    });
  });

  afterAll(async () => {
    await rm(fixtureDirectory, { recursive: true, force: true });
    await disconnectDatabase();
  });

  async function createQueuedDocument(marker: keyof typeof draftsByMarker, lines: string[]) {
    const id = randomUUID();
    const filePath = path.join(fixtureDirectory, `${id}.pdf`);
    await writeFile(
      filePath,
      createTestPdf([
        {
          lines: [marker, ...lines].map((text, index) => ({ text, y: 740 - index * 24 })),
        },
      ]),
    );
    return prisma.document.create({
      data: {
        id,
        filename: `${id}.pdf`,
        originalFilename: `${filenamePrefix}-${marker}-${id}.pdf`,
        mimeType: "application/pdf",
        sha256: id.replaceAll("-", "").padEnd(64, "0"),
        filePath,
        fileSizeBytes: 1n,
        status: "QUEUED",
        processingJobs: {
          create: {
            bullJobId: id,
            stage: "QUEUED",
            progress: 0,
            attempt: 0,
            status: "QUEUED",
            metrics: {},
          },
        },
      },
    });
  }

  async function runDocument(documentId: string) {
    return processDocument(
      documentId,
      { bullJobId: documentId, attempt: 1 },
      {
        extractionProvider,
        embeddingProvider,
        relationshipProvider: new FakeRelationshipProvider(),
      },
    );
  }

  it("processes A/B/C end to end and incrementally links D without reprocessing old PDFs", async () => {
    const documentA = await createQueuedDocument("DOC_A", [
      quotes.revenue100,
      quotes.employees1000,
    ]);
    const documentB = await createQueuedDocument("DOC_B", [
      quotes.revenue100,
      quotes.employees900,
    ]);
    const documentC = await createQueuedDocument("DOC_C", [quotes.revenue50]);

    await runDocument(documentA.id);
    const metricsA = await runDocument(documentA.id);
    const metricsB = await runDocument(documentB.id);
    const metricsC = await runDocument(documentC.id);

    expect(metricsA.factsAccepted).toBe(2);
    expect(await prisma.fact.count({ where: { documentId: documentA.id } })).toBe(2);
    expect(await prisma.documentPage.count({ where: { documentId: documentA.id } })).toBe(1);
    expect(metricsB.relationshipsCreated).toBe(2);
    expect(metricsC.factsRejected).toBe(1);
    expect(
      await prisma.document.findMany({
        where: { id: { in: [documentA.id, documentB.id] } },
        select: { status: true },
      }),
    ).toEqual([{ status: "COMPLETED" }, { status: "COMPLETED" }]);
    expect(await prisma.document.findUniqueOrThrow({ where: { id: documentC.id } })).toMatchObject({
      status: "COMPLETED_WITH_ISSUES",
    });

    const facts = await prisma.fact.findMany({
      where: { documentId: { in: [documentA.id, documentB.id, documentC.id] } },
      include: { evidence: true },
    });
    expect(facts).toHaveLength(5);
    expect(facts.every((fact) => fact.evidence.length > 0)).toBe(true);
    expect(
      await prisma.factEmbedding.count({ where: { factId: { in: facts.map(({ id }) => id) } } }),
    ).toBe(5);
    expect(
      await prisma.factRelationship.findMany({
        select: { relationshipType: true },
        distinct: ["relationshipType"],
      }),
    ).toEqual(
      expect.arrayContaining([
        { relationshipType: "CORROBORATES" },
        { relationshipType: "CONTRADICTS" },
        { relationshipType: "RECONCILABLE" },
      ]),
    );
    expect(
      await prisma.processingIssue.findFirst({
        where: { documentId: documentC.id, issueType: "EVIDENCE_NOT_FOUND" },
      }),
    ).not.toBeNull();

    const oldPages = await prisma.documentPage.findMany({
      where: { documentId: { in: [documentA.id, documentB.id, documentC.id] } },
      select: { id: true, documentId: true, createdAt: true },
      orderBy: { id: "asc" },
    });
    const oldRelationshipCount = await prisma.factRelationship.count();
    const documentD = await createQueuedDocument("DOC_D", [quotes.revenue100]);
    const metricsD = await runDocument(documentD.id);

    expect(metricsD.relationshipsCreated).toBeGreaterThan(0);
    expect(
      await prisma.documentPage.findMany({
        where: { documentId: { in: [documentA.id, documentB.id, documentC.id] } },
        select: { id: true, documentId: true, createdAt: true },
        orderBy: { id: "asc" },
      }),
    ).toEqual(oldPages);
    expect(await prisma.factRelationship.count()).toBeGreaterThan(oldRelationshipCount);
    expect(await prisma.document.findUniqueOrThrow({ where: { id: documentD.id } })).toMatchObject({
      status: "COMPLETED",
    });
  });

  it("marks a fatal PDF parse failure on both the document and processing job", async () => {
    const document = await createQueuedDocument("DOC_A", []);
    await writeFile(document.filePath, Buffer.from("%PDF-invalid"));

    await expect(runDocument(document.id)).rejects.toThrow();
    expect(await prisma.document.findUniqueOrThrow({ where: { id: document.id } })).toMatchObject({
      status: "FAILED",
    });
    expect(
      await prisma.processingJob.findFirstOrThrow({ where: { documentId: document.id } }),
    ).toMatchObject({ status: "FAILED", stage: "PARSING" });
    expect(
      await prisma.processingIssue.findFirstOrThrow({ where: { documentId: document.id } }),
    ).toMatchObject({ issueType: "PDF_PARSE_FAILURE", severity: "ERROR" });
  });
});
