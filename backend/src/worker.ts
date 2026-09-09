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
import { workerLogger } from "./utils/logger";

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
  workerLogger.info(
    { documentId, jobId: bullJobId, attempt: job.attemptsMade + 1 },
    "Processing document job picked up from queue",
  );
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

  worker.on("active", (job, previousState) => {
    workerLogger.info(
      {
        documentId: job.data.documentId,
        jobId: job.id,
        attempt: job.attemptsMade + 1,
        previousState,
      },
      "Document processing job is active",
    );
  });
  worker.on("completed", (job) => {
    workerLogger.info(
      { documentId: job.data.documentId, jobId: job.id },
      "Document processing job completed successfully",
    );
  });
  worker.on("failed", (job, error) => {
    workerLogger.error(
      { err: error, documentId: job?.data.documentId, jobId: job?.id },
      `Document processing job failed: ${error?.message || "Unknown error"}`,
    );
  });
  worker.on("error", (error) => {
    workerLogger.error({ err: error }, "Document worker internal error");
  });
  worker.on("stalled", (jobId, previousState) => {
    workerLogger.warn(
      { jobId, previousState },
      "Document processing job stalled and will be recovered by BullMQ",
    );
  });
  worker.on("drained", () => {
    workerLogger.debug({ queue: DOCUMENT_QUEUE_NAME }, "Document queue is drained; waiting for jobs");
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
  workerLogger.info({ queue: DOCUMENT_QUEUE_NAME }, `FastFin document worker listening on queue "${DOCUMENT_QUEUE_NAME}"`);

  let shuttingDown = false;
  const shutdown = async (signal: NodeJS.Signals) => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    workerLogger.info({ signal }, "Shutting down document worker");

    try {
      await closeDocumentWorker(handle);
      await disconnectDatabase();
      workerLogger.info("Document worker stopped successfully");
    } catch (error: unknown) {
      workerLogger.error({ err: error }, "Document worker shutdown failed");
      process.exitCode = 1;
    }
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));
}

if (require.main === module) {
  void main().catch((error: unknown) => {
    workerLogger.fatal({ err: error }, "FastFin document worker failed to start");
    process.exitCode = 1;
  });
}
