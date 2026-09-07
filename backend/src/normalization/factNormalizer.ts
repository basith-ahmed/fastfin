import type { FactDraft } from "../ai/types";
import type { GroundedFactDraft, VerifiedEvidence } from "../services/evidenceVerifier";
import { hashTextSha256 } from "../utils/hash";
import { normalizeContext, type NormalizedContext } from "./contextNormalizer";
import { normalizeValue, type NormalizedValue } from "./valueNormalizers";

export type NormalizedFactDraft = {
  documentId: string;
  chunkId: string;
  subjectRaw: string;
  subjectNormalized: string;
  predicateRaw: string;
  predicateCanonical: string;
  valueRaw: string;
  valueType: FactDraft["value"]["type"];
  normalizedText: string | null;
  normalizedNumber: number | null;
  normalizedDate: Date | null;
  unit: string | null;
  currency: string | null;
  qualifiers: FactDraft["qualifiers"];
  normalizedContext: NormalizedContext;
  confidence: number;
  factSignature: string;
  verifiedEvidence: VerifiedEvidence[];
};

export function normalizeSubject(value: string): string {
  return value.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("en");
}

export function normalizePredicate(value: string): string {
  return value
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{N}]+/gu, "_")
    .replace(/_+/gu, "_")
    .replace(/^_|_$/gu, "");
}

function canonicalize(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

export type FactSignatureInput = {
  documentId: string;
  subjectNormalized: string;
  predicateCanonical: string;
  value: NormalizedValue;
  context: NormalizedContext;
  evidence: VerifiedEvidence[];
};

export function createFactSignature(input: FactSignatureInput): string {
  const evidenceLocations = input.evidence
    .map(({ pageNumber, startChar, endChar, normalizedQuote }) => ({
      pageNumber,
      startChar,
      endChar,
      normalizedQuote,
    }))
    .sort(
      (left, right) =>
        left.pageNumber - right.pageNumber ||
        left.startChar - right.startChar ||
        left.endChar - right.endChar ||
        left.normalizedQuote.localeCompare(right.normalizedQuote),
    );
  return hashTextSha256(
    JSON.stringify(
      canonicalize({
        documentId: input.documentId,
        subject: input.subjectNormalized,
        predicate: input.predicateCanonical,
        value: input.value,
        context: input.context,
        evidence: evidenceLocations,
      }),
    ),
  );
}

export function normalizeGroundedFact(
  documentId: string,
  grounded: GroundedFactDraft,
): NormalizedFactDraft {
  const subjectNormalized = normalizeSubject(grounded.draft.subject.text);
  const predicateCanonical = normalizePredicate(grounded.draft.predicate.canonical);
  const value = normalizeValue(grounded.draft.value);
  const normalizedContext = normalizeContext(grounded.draft.context);
  const factSignature = createFactSignature({
    documentId,
    subjectNormalized,
    predicateCanonical,
    value,
    context: normalizedContext,
    evidence: grounded.verifiedEvidence,
  });

  return {
    documentId,
    chunkId: grounded.chunkId,
    subjectRaw: grounded.draft.subject.text,
    subjectNormalized,
    predicateRaw: grounded.draft.predicate.raw,
    predicateCanonical,
    valueRaw: grounded.draft.value.raw,
    valueType: grounded.draft.value.type,
    ...value,
    qualifiers: { ...grounded.draft.qualifiers },
    normalizedContext,
    confidence: grounded.draft.confidence,
    factSignature,
    verifiedEvidence: grounded.verifiedEvidence,
  };
}
