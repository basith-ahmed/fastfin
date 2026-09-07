import { createHash, randomUUID } from "node:crypto";
import { unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { connectDatabase, disconnectDatabase, prisma } from "../../src/config/database";
import { ensureStorageDirectories, pdfStoragePath } from "../../src/config/storage";
import { parseAndPersistDocument } from "../../src/services/documentParsing";
import { createPhaseThreePdf } from "../fixtures/pdf";

const testPrefix = "phase-3-integration";

async function removeFileIfPresent(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

async function cleanTestDocuments(): Promise<void> {
  const documents = await prisma.document.findMany({
    where: { originalFilename: { startsWith: testPrefix } },
    select: { filePath: true },
  });
  await prisma.document.deleteMany({
    where: { originalFilename: { startsWith: testPrefix } },
  });
  await Promise.all(documents.map(({ filePath }) => removeFileIfPresent(filePath)));
}

describe("Phase 3 PDF parsing persistence", () => {
  beforeAll(async () => {
    ensureStorageDirectories();
    await connectDatabase();
  });

  beforeEach(cleanTestDocuments);
  afterEach(cleanTestDocuments);

  afterAll(async () => {
    await disconnectDatabase();
  });

  it("persists pages, geometry, issues, and page-aware chunks idempotently", async () => {
    const id = randomUUID();
    const pdf = createPhaseThreePdf();
    const filePath = path.join(pdfStoragePath, `${id}.pdf`);
    await writeFile(filePath, pdf);
    await prisma.document.create({
      data: {
        id,
        filename: `${id}.pdf`,
        originalFilename: `${testPrefix}-source.pdf`,
        mimeType: "application/pdf",
        sha256: createHash("sha256").update(pdf).digest("hex"),
        filePath,
        fileSizeBytes: BigInt(pdf.length),
        status: "PARSING",
      },
    });

    const firstResult = await parseAndPersistDocument(id, filePath);
    const firstPages = await prisma.documentPage.findMany({
      where: { documentId: id },
      orderBy: { pageNumber: "asc" },
    });
    const firstChunks = await prisma.chunk.findMany({
      where: { documentId: id },
      orderBy: { chunkIndex: "asc" },
    });
    const issues = await prisma.processingIssue.findMany({ where: { documentId: id } });
    const document = await prisma.document.findUniqueOrThrow({ where: { id } });

    expect(firstResult).toEqual({ pageCount: 3, chunkCount: firstChunks.length, issueCount: 1 });
    expect(document.pageCount).toBe(3);
    expect(firstPages).toHaveLength(3);
    expect(firstPages[0]).toMatchObject({ pageNumber: 1, width: 612, height: 792 });
    expect(firstPages[0]?.text).toContain("Revenue was $1,250,000 in 2025.");
    expect(firstPages[1]?.text).toContain("Year-over-year growth was 12.0%.");
    expect(firstPages[2]?.text).toBe("");
    expect(firstPages[0]?.textItems).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          text: expect.any(String),
          x: expect.any(Number),
          y: expect.any(Number),
          width: expect.any(Number),
          height: expect.any(Number),
          startCharacter: expect.any(Number),
          endCharacter: expect.any(Number),
        }),
      ]),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ issueType: "EMPTY_PAGE", stage: "PARSING" });
    expect(firstChunks.length).toBeGreaterThan(0);
    expect(firstChunks[0]?.text).toContain("[PAGE 1]");
    expect(firstChunks[0]?.text).toContain("[PAGE 2]");
    expect(firstChunks[0]?.pageStart).toBe(1);
    expect(firstChunks[0]?.pageEnd).toBe(2);
    expect(firstChunks[0]?.metadata).toEqual(
      expect.objectContaining({
        pageNumbers: [1, 2],
        overlapFromPrevious: false,
        estimatedTokens: firstChunks[0]?.tokenCount,
      }),
    );

    const originalPageIds = firstPages.map((page) => page.id);
    const originalChunkIds = firstChunks.map((chunk) => chunk.id);
    const secondResult = await parseAndPersistDocument(id, filePath);
    const rebuiltPages = await prisma.documentPage.findMany({ where: { documentId: id } });
    const rebuiltChunks = await prisma.chunk.findMany({ where: { documentId: id } });

    expect(secondResult).toEqual(firstResult);
    expect(rebuiltPages).toHaveLength(firstPages.length);
    expect(rebuiltChunks).toHaveLength(firstChunks.length);
    expect(rebuiltPages.some((page) => originalPageIds.includes(page.id))).toBe(false);
    expect(rebuiltChunks.some((chunk) => originalChunkIds.includes(chunk.id))).toBe(false);
    expect(await prisma.processingIssue.count({ where: { documentId: id } })).toBe(1);
  });
});
