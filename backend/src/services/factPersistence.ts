import { Prisma } from "@prisma/client";

import { prisma } from "../config/database";
import { normalizeGroundedFact } from "../normalization/factNormalizer";
import type { GroundedFactDraft } from "./evidenceVerifier";

export type PersistedFact = Prisma.FactGetPayload<{ include: { evidence: true } }>;

export type FactPersistenceResult = {
  facts: PersistedFact[];
  createdCount: number;
  duplicateCount: number;
};

function jsonValue(value: unknown): Prisma.InputJsonValue {
  return value as Prisma.InputJsonValue;
}

export async function persistGroundedFacts(
  documentId: string,
  groundedDrafts: GroundedFactDraft[],
): Promise<FactPersistenceResult> {
  if (groundedDrafts.some(({ verifiedEvidence }) => verifiedEvidence.length === 0)) {
    throw new Error("Cannot persist a fact without verified evidence.");
  }

  const normalizedDrafts = groundedDrafts.map((grounded) =>
    normalizeGroundedFact(documentId, grounded),
  );

  return prisma.$transaction(async (transaction) => {
    const facts: PersistedFact[] = [];
    let createdCount = 0;

    for (const normalized of normalizedDrafts) {
      const duplicate = await transaction.fact.findUnique({
        where: {
          documentId_factSignature: {
            documentId,
            factSignature: normalized.factSignature,
          },
        },
        include: { evidence: true },
      });
      if (duplicate) {
        facts.push(duplicate);
        continue;
      }

      const fact = await transaction.fact.upsert({
        where: {
          documentId_factSignature: {
            documentId,
            factSignature: normalized.factSignature,
          },
        },
        update: {},
        create: {
          documentId,
          chunkId: normalized.chunkId,
          subjectRaw: normalized.subjectRaw,
          subjectNormalized: normalized.subjectNormalized,
          predicateRaw: normalized.predicateRaw,
          predicateCanonical: normalized.predicateCanonical,
          valueRaw: normalized.valueRaw,
          valueType: normalized.valueType,
          normalizedText: normalized.normalizedText,
          normalizedNumber:
            normalized.normalizedNumber === null
              ? null
              : new Prisma.Decimal(normalized.normalizedNumber.toString()),
          normalizedDate: normalized.normalizedDate,
          unit: normalized.unit,
          currency: normalized.currency,
          qualifiers: jsonValue(normalized.qualifiers),
          normalizedContext: jsonValue(normalized.normalizedContext),
          confidence: normalized.confidence,
          extractionMethod: "HYBRID",
          factSignature: normalized.factSignature,
          evidence: {
            create: normalized.verifiedEvidence.map((evidence) => ({
              documentId,
              pageNumber: evidence.pageNumber,
              quote: evidence.quote,
              normalizedQuote: evidence.normalizedQuote,
              contextBefore: evidence.contextBefore,
              contextAfter: evidence.contextAfter,
              startChar: evidence.startChar,
              endChar: evidence.endChar,
              boundingBoxes:
                evidence.boundingBoxes === null
                  ? Prisma.DbNull
                  : jsonValue(evidence.boundingBoxes),
              verificationMethod: evidence.verificationMethod,
              verificationScore: evidence.verificationScore,
            })),
          },
        },
        include: { evidence: true },
      });
      facts.push(fact);
      createdCount += 1;
    }

    return {
      facts,
      createdCount,
      duplicateCount: normalizedDrafts.length - createdCount,
    };
  });
}
