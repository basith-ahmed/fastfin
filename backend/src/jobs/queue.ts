import { Queue, type Job } from "bullmq";
import type IORedis from "ioredis";
import { z } from "zod";

import { closeRedisConnection, createRedisConnection } from "../config/redis";
import { serverLogger } from "../utils/logger";

export const DOCUMENT_QUEUE_NAME = "document-processing";
export const DOCUMENT_JOB_NAME = "process-document" as const;

export const documentJobDataSchema = z.object({
  documentId: z.uuid(),
});

export type DocumentJobData = z.infer<typeof documentJobDataSchema>;
export type DocumentJob = Job<DocumentJobData, void, typeof DOCUMENT_JOB_NAME>;

let queue: Queue<DocumentJobData, void, typeof DOCUMENT_JOB_NAME> | undefined;
let queueConnection: IORedis | undefined;

export function getDocumentQueue(): Queue<DocumentJobData, void, typeof DOCUMENT_JOB_NAME> {
  if (!queue) {
    queueConnection = createRedisConnection("document-queue");
    queue = new Queue<DocumentJobData, void, typeof DOCUMENT_JOB_NAME>(DOCUMENT_QUEUE_NAME, {
      connection: queueConnection,
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: "exponential",
          delay: 1_000,
        },
        removeOnComplete: false,
        removeOnFail: false,
      },
    });
  }

  return queue;
}

export async function enqueueDocument(documentId: string): Promise<DocumentJob> {
  const data = documentJobDataSchema.parse({ documentId });

  const job = await getDocumentQueue().add(DOCUMENT_JOB_NAME, data, { jobId: documentId });
  serverLogger.info({ documentId, jobId: job.id, queue: DOCUMENT_QUEUE_NAME }, "Enqueued document processing job in BullMQ");
  return job;
}

export async function getDocumentJobState(documentId: string): Promise<string | null> {
  const job = await getDocumentQueue().getJob(documentId);
  return job ? job.getState() : null;
}

export async function removeDocumentJob(documentId: string): Promise<boolean> {
  const job = await getDocumentQueue().getJob(documentId);

  if (!job) {
    return false;
  }

  await job.remove();
  return true;
}

export async function closeDocumentQueue(): Promise<void> {
  const activeQueue = queue;
  const activeConnection = queueConnection;
  queue = undefined;
  queueConnection = undefined;

  await activeQueue?.close();

  if (activeConnection) {
    await closeRedisConnection(activeConnection);
  }
}
