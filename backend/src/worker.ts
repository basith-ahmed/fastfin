import { Worker } from "bullmq";
import type IORedis from "ioredis";

import { connectDatabase, disconnectDatabase } from "./config/database";
import { closeRedisConnection, createRedisConnection } from "./config/redis";
import {
  processDocument,
  type DocumentProcessorDependencies,
} from "./jobs/documentProcessor";
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

export async function processDocumentJob(
  job: DocumentJob,
  dependencies: DocumentProcessorDependencies = {},
): Promise<void> {
  const { documentId } = documentJobDataSchema.parse(job.data);
  const bullJobId = job.id ?? documentId;
  await processDocument(
    documentId,
    { bullJobId, attempt: job.attemptsMade + 1 },
    dependencies,
  );
}

export function createDocumentWorker(
  autorun = true,
  dependencies: DocumentProcessorDependencies = {},
): DocumentWorkerHandle {
  const connection = createRedisConnection("document-worker");
  const processorDependencies: DocumentProcessorDependencies = {
    extractionCache: connection,
    ...dependencies,
  };
  const worker = new Worker<DocumentJobData, void, typeof DOCUMENT_JOB_NAME>(
    DOCUMENT_QUEUE_NAME,
    (job) => processDocumentJob(job, processorDependencies),
    { autorun, connection },
  );

  worker.on("completed", (job) => {
    logger.info({ documentId: job.data.documentId, jobId: job.id }, "Document processing completed");
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
