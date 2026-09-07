import { randomUUID } from "node:crypto";

import { connectDatabase, disconnectDatabase, prisma } from "../../src/config/database";
import { verifyDocumentFactDrafts } from "../../src/services/evidenceVerifier";
import type { ExtractedFactDraft } from "../../src/services/factExtraction";
import { validFactDraft } from "../fixtures/factDraft";

const testPrefix = "phase-5-integration";

describe("Phase 5 evidence grounding persistence", () => {
  beforeAll(connectDatabase);

  beforeEach(async () => {
    await prisma.document.deleteMany({
      where: { originalFilename: { startsWith: testPrefix } },
    });
  });

  afterEach(async () => {
    await prisma.document.deleteMany({
      where: { originalFilename: { startsWith: testPrefix } },
    });
  });

  afterAll(disconnectDatabase);

  async function createSource(): Promise<{ documentId: string; chunkId: string }> {
    const documentId = randomUUID();
    const document = await prisma.document.create({
      data: {
        id: documentId,
        filename: `${documentId}.pdf`,
        originalFilename: `${testPrefix}-${documentId}.pdf`,
        mimeType: "application/pdf",
        sha256: documentId.replaceAll("-", "").padEnd(64, "0"),
        filePath: `/tmp/${documentId}.pdf`,
        fileSizeBytes: 1n,
        status: "EXTRACTING",
        pages: {
          create: {
            pageNumber: 1,
            text: "Acme Corporation reported revenue of $20 million in 2025.",
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
            text: "[PAGE 1]\n\nAcme Corporation reported revenue of $20 million in 2025.",
            tokenCount: 20,
            sha256: `${documentId}-chunk`,
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
    return { documentId, chunkId: chunk.id };
  }

  function extracted(chunkId: string, evidence: FactDraftEvidence): ExtractedFactDraft {
    return {
      chunkId,
      chunkIndex: 0,
      draft: { ...validFactDraft, evidence },
    };
  }

  type FactDraftEvidence = Array<{ pageNumber: number; quote: string }>;

  it("rejects an entirely ungrounded draft, creates an idempotent issue, and creates no Fact", async () => {
    const { documentId, chunkId } = await createSource();
    const drafts = [extracted(chunkId, [{ pageNumber: 1, quote: "Fabricated evidence quote." }])];

    await expect(verifyDocumentFactDrafts(documentId, drafts, "test-model")).resolves.toEqual([]);
    await expect(verifyDocumentFactDrafts(documentId, drafts, "test-model")).resolves.toEqual([]);

    expect(await prisma.fact.count({ where: { documentId } })).toBe(0);
    expect(await prisma.processingIssue.count({ where: { documentId } })).toBe(1);
    const issue = await prisma.processingIssue.findFirstOrThrow({ where: { documentId } });
    expect(issue).toMatchObject({
      chunkId,
      stage: "EVIDENCE",
      issueType: "EVIDENCE_NOT_FOUND",
      severity: "WARNING",
    });
    expect(issue.metadata).toEqual(
      expect.objectContaining({
        subject: "Acme Corporation",
        predicate: "revenue",
        rawValue: "$20 million",
        model: "test-model",
      }),
    );
  });

  it("allows a draft with one valid evidence item and clears stale rejection issues", async () => {
    const { documentId, chunkId } = await createSource();
    const invalid = [extracted(chunkId, [{ pageNumber: 1, quote: "Fabricated evidence quote." }])];
    await verifyDocumentFactDrafts(documentId, invalid, "test-model");
    const mixed = [
      extracted(chunkId, [
        { pageNumber: 2, quote: "This exists only on the wrong page." },
        {
          pageNumber: 1,
          quote: "Acme Corporation reported revenue of $20 million in 2025.",
        },
      ]),
    ];

    const grounded = await verifyDocumentFactDrafts(documentId, mixed, "test-model");

    expect(grounded).toHaveLength(1);
    expect(grounded[0]?.verifiedEvidence).toHaveLength(1);
    expect(grounded[0]?.verifiedEvidence[0]).toMatchObject({
      pageNumber: 1,
      verificationMethod: "EXACT",
      verificationScore: 1,
    });
    expect(await prisma.processingIssue.count({ where: { documentId } })).toBe(0);
    expect(await prisma.fact.count({ where: { documentId } })).toBe(0);
  });
});
