import {
  type IssueSeverity,
  type IssueType,
  Prisma,
  type RelationshipType,
  type ValueType,
} from "@prisma/client";

import { prisma } from "../config/database";
import { AppError } from "../middleware/errorHandler";

export type PaginationInput = {
  page: number;
  pageSize: number;
};

export type FactListInput = PaginationInput & {
  documentId?: string;
  entityId?: string;
  predicate?: string;
  valueType?: ValueType;
  minConfidence?: number;
  search?: string;
};

export type RelationshipListInput = PaginationInput & {
  type?: RelationshipType;
  documentId?: string;
  entityId?: string;
  minConfidence?: number;
};

export type IssueListInput = PaginationInput & {
  documentId?: string;
  stage?: string;
  issueType?: IssueType;
  severity?: IssueSeverity;
};

const documentMetadataSelect = {
  id: true,
  originalFilename: true,
  mimeType: true,
  pageCount: true,
  status: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.DocumentSelect;

const factInclude = {
  entity: true,
  document: { select: documentMetadataSelect },
  evidence: { orderBy: [{ pageNumber: "asc" }, { createdAt: "asc" }] },
} satisfies Prisma.FactInclude;

function pageWindow(input: PaginationInput) {
  return {
    skip: (input.page - 1) * input.pageSize,
    take: input.pageSize,
  };
}

export async function listFacts(input: FactListInput) {
  const where: Prisma.FactWhereInput = {
    documentId: input.documentId,
    entityId: input.entityId,
    predicateCanonical: input.predicate
      ? { contains: input.predicate, mode: "insensitive" }
      : undefined,
    valueType: input.valueType,
    confidence: input.minConfidence === undefined ? undefined : { gte: input.minConfidence },
    OR: input.search
      ? [
          { subjectRaw: { contains: input.search, mode: "insensitive" } },
          { predicateRaw: { contains: input.search, mode: "insensitive" } },
          { predicateCanonical: { contains: input.search, mode: "insensitive" } },
          { valueRaw: { contains: input.search, mode: "insensitive" } },
        ]
      : undefined,
  };
  const [facts, total] = await prisma.$transaction([
    prisma.fact.findMany({
      where,
      include: factInclude,
      orderBy: { createdAt: "desc" },
      ...pageWindow(input),
    }),
    prisma.fact.count({ where }),
  ]);

  return { facts, total };
}

export async function getFactDetail(factId: string) {
  const fact = await prisma.fact.findUnique({
    where: { id: factId },
    include: factInclude,
  });
  if (!fact) {
    throw new AppError(404, "FACT_NOT_FOUND", "Fact does not exist.");
  }

  const relationships = await prisma.factRelationship.findMany({
    where: { OR: [{ leftFactId: factId }, { rightFactId: factId }] },
    select: { relationshipType: true },
  });
  const byType = {
    CORROBORATES: 0,
    CONTRADICTS: 0,
    RECONCILABLE: 0,
    UNCERTAIN: 0,
  } satisfies Record<RelationshipType, number>;
  for (const relationship of relationships) {
    byType[relationship.relationshipType] += 1;
  }

  return {
    ...fact,
    relationshipsSummary: { total: relationships.length, byType },
  };
}

function relationshipWhere(input: RelationshipListInput): Prisma.FactRelationshipWhereInput {
  return {
    relationshipType: input.type,
    confidence: input.minConfidence === undefined ? undefined : { gte: input.minConfidence },
    AND: [
      input.documentId
        ? {
            OR: [
              { leftFact: { documentId: input.documentId } },
              { rightFact: { documentId: input.documentId } },
            ],
          }
        : {},
      input.entityId
        ? {
            OR: [
              { leftFact: { entityId: input.entityId } },
              { rightFact: { entityId: input.entityId } },
            ],
          }
        : {},
    ],
  };
}

export async function listRelationships(input: RelationshipListInput) {
  const where = relationshipWhere(input);
  const [relationships, total] = await prisma.$transaction([
    prisma.factRelationship.findMany({
      where,
      include: {
        leftFact: { include: factInclude },
        rightFact: { include: factInclude },
      },
      orderBy: { createdAt: "desc" },
      ...pageWindow(input),
    }),
    prisma.factRelationship.count({ where }),
  ]);

  return { relationships, total };
}

export async function getRelationshipDetail(relationshipId: string) {
  const result = await prisma.factRelationship.findUnique({
    where: { id: relationshipId },
    include: {
      leftFact: { include: factInclude },
      rightFact: { include: factInclude },
    },
  });
  if (!result) {
    throw new AppError(404, "RELATIONSHIP_NOT_FOUND", "Relationship does not exist.");
  }

  const { leftFact, rightFact, ...relationship } = result;
  const { document: leftDocument, evidence: leftEvidence, ...leftFactData } = leftFact;
  const { document: rightDocument, evidence: rightEvidence, ...rightFactData } = rightFact;

  return {
    relationship,
    leftFact: leftFactData,
    leftDocument,
    leftEvidence,
    rightFact: rightFactData,
    rightDocument,
    rightEvidence,
    contextComparison: relationship.contextComparison,
    ruleSignals: relationship.ruleSignals,
    classification: relationship.relationshipType,
    confidence: relationship.confidence,
    explanation: relationship.explanation,
    decisionMethod: relationship.decisionMethod,
  };
}

export async function listIssues(input: IssueListInput) {
  const where: Prisma.ProcessingIssueWhereInput = {
    documentId: input.documentId,
    stage: input.stage ? { equals: input.stage, mode: "insensitive" } : undefined,
    issueType: input.issueType,
    severity: input.severity,
  };
  const [issues, total] = await prisma.$transaction([
    prisma.processingIssue.findMany({
      where,
      include: { document: { select: documentMetadataSelect } },
      orderBy: { createdAt: "desc" },
      ...pageWindow(input),
    }),
    prisma.processingIssue.count({ where }),
  ]);

  return { issues, total };
}

export async function getIssueDetail(issueId: string) {
  const issue = await prisma.processingIssue.findUnique({
    where: { id: issueId },
    include: {
      document: { select: documentMetadataSelect },
      chunk: true,
      fact: { include: { entity: true, evidence: true } },
    },
  });
  if (!issue) {
    throw new AppError(404, "ISSUE_NOT_FOUND", "Processing issue does not exist.");
  }
  return issue;
}

export async function getKnowledgeSummary() {
  const [
    documents,
    facts,
    entities,
    corroborates,
    contradicts,
    reconcilable,
    uncertain,
    issues,
  ] = await prisma.$transaction([
    prisma.document.count(),
    prisma.fact.count(),
    prisma.entity.count(),
    prisma.factRelationship.count({ where: { relationshipType: "CORROBORATES" } }),
    prisma.factRelationship.count({ where: { relationshipType: "CONTRADICTS" } }),
    prisma.factRelationship.count({ where: { relationshipType: "RECONCILABLE" } }),
    prisma.factRelationship.count({ where: { relationshipType: "UNCERTAIN" } }),
    prisma.processingIssue.count(),
  ]);

  return {
    documents,
    facts,
    entities,
    relationships: { corroborates, contradicts, reconcilable, uncertain },
    issues,
  };
}
