import { randomUUID } from "node:crypto";
import { readdir, stat, unlink } from "node:fs/promises";
import path from "node:path";

import type { Job, Worker } from "bullmq";
import request from "supertest";

import { app } from "../../src/app";
import { connectDatabase, disconnectDatabase, prisma } from "../../src/config/database";
import { pdfStoragePath, pdfTempPath } from "../../src/config/storage";
import {
  closeDocumentQueue,
  DOCUMENT_JOB_NAME,
  getDocumentQueue,
  removeDocumentJob,
  type DocumentJobData,
} from "../../src/jobs/queue";
import { closeDocumentWorker, createDocumentWorker } from "../../src/worker";
import { createTestPdf } from "../fixtures/pdf";

const testPrefix = "phase-2-integration";

function pdfBuffer(label: string = randomUUID()): Buffer {
  return Buffer.from(`%PDF-1.4\n${label}\n%%EOF\n`);
}

async function uploadPdf(label: string = randomUUID()) {
  return request(app)
    .post("/api/documents")
    .attach("file", pdfBuffer(label), {
      filename: `${testPrefix}-${label}.pdf`,
      contentType: "application/pdf",
    });
}

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

async function waitForCompletion(
  worker: Worker<DocumentJobData, void, typeof DOCUMENT_JOB_NAME>,
  documentId: string,
): Promise<Job<DocumentJobData, void, typeof DOCUMENT_JOB_NAME>> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      cleanup();
      reject(new Error(`Timed out waiting for document job ${documentId}.`));
    }, 5_000);

    const completed = (job: Job<DocumentJobData, void, typeof DOCUMENT_JOB_NAME>) => {
      if (job.id === documentId) {
        cleanup();
        resolve(job);
      }
    };
    const failed = (
      job: Job<DocumentJobData, void, typeof DOCUMENT_JOB_NAME> | undefined,
      error: Error,
    ) => {
      if (job?.id === documentId) {
        cleanup();
        reject(error);
      }
    };
    const cleanup = () => {
      clearTimeout(timeout);
      worker.off("completed", completed);
      worker.off("failed", failed);
    };

    worker.on("completed", completed);
    worker.on("failed", failed);
  });
}

describe("Phase 2 document ingestion", () => {
  beforeAll(async () => {
    await connectDatabase();
    await getDocumentQueue().waitUntilReady();
  });

  beforeEach(async () => {
    await getDocumentQueue().obliterate({ force: true });
    await cleanTestDocuments();
  });

  afterEach(async () => {
    await getDocumentQueue().obliterate({ force: true });
    await cleanTestDocuments();
  });

  afterAll(async () => {
    await closeDocumentQueue();
    await disconnectDatabase();
  });

  it("accepts one valid PDF, persists it safely, and queues processing", async () => {
    const response = await uploadPdf("valid-upload");

    expect(response.status).toBe(202);
    expect(response.body.duplicate).toBe(false);
    expect(response.body.data).toMatchObject({
      originalFilename: `${testPrefix}-valid-upload.pdf`,
      mimeType: "application/pdf",
      status: "QUEUED",
    });
    expect(response.body.data).not.toHaveProperty("filePath");

    const document = await prisma.document.findUniqueOrThrow({
      where: { id: response.body.data.id as string },
    });
    expect(path.dirname(document.filePath)).toBe(pdfStoragePath);
    expect(path.basename(document.filePath)).toBe(`${document.id}.pdf`);
    expect(document.filename).toBe(`${document.id}.pdf`);
    await expect(stat(document.filePath)).resolves.toMatchObject({ size: pdfBuffer("valid-upload").length });

    const job = await getDocumentQueue().getJob(document.id);
    expect(job?.name).toBe(DOCUMENT_JOB_NAME);
    expect(job?.data).toEqual({ documentId: document.id });
    expect(job?.opts.attempts).toBe(3);
    expect(job?.opts.backoff).toEqual({ type: "exponential", delay: 1_000 });

    const processingJob = await prisma.processingJob.findFirstOrThrow({
      where: { documentId: document.id },
    });
    expect(processingJob).toMatchObject({
      bullJobId: document.id,
      stage: "QUEUED",
      progress: 0,
      status: "QUEUED",
    });
  });

  it("rejects an invalid MIME type and deletes the temporary file", async () => {
    const response = await request(app)
      .post("/api/documents")
      .attach("file", pdfBuffer("invalid-mime"), {
        filename: `${testPrefix}-invalid-mime.pdf`,
        contentType: "text/plain",
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_PDF_MIME");
    expect((await readdir(pdfTempPath)).filter((name) => name !== ".gitkeep")).toEqual([]);
  });

  it("rejects a fake PDF even when its extension and MIME type claim PDF", async () => {
    const response = await request(app)
      .post("/api/documents")
      .attach("file", Buffer.from("This is not a PDF."), {
        filename: `${testPrefix}-fake.pdf`,
        contentType: "application/pdf",
      });

    expect(response.status).toBe(400);
    expect(response.body.error.code).toBe("INVALID_PDF_SIGNATURE");
    expect((await readdir(pdfTempPath)).filter((name) => name !== ".gitkeep")).toEqual([]);
  });

  it("rejects a PDF over the configured upload limit", async () => {
    const oversizedPdf = Buffer.concat([Buffer.from("%PDF-"), Buffer.alloc(2_048)]);
    const response = await request(app).post("/api/documents").attach("file", oversizedPdf, {
      filename: `${testPrefix}-oversized.pdf`,
      contentType: "application/pdf",
    });

    expect(response.status).toBe(413);
    expect(response.body.error.code).toBe("PDF_TOO_LARGE");
    expect((await readdir(pdfTempPath)).filter((name) => name !== ".gitkeep")).toEqual([]);
  });

  it("returns the existing document for duplicate content without adding another job", async () => {
    const first = await uploadPdf("duplicate");
    const second = await uploadPdf("duplicate");

    expect(first.status).toBe(202);
    expect(second.status).toBe(200);
    expect(second.body.duplicate).toBe(true);
    expect(second.body.data.id).toBe(first.body.data.id);
    expect(await prisma.document.count({ where: { sha256: first.body.data.sha256 as string } })).toBe(1);
    expect(await prisma.processingJob.count({ where: { documentId: first.body.data.id as string } })).toBe(1);
    expect(await getDocumentQueue().getJobCounts("waiting", "active", "delayed")).toMatchObject({
      waiting: 1,
      active: 0,
      delayed: 0,
    });
  });

  it("lists documents with bounded pagination and optional status filtering", async () => {
    await uploadPdf("list-a");
    await uploadPdf("list-b");
    await uploadPdf("list-c");

    const response = await request(app).get("/api/documents?page=2&pageSize=1&status=QUEUED");

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].status).toBe("QUEUED");
    expect(response.body.pagination).toEqual({ page: 2, pageSize: 1, total: 3, totalPages: 3 });

    const invalid = await request(app).get("/api/documents?pageSize=101");
    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe("INVALID_REQUEST");
  });

  it("returns document detail and processing status", async () => {
    const upload = await uploadPdf("detail");
    const documentId = upload.body.data.id as string;

    const detail = await request(app).get(`/api/documents/${documentId}`);
    const status = await request(app).get(`/api/documents/${documentId}/status`);

    expect(detail.status).toBe(200);
    expect(detail.body.data.id).toBe(documentId);
    expect(detail.body.data).not.toHaveProperty("filePath");
    expect(status.status).toBe(200);
    expect(status.body.data.document.status).toBe("QUEUED");
    expect(status.body.data.processingJob).toMatchObject({ status: "QUEUED", progress: 0 });
  });

  it("streams the stored PDF without exposing its filesystem path", async () => {
    const expectedPdf = pdfBuffer("stream");
    const upload = await request(app)
      .post("/api/documents")
      .attach("file", expectedPdf, {
        filename: `${testPrefix}-stream.pdf`,
        contentType: "application/pdf",
      });

    const response = await request(app).get(`/api/documents/${upload.body.data.id as string}/file`);

    expect(response.status).toBe(200);
    expect(response.headers["content-type"]).toMatch(/^application\/pdf/);
    expect(Buffer.from(response.body as Uint8Array)).toEqual(expectedPdf);
    expect(JSON.stringify(response.body)).not.toContain(pdfStoragePath);
  });

  it("deletes the database row, queued job, and physical PDF", async () => {
    const upload = await uploadPdf("delete");
    const documentId = upload.body.data.id as string;
    const document = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });

    const response = await request(app).delete(`/api/documents/${documentId}`);

    expect(response.status).toBe(204);
    expect(await prisma.document.findUnique({ where: { id: documentId } })).toBeNull();
    expect(await getDocumentQueue().getJob(documentId)).toBeUndefined();
    await expect(stat(document.filePath)).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("handles a missing physical file during deletion", async () => {
    const upload = await uploadPdf("missing-file");
    const documentId = upload.body.data.id as string;
    const document = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
    await unlink(document.filePath);

    const response = await request(app).delete(`/api/documents/${documentId}`);

    expect(response.status).toBe(204);
    expect(await prisma.document.findUnique({ where: { id: documentId } })).toBeNull();
  });

  it("rejects reprocessing while a job is active and queues a new attempt afterward", async () => {
    const upload = await uploadPdf("reprocess");
    const documentId = upload.body.data.id as string;

    const activeResponse = await request(app).post(`/api/documents/${documentId}/reprocess`);
    expect(activeResponse.status).toBe(409);
    expect(activeResponse.body.error.code).toBe("DOCUMENT_PROCESSING");

    await removeDocumentJob(documentId);
    const response = await request(app).post(`/api/documents/${documentId}/reprocess`);

    expect(response.status).toBe(202);
    expect(response.body.data.status).toBe("QUEUED");
    expect(await getDocumentQueue().getJob(documentId)).toBeDefined();
    expect(await prisma.processingJob.count({ where: { documentId } })).toBe(2);
  });

  it("lets the worker parse and chunk a persisted document job", async () => {
    const upload = await request(app)
      .post("/api/documents")
      .attach(
        "file",
        createTestPdf([{ lines: [{ text: "Worker parsing fixture", y: 720 }] }]),
        {
          filename: `${testPrefix}-worker.pdf`,
          contentType: "application/pdf",
        },
      );
    const documentId = upload.body.data.id as string;
    const handle = createDocumentWorker(false);
    const completion = waitForCompletion(handle.worker, documentId);
    void handle.worker.run();

    try {
      await completion;
    } finally {
      await closeDocumentWorker(handle);
    }

    const processingJob = await prisma.processingJob.findFirstOrThrow({
      where: { documentId },
      orderBy: { createdAt: "desc" },
    });
    expect(processingJob).toMatchObject({
      status: "COMPLETED",
      stage: "PARSING",
      progress: 20,
    });
    expect(processingJob.metrics).toEqual({
      phase: 3,
      pageCount: 1,
      chunkCount: 1,
      issueCount: 0,
    });

    const document = await prisma.document.findUniqueOrThrow({ where: { id: documentId } });
    expect(document.status).toBe("PARSING");
    expect(document.pageCount).toBe(1);
    expect(await prisma.documentPage.count({ where: { documentId } })).toBe(1);
    expect(await prisma.chunk.count({ where: { documentId } })).toBe(1);
  });

  it("returns safe errors for invalid and missing document IDs", async () => {
    const invalid = await request(app).get("/api/documents/not-a-uuid");
    const missing = await request(app).get(`/api/documents/${randomUUID()}`);

    expect(invalid.status).toBe(400);
    expect(invalid.body.error.code).toBe("INVALID_REQUEST");
    expect(missing.status).toBe(404);
    expect(missing.body.error.code).toBe("DOCUMENT_NOT_FOUND");
  });
});
