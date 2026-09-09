import { Prisma } from "@prisma/client";

import { prisma } from "../config/database";
import { chunkDocument } from "../pdf/chunker";
import { parsePdf } from "../pdf/parser";
import { assembleDocumentPages } from "../pdf/textAssembler";
import { workerLogger } from "../utils/logger";

const PARSING_STAGE = "PARSING";
const parsingIssueTypes = ["PDF_PARSE_FAILURE", "EMPTY_PAGE", "OCR_REQUIRED"] as const;

export type DocumentParsingResult = {
  pageCount: number;
  chunkCount: number;
  issueCount: number;
};

function json(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export async function parseAndPersistDocument(
  documentId: string,
  filePath: string,
): Promise<DocumentParsingResult> {
  const startedAt = Date.now();
  workerLogger.info({ documentId, filePath }, "Reading and parsing PDF");
  const parsed = await parsePdf(filePath);
  workerLogger.info(
    { documentId, parsedPages: parsed.pages.length, durationMs: Date.now() - startedAt },
    "PDF text extraction completed",
  );
  const pages = assembleDocumentPages(parsed.pages);
  const chunks = chunkDocument(pages);
  workerLogger.info(
    {
      documentId,
      pageCount: pages.length,
      chunkCount: chunks.length,
      emptyPages: pages.filter((page) => page.text.trim().length === 0).length,
    },
    "Created document pages and text chunks",
  );
  const issues = pages.flatMap((page) => {
    if (page.text.trim().length > 0) {
      return [];
    }

    const emptyPageIssue = {
      documentId,
      stage: PARSING_STAGE,
      issueType: "EMPTY_PAGE" as const,
      severity: "WARNING" as const,
      message: `Page ${page.pageNumber} contains no usable text.`,
      metadata: json({ pageNumber: page.pageNumber }),
    };

    if (!page.hasImages) {
      return [emptyPageIssue];
    }

    return [
      emptyPageIssue,
      {
        documentId,
        stage: PARSING_STAGE,
        issueType: "OCR_REQUIRED" as const,
        severity: "WARNING" as const,
        message: `Page ${page.pageNumber} appears image-based and requires OCR.`,
        metadata: json({ pageNumber: page.pageNumber }),
      },
    ];
  });

  await prisma.$transaction(async (transaction) => {
    await transaction.chunk.deleteMany({ where: { documentId } });
    await transaction.documentPage.deleteMany({ where: { documentId } });
    await transaction.processingIssue.deleteMany({
      where: { documentId, stage: PARSING_STAGE, issueType: { in: [...parsingIssueTypes] } },
    });

    if (pages.length > 0) {
      await transaction.documentPage.createMany({
        data: pages.map((page) => ({
          documentId,
          pageNumber: page.pageNumber,
          text: page.text,
          textItems: json(page.textItems),
          width: page.width,
          height: page.height,
        })),
      });
    }

    if (chunks.length > 0) {
      await transaction.chunk.createMany({
        data: chunks.map((chunk) => ({
          documentId,
          chunkIndex: chunk.chunkIndex,
          pageStart: chunk.pageStart,
          pageEnd: chunk.pageEnd,
          text: chunk.text,
          tokenCount: chunk.tokenCount,
          sha256: chunk.sha256,
          metadata: json(chunk.metadata),
        })),
      });
    }

    if (issues.length > 0) {
      await transaction.processingIssue.createMany({ data: issues });
    }

    await transaction.document.update({
      where: { id: documentId },
      data: { pageCount: pages.length },
    });
  });

  workerLogger.info(
    {
      documentId,
      pageCount: pages.length,
      chunkCount: chunks.length,
      issueCount: issues.length,
      durationMs: Date.now() - startedAt,
    },
    "Persisted parsed PDF pages, chunks, and parsing issues",
  );

  return { pageCount: pages.length, chunkCount: chunks.length, issueCount: issues.length };
}
