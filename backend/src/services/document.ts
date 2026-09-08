import { randomUUID } from "node:crypto";
import { open, rename, stat, unlink } from "node:fs/promises";
import path from "node:path";

import { Prisma, type Document, type DocumentStatus } from "@prisma/client";

import { prisma } from "../config/database";
import {
  ensureStorageDirectories,
  isManagedPdfPath,
  pdfStoragePath,
} from "../config/storage";
import {
  enqueueDocument,
  getDocumentJobState,
  removeDocumentJob,
} from "../jobs/queue";
import { AppError } from "../middleware/errorHandler";
import { hashFileSha256 } from "../utils/hash";
import { logger } from "../utils/logger";

const pdfMagicBytes = Buffer.from("%PDF-");
const activeJobStates = new Set(["active", "waiting", "delayed", "prioritized", "waiting-children"]);

export type DocumentListInput = {
  page: number;
  pageSize: number;
  status?: DocumentStatus;
};

export type DocumentListResult = {
  documents: Document[];
  total: number;
};

export type UploadDocumentResult = {
  document: Document;
  duplicate: boolean;
};

async function removeFileIfPresent(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }
}

async function hasPdfMagicBytes(filePath: string): Promise<boolean> {
  const handle = await open(filePath, "r");

  try {
    const buffer = Buffer.alloc(pdfMagicBytes.length);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return bytesRead === pdfMagicBytes.length && buffer.equals(pdfMagicBytes);
  } finally {
    await handle.close();
  }
}

function assertManagedDocumentPath(document: Document): void {
  if (
    !isManagedPdfPath(document.filePath) ||
    path.basename(document.filePath) !== `${document.id}.pdf`
  ) {
    throw new AppError(500, "INVALID_DOCUMENT_PATH", "The stored document path is invalid.");
  }
}

async function createQueuedDocument(file: Express.Multer.File, sha256: string): Promise<Document> {
  ensureStorageDirectories();
  const documentId = randomUUID();
  const filename = `${documentId}.pdf`;
  const finalPath = path.join(pdfStoragePath, filename);

  await rename(file.path, finalPath);

  try {
    const document = await prisma.document.create({
      data: {
        id: documentId,
        filename,
        originalFilename: file.originalname,
        mimeType: file.mimetype,
        sha256,
        filePath: finalPath,
        fileSizeBytes: BigInt(file.size),
        status: "UPLOADED",
        processingJobs: {
          create: {
            bullJobId: documentId,
            stage: "QUEUED",
            progress: 0,
            attempt: 0,
            status: "QUEUED",
            metrics: {},
          },
        },
      },
    });

    try {
      await enqueueDocument(document.id);
      return await prisma.document.update({
        where: { id: document.id },
        data: { status: "QUEUED" },
      });
    } catch (error: unknown) {
      await prisma.document.delete({ where: { id: document.id } });
      logger.error({ err: error, documentId: document.id }, "Failed to queue uploaded document");
      throw new AppError(503, "QUEUE_UNAVAILABLE", "The document could not be queued.");
    }
  } catch (error: unknown) {
    await removeFileIfPresent(finalPath);
    throw error;
  }
}

export async function uploadDocument(file: Express.Multer.File | undefined): Promise<UploadDocumentResult> {
  if (!file) {
    throw new AppError(400, "PDF_REQUIRED", "A single PDF file is required.");
  }

  try {
    if (file.mimetype !== "application/pdf") {
      throw new AppError(400, "INVALID_PDF_MIME", "The uploaded file must use the PDF MIME type.");
    }

    if (!(await hasPdfMagicBytes(file.path))) {
      throw new AppError(400, "INVALID_PDF_SIGNATURE", "The uploaded file is not a valid PDF.");
    }

    const sha256 = await hashFileSha256(file.path);
    const duplicate = await prisma.document.findUnique({ where: { sha256 } });

    if (duplicate) {
      return { document: duplicate, duplicate: true };
    }

    try {
      return { document: await createQueuedDocument(file, sha256), duplicate: false };
    } catch (error: unknown) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
        const racedDuplicate = await prisma.document.findUnique({ where: { sha256 } });

        if (racedDuplicate) {
          return { document: racedDuplicate, duplicate: true };
        }
      }

      throw error;
    }
  } finally {
    await removeFileIfPresent(file.path);
  }
}

export async function listDocuments(input: DocumentListInput): Promise<DocumentListResult> {
  const where: Prisma.DocumentWhereInput = input.status ? { status: input.status } : {};
  const [documents, total] = await prisma.$transaction([
    prisma.document.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (input.page - 1) * input.pageSize,
      take: input.pageSize,
    }),
    prisma.document.count({ where }),
  ]);

  return { documents, total };
}

export async function getDocument(documentId: string): Promise<Document> {
  const document = await prisma.document.findUnique({ where: { id: documentId } });

  if (!document) {
    throw new AppError(404, "DOCUMENT_NOT_FOUND", "Document does not exist.");
  }

  return document;
}

export async function getDocumentStatus(documentId: string) {
  const document = await getDocument(documentId);
  const processingJob = await prisma.processingJob.findFirst({
    where: { documentId },
    orderBy: { createdAt: "desc" },
  });

  return { document, processingJob };
}

export async function getDocumentFile(documentId: string) {
  const document = await getDocument(documentId);
  assertManagedDocumentPath(document);

  try {
    const fileStats = await stat(document.filePath);
    return { document, fileStats };
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new AppError(404, "DOCUMENT_FILE_NOT_FOUND", "The stored PDF file is missing.");
    }

    throw error;
  }
}

export async function deleteDocument(documentId: string): Promise<void> {
  const document = await getDocument(documentId);
  assertManagedDocumentPath(document);
  const jobState = await getDocumentJobState(document.id);

  if (jobState === "active") {
    throw new AppError(409, "DOCUMENT_PROCESSING", "An active document cannot be deleted.");
  }

  if (jobState) {
    await removeDocumentJob(document.id);
  }

  await removeFileIfPresent(document.filePath);
  await prisma.document.delete({ where: { id: document.id } });
}

export async function reprocessDocument(documentId: string): Promise<Document> {
  const document = await getDocument(documentId);
  assertManagedDocumentPath(document);
  const jobState = await getDocumentJobState(document.id);

  if (jobState && activeJobStates.has(jobState)) {
    throw new AppError(409, "DOCUMENT_PROCESSING", "The document already has active processing.");
  }

  if (jobState) {
    await removeDocumentJob(document.id);
  }

  const latestJob = await prisma.processingJob.findFirst({
    where: { documentId },
    orderBy: { createdAt: "desc" },
  });
  const processingJob = await prisma.$transaction(async (transaction) => {
    await transaction.processingIssue.deleteMany({ where: { documentId } });
    await transaction.fact.deleteMany({ where: { documentId } });
    await transaction.chunk.deleteMany({ where: { documentId } });
    await transaction.documentPage.deleteMany({ where: { documentId } });
    await transaction.modelInvocation.deleteMany({ where: { documentId } });
    await transaction.processingJob.deleteMany({ where: { documentId } });

    const freshJob = await transaction.processingJob.create({
      data: {
        documentId,
        bullJobId: documentId,
        stage: "QUEUED",
        progress: 0,
        attempt: (latestJob?.attempt ?? 0) + 1,
        status: "QUEUED",
        metrics: {},
      },
    });
    await transaction.document.update({
      where: { id: documentId },
      data: {
        status: "QUEUED",
        pageCount: null,
        processingStartedAt: null,
        processingCompletedAt: null,
      },
    });
    return freshJob;
  });

  try {
    await enqueueDocument(documentId);
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown queue failure.";
    await prisma.$transaction([
      prisma.processingJob.update({
        where: { id: processingJob.id },
        data: { status: "FAILED", error: message, finishedAt: new Date() },
      }),
      prisma.document.update({ where: { id: documentId }, data: { status: "FAILED" } }),
    ]);
    logger.error({ err: error, documentId }, "Failed to requeue document");
    throw new AppError(503, "QUEUE_UNAVAILABLE", "The document could not be queued.");
  }

  return getDocument(documentId);
}
