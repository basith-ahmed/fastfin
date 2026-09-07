import { randomUUID } from "node:crypto";

import { connectDatabase, disconnectDatabase, prisma } from "../../src/config/database";
import type { GroundedFactDraft, VerifiedEvidence } from "../../src/services/evidenceVerifier";
import { persistGroundedFacts } from "../../src/services/factPersistence";
import { validFactDraft } from "../fixtures/factDraft";

const testPrefix = "phase-6-integration";

describe("Phase 6 transactional fact persistence", () => {
  beforeAll(connectDatabase);

  beforeEach(async () => {
    await prisma.document.deleteMany({ where: { originalFilename: { startsWith: testPrefix } } });
  });

  afterEach(async () => {
    await prisma.document.deleteMany({ where: { originalFilename: { startsWith: testPrefix } } });
  });

  afterAll(disconnectDatabase);

  async function createSource(): Promise<{ documentId: string; chunkId: string }> {
    const id = randomUUID();
    const document = await prisma.document.create({
      data: {
        id,
        filename: `${id}.pdf`,
        originalFilename: `${testPrefix}-${id}.pdf`,
        mimeType: "application/pdf",
        sha256: id.replaceAll("-", "").padEnd(64, "0"),
        filePath: `/tmp/${id}.pdf`,
        fileSizeBytes: 1n,
        chunks: {
          create: {
            chunkIndex: 0,
            pageStart: 1,
            pageEnd: 1,
            text: "Acme Corporation reported revenue of $20 million in 2025.",
            tokenCount: 10,
            sha256: `${id}-chunk`,
            metadata: {},
          },
        },
      },
      include: { chunks: true },
    });
    const chunk = document.chunks[0];
    if (!chunk) {
      throw new Error("Expected source chunk.");
    }
    return { documentId: id, chunkId: chunk.id };
  }

  function grounded(chunkId: string): GroundedFactDraft {
    const evidence: VerifiedEvidence = {
      pageNumber: 1,
      quote: "Acme Corporation reported revenue of $20 million in 2025.",
      claimedQuote: "Acme Corporation reported revenue of $20 million in 2025.",
      normalizedQuote: "Acme Corporation reported revenue of $20 million in 2025.",
      contextBefore: "",
      contextAfter: "",
      startChar: 0,
      endChar: 61,
      boundingBoxes: null,
      verificationMethod: "EXACT",
      verificationScore: 1,
    };
    return {
      chunkId,
      chunkIndex: 0,
      draft: {
        ...validFactDraft,
        evidence: [{ pageNumber: 1, quote: evidence.claimedQuote }],
        qualifiers: { accounting_standard: "IFRS", membership_class: "Series A" },
      },
      verifiedEvidence: [evidence],
    };
  }

  it("persists normalized raw fact data and verified evidence together", async () => {
    const { documentId, chunkId } = await createSource();

    const result = await persistGroundedFacts(documentId, [grounded(chunkId)]);

    expect(result).toMatchObject({ createdCount: 1, duplicateCount: 0 });
    expect(result.facts[0]).toMatchObject({
      documentId,
      chunkId,
      subjectRaw: "Acme Corporation",
      subjectNormalized: "acme corporation",
      predicateRaw: "reported revenue",
      predicateCanonical: "revenue",
      valueRaw: "$20 million",
      currency: "USD",
      unit: "USD",
      qualifiers: { accounting_standard: "IFRS", membership_class: "Series A" },
      extractionMethod: "HYBRID",
    });
    expect(result.facts[0]?.normalizedNumber?.toString()).toBe("20000000");
    expect(result.facts[0]?.evidence).toHaveLength(1);
    expect(await prisma.fact.count({ where: { documentId } })).toBe(1);
    expect(await prisma.evidence.count({ where: { documentId } })).toBe(1);
  });

  it("reuses an overlap duplicate instead of inserting a second fact or evidence", async () => {
    const { documentId, chunkId } = await createSource();
    const candidate = grounded(chunkId);

    const first = await persistGroundedFacts(documentId, [candidate]);
    const second = await persistGroundedFacts(documentId, [candidate]);

    expect(first).toMatchObject({ createdCount: 1, duplicateCount: 0 });
    expect(second).toMatchObject({ createdCount: 0, duplicateCount: 1 });
    expect(second.facts[0]?.id).toBe(first.facts[0]?.id);
    expect(await prisma.fact.count({ where: { documentId } })).toBe(1);
    expect(await prisma.evidence.count({ where: { documentId } })).toBe(1);
  });

  it("rejects ungrounded input before creating a Fact", async () => {
    const { documentId, chunkId } = await createSource();
    const candidate = { ...grounded(chunkId), verifiedEvidence: [] };

    await expect(persistGroundedFacts(documentId, [candidate])).rejects.toThrow(
      "Cannot persist a fact without verified evidence.",
    );
    expect(await prisma.fact.count({ where: { documentId } })).toBe(0);
  });

});
