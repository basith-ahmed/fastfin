import { Worker } from "bullmq";
import type IORedis from "ioredis";

import { connectDatabase, disconnectDatabase, prisma } from "./config/database";
import { closeRedisConnection, createRedisConnection } from "./config/redis";
import {
  DOCUMENT_JOB_NAME,
  DOCUMENT_QUEUE_NAME,
  documentJobDataSchema,
  type DocumentJob,
  type DocumentJobData,
} from "./jobs/queue";
import { logger } from "./utils/logger";

export type DocumentWorkerHandle = {
  worker: Worker<DocumentJobData, void, typeof DOCUMENT_JOB_NAME>;
  connection: IORedis;
};

export async function processDocumentJob(job: DocumentJob): Promise<void> {
  const { documentId } = documentJobDataSchema.parse(job.data);
  const bullJobId = job.id ?? documentId;

  try {
    const document = await prisma.document.findUnique({ where: { id: documentId } });

    if (!document) {
      throw new Error(`Document ${documentId} does not exist.`);
    }

    const storedJob = await prisma.processingJob.findFirst({
      where: { documentId, bullJobId },
      orderBy: { createdAt: "desc" },
    });

    if (!storedJob) {
      throw new Error(`ProcessingJob for document ${documentId} does not exist.`);
    }

    await prisma.processingJob.update({
      where: { id: storedJob.id },
      data: {
        status: "RUNNING",
        stage: "INGESTION_ACCEPTED",
        attempt: job.attemptsMade + 1,
        startedAt: new Date(),
        finishedAt: null,
        error: null,
      },
    });

    // Phase 2 intentionally stops after proving that the worker received a valid persisted document.
    await prisma.processingJob.update({
      where: { id: storedJob.id },
      data: {
        status: "COMPLETED",
        stage: "INGESTION_ACCEPTED",
        progress: 100,
        finishedAt: new Date(),
        metrics: { phase: 2, operation: "ingestion-placeholder" },
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : "Unknown worker error.";

    await prisma.processingJob
      .updateMany({
        where: { documentId, bullJobId },
        data: {
          status: "FAILED",
          stage: "INGESTION_ACCEPTED",
          error: message,
          finishedAt: new Date(),
        },
      })
      .catch((updateError: unknown) => {
        logger.error({ err: updateError, documentId, bullJobId }, "Failed to record job failure");
      });

    throw error;
  }
}

export function createDocumentWorker(autorun = true): DocumentWorkerHandle {
  const connection = createRedisConnection("document-worker");
  const worker = new Worker<DocumentJobData, void, typeof DOCUMENT_JOB_NAME>(
    DOCUMENT_QUEUE_NAME,
    processDocumentJob,
    { autorun, connection },
  );

  worker.on("completed", (job) => {
    logger.info({ documentId: job.data.documentId, jobId: job.id }, "Document job received");
  });
  worker.on("failed", (job, error) => {
    logger.error(
      { err: error, documentId: job?.data.documentId, jobId: job?.id },
      "Document job failed",
    );
  });
  worker.on("error", (error) => {
    logger.error({ err: error }, "Document worker error");
  });

  return { worker, connection };
}

export async function closeDocumentWorker(handle: DocumentWorkerHandle): Promise<void> {
  await handle.worker.close();
  await closeRedisConnection(handle.connection);
}

async function main(): Promise<void> {
  await connectDatabase();
  const handle = createDocumentWorker();
  await handle.worker.waitUntilReady();
  logger.info({ queue: DOCUMENT_QUEUE_NAME }, "FastFin document worker listening");

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    logger.info({ signal }, "Shutting down document worker");

    try {
      await closeDocumentWorker(handle);
      await disconnectDatabase();
    } catch (error: unknown) {
      logger.error({ err: error }, "Document worker shutdown failed");
      process.exitCode = 1;
    }
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    logger.fatal({ err: error }, "FastFin document worker failed to start");
    process.exitCode = 1;
  });
}
