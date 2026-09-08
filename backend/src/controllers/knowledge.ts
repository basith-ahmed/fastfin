import {
  IssueSeverity,
  IssueType,
  RelationshipType,
  ValueType,
} from "@prisma/client";
import type { RequestHandler } from "express";
import { z } from "zod";

import { getDocument } from "../services/document";
import {
  getFactDetail,
  getIssueDetail,
  getKnowledgeSummary,
  getRelationshipDetail,
  listFacts,
  listIssues,
  listRelationships,
} from "../services/knowledge";

const uuidSchema = z.uuid();
const paginationShape = {
  page: z.coerce.number().int().positive().default(1),
  pageSize: z.coerce.number().int().positive().max(100).default(20),
};
const factListSchema = z.object({
  ...paginationShape,
  documentId: z.uuid().optional(),
  entityId: z.uuid().optional(),
  predicate: z.string().trim().min(1).max(200).optional(),
  valueType: z.enum(ValueType).optional(),
  minConfidence: z.coerce.number().min(0).max(1).optional(),
  search: z.string().trim().min(1).max(500).optional(),
});
const relationshipListSchema = z.object({
  ...paginationShape,
  type: z.enum(RelationshipType).optional(),
  documentId: z.uuid().optional(),
  entityId: z.uuid().optional(),
  minConfidence: z.coerce.number().min(0).max(1).optional(),
});
const issueListSchema = z.object({
  ...paginationShape,
  documentId: z.uuid().optional(),
  stage: z.string().trim().min(1).max(100).optional(),
  issueType: z.enum(IssueType).optional(),
  severity: z.enum(IssueSeverity).optional(),
});

function parseId(value: unknown): string {
  return uuidSchema.parse(value);
}

function pagination(input: { page: number; pageSize: number }, total: number) {
  return {
    page: input.page,
    pageSize: input.pageSize,
    total,
    totalPages: Math.ceil(total / input.pageSize),
  };
}

export const getFacts: RequestHandler = async (req, res) => {
  const input = factListSchema.parse(req.query);
  const result = await listFacts(input);
  res.status(200).json({
    data: result.facts,
    pagination: pagination(input, result.total),
  });
};

export const getDocumentFacts: RequestHandler = async (req, res) => {
  const documentId = parseId(req.params.id);
  await getDocument(documentId);
  const input = factListSchema.omit({ documentId: true }).parse(req.query);
  const result = await listFacts({ ...input, documentId });
  res.status(200).json({
    data: result.facts,
    pagination: pagination(input, result.total),
  });
};

export const getFactById: RequestHandler = async (req, res) => {
  const fact = await getFactDetail(parseId(req.params.id));
  res.status(200).json({ data: fact });
};

export const getRelationships: RequestHandler = async (req, res) => {
  const input = relationshipListSchema.parse(req.query);
  const result = await listRelationships(input);
  res.status(200).json({
    data: result.relationships,
    pagination: pagination(input, result.total),
  });
};

export const getDocumentRelationships: RequestHandler = async (req, res) => {
  const documentId = parseId(req.params.id);
  await getDocument(documentId);
  const input = relationshipListSchema.omit({ documentId: true }).parse(req.query);
  const result = await listRelationships({ ...input, documentId });
  res.status(200).json({
    data: result.relationships,
    pagination: pagination(input, result.total),
  });
};

export const getRelationshipById: RequestHandler = async (req, res) => {
  const relationship = await getRelationshipDetail(parseId(req.params.id));
  res.status(200).json({ data: relationship });
};

export const getIssues: RequestHandler = async (req, res) => {
  const input = issueListSchema.parse(req.query);
  const result = await listIssues(input);
  res.status(200).json({
    data: result.issues,
    pagination: pagination(input, result.total),
  });
};

export const getDocumentIssues: RequestHandler = async (req, res) => {
  const documentId = parseId(req.params.id);
  await getDocument(documentId);
  const input = issueListSchema.omit({ documentId: true }).parse(req.query);
  const result = await listIssues({ ...input, documentId });
  res.status(200).json({
    data: result.issues,
    pagination: pagination(input, result.total),
  });
};

export const getIssueById: RequestHandler = async (req, res) => {
  const issue = await getIssueDetail(parseId(req.params.id));
  res.status(200).json({ data: issue });
};

export const getSummary: RequestHandler = async (_req, res) => {
  res.status(200).json({ data: await getKnowledgeSummary() });
};
