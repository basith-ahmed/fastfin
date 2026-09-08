import { randomUUID } from "node:crypto";

import { connectDatabase, disconnectDatabase, prisma } from "../../src/config/database";
import { closeRedisConnection, createRedisConnection } from "../../src/config/redis";
import {
  extractDocumentFactDrafts,
  factExtractionCacheKey,
  type ExtractionChunk,
} from "../../src/services/factExtraction";
import { validFactDraft } from "../fixtures/factDraft";

const testPrefix = "phase-4-integration";

describe("Phase 4 fact extraction orchestration", () => {
  const redis = createRedisConnection("phase-4-integration-test");
  const cacheKeys = new Set<string>();

  beforeAll(async () => {
    await connectDatabase();
    await redis.connect();
  });

  beforeEach(async () => {
    await prisma.document.deleteMany({
      where: { originalFilename: { startsWith: testPrefix } },
    });
  });

  afterEach(async () => {
    await prisma.document.deleteMany({
      where: { originalFilename: { startsWith: testPrefix } },
    });
    if (cacheKeys.size > 0) {
      await redis.del(...cacheKeys);
      cacheKeys.clear();
    }
  });

  afterAll(async () => {
    await closeRedisConnection(redis);
    await disconnectDatabase();
  });

  async function createDocumentWithChunks(chunkTexts: string[]): Promise<{
    documentId: string;
    chunks: ExtractionChunk[];
  }> {
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
        chunks: {
          create: chunkTexts.map((text, chunkIndex) => ({
            chunkIndex,
            pageStart: chunkIndex + 1,
            pageEnd: chunkIndex + 1,
            text,
            tokenCount: 20,
            sha256: `${documentId}-${chunkIndex}`,
            metadata: {},
          })),
        },
      },
      include: { chunks: { orderBy: { chunkIndex: "asc" } } },
    });

    return {
      documentId,
      chunks: document.chunks.map(({ id, chunkIndex, sha256, text }) => ({
        id,
        chunkIndex,
        sha256,
        text,
      })),
    };
  }

  it("caches validated results and records low-confidence candidates without persisting facts", async () => {
    const { documentId, chunks } = await createDocumentWithChunks([
      "[PAGE 1]\n\nAcme reported revenue of $20 million.",
    ]);
    const lowConfidenceDraft = { ...validFactDraft, confidence: 0.4 };
    const extractFacts = jest.fn(async () => [validFactDraft, lowConfidenceDraft]);
    const provider = {
      model: "test-extraction-model",
      promptVersion: "fact-extraction-v2",
      extractFacts,
    };
    const chunk = chunks[0];
    if (!chunk) {
      throw new Error("Expected an extraction chunk.");
    }
    const key = factExtractionCacheKey(provider.promptVersion, provider.model, chunk.sha256);
    cacheKeys.add(key);

    const first = await extractDocumentFactDrafts(documentId, chunks, provider, redis, {
      minimumConfidence: 0.65,
    });
    const second = await extractDocumentFactDrafts(documentId, chunks, provider, redis, {
      minimumConfidence: 0.65,
    });

    expect(first.eligibleDrafts).toHaveLength(1);
    expect(first.lowConfidenceCount).toBe(1);
    expect(second).toEqual(first);
    expect(extractFacts).toHaveBeenCalledTimes(1);
    expect(extractFacts).toHaveBeenCalledWith(
      expect.objectContaining({
        numericalCandidates: expect.arrayContaining([
          expect.objectContaining({ raw: "$20 million", typeHint: "MONEY" }),
        ]),
      }),
    );
    expect(await prisma.processingIssue.count({ where: { documentId } })).toBe(1);
    expect(
      await prisma.processingIssue.findFirstOrThrow({ where: { documentId } }),
    ).toMatchObject({
      chunkId: chunk.id,
      issueType: "LOW_FACT_CONFIDENCE",
      stage: "EXTRACTING",
    });
    expect(await prisma.fact.count({ where: { documentId } })).toBe(0);
  });

  it("bounds concurrent provider calls", async () => {
    const { documentId, chunks } = await createDocumentWithChunks(
      Array.from({ length: 5 }, (_, index) => `[PAGE ${index + 1}]\n\nFact ${index + 1}`),
    );
    let activeCalls = 0;
    let maximumActiveCalls = 0;
    const provider = {
      model: "test-concurrency-model",
      promptVersion: "fact-extraction-v2",
      extractFacts: async () => {
        activeCalls += 1;
        maximumActiveCalls = Math.max(maximumActiveCalls, activeCalls);
        await new Promise((resolve) => setTimeout(resolve, 5));
        activeCalls -= 1;
        return [];
      },
    };
    for (const chunk of chunks) {
      cacheKeys.add(factExtractionCacheKey(provider.promptVersion, provider.model, chunk.sha256));
    }

    await extractDocumentFactDrafts(documentId, chunks, provider, redis, { concurrency: 2 });

    expect(maximumActiveCalls).toBe(2);
  });

  it("records a failed chunk and continues extracting the remaining chunks", async () => {
    const { documentId, chunks } = await createDocumentWithChunks([
      "[PAGE 1]\n\nThis chunk fails.",
      "[PAGE 2]\n\nAcme reported revenue of $20 million.",
    ]);
    const provider = {
      model: "test-resilient-model",
      promptVersion: "fact-extraction-v2",
      extractFacts: async ({ chunkText }: { chunkText: string }) => {
        if (chunkText.includes("fails")) {
          throw new Error("simulated provider outage");
        }
        return [validFactDraft];
      },
    };

    const result = await extractDocumentFactDrafts(documentId, chunks, provider, redis, {
      continueOnError: true,
      minimumConfidence: 0.65,
    });

    expect(result).toMatchObject({
      eligibleDrafts: [expect.objectContaining({ chunkId: chunks[1]?.id })],
      lowConfidenceCount: 0,
    });
    expect(
      await prisma.processingIssue.findFirstOrThrow({
        where: { documentId, issueType: "LLM_REQUEST_FAILURE" },
      }),
    ).toMatchObject({ chunkId: chunks[0]?.id, stage: "EXTRACTING" });
  });

  it("includes prompt version and model in cache identity", () => {
    const first = factExtractionCacheKey("fact-extraction-v1", "model-a", "chunk-sha");
    expect(factExtractionCacheKey("fact-extraction-v2", "model-a", "chunk-sha")).not.toBe(first);
    expect(factExtractionCacheKey("fact-extraction-v1", "model-b", "chunk-sha")).not.toBe(first);
  });
});
