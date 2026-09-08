import { createReadStream } from "node:fs";
import { pipeline } from "node:stream/promises";

import { DocumentStatus, type Document, type ProcessingJob } from "@prisma/client";
import type { RequestHandler } from "express";
import { z } from "zod";

import {
  deleteDocument,
  getDocumentDetail,
  getDocumentFile,
  getDocumentStatus,
  listDocumentPages,
  listDocuments,
  reprocessDocument,
  uploadDocument,
} from "../services/document";

const documentIdSchema = z.uuid();
const listDocumentsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
  status: z.enum(DocumentStatus).optional(),
});
const paginationSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
});

function serializeDocument(document: Document) {
  const { filePath: _filePath, fileSizeBytes, ...safeDocument } = document;
  void _filePath;
  return { ...safeDocument, fileSizeBytes: Number(fileSizeBytes) };
}

function serializeProcessingJob(processingJob: ProcessingJob | null) {
  return processingJob;
}

function parseDocumentId(value: unknown): string {
  return documentIdSchema.parse(value);
}

export const createDocument: RequestHandler = async (req, res) => {
  const result = await uploadDocument(req.file);
  res.status(result.duplicate ? 200 : 202).json({
    data: serializeDocument(result.document),
    duplicate: result.duplicate,
  });
};

export const getDocuments: RequestHandler = async (req, res) => {
  const input = listDocumentsSchema.parse(req.query);
  const result = await listDocuments(input);

  res.status(200).json({
    data: result.documents.map(serializeDocument),
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      total: result.total,
      totalPages: Math.ceil(result.total / input.pageSize),
    },
  });
};

export const getDocumentById: RequestHandler = async (req, res) => {
  const result = await getDocumentDetail(parseDocumentId(req.params.id));
  res.status(200).json({
    data: {
      ...serializeDocument(result.document),
      counts: result.counts,
      latestProcessingJob: serializeProcessingJob(result.latestProcessingJob),
      metrics: result.metrics,
    },
  });
};

export const getDocumentPagesById: RequestHandler = async (req, res) => {
  const input = paginationSchema.parse(req.query);
  const result = await listDocumentPages(parseDocumentId(req.params.id), input);
  res.status(200).json({
    data: result.pages,
    pagination: {
      page: input.page,
      pageSize: input.pageSize,
      total: result.total,
      totalPages: Math.ceil(result.total / input.pageSize),
    },
  });
};

export const getDocumentStatusById: RequestHandler = async (req, res) => {
  const result = await getDocumentStatus(parseDocumentId(req.params.id));
  res.status(200).json({
    data: {
      document: serializeDocument(result.document),
      processingJob: serializeProcessingJob(result.processingJob),
    },
  });
};

export const streamDocumentFile: RequestHandler = async (req, res) => {
  const { document, fileStats } = await getDocumentFile(parseDocumentId(req.params.id));
  res.status(200);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader("Content-Length", fileStats.size);
  res.setHeader("Content-Disposition", `inline; filename="${document.filename}"`);
  await pipeline(createReadStream(document.filePath), res);
};

export const removeDocument: RequestHandler = async (req, res) => {
  await deleteDocument(parseDocumentId(req.params.id));
  res.status(204).end();
};

export const reprocessDocumentById: RequestHandler = async (req, res) => {
  const document = await reprocessDocument(parseDocumentId(req.params.id));
  res.status(202).json({ data: serializeDocument(document) });
};
