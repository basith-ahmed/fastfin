import { Prisma, type VerificationMethod } from "@prisma/client";
import { z } from "zod";

import type { FactDraft } from "../ai/types";
import { env } from "../config/env";
import { prisma } from "../config/database";
import type { ExtractedFactDraft } from "./factExtraction";

const CONTEXT_CHARACTERS = 200;
const MINIMUM_FUZZY_TOKENS = 5;

const textItemSchema = z.object({
  text: z.string(),
  x: z.number().finite(),
  y: z.number().finite(),
  width: z.number().finite().nonnegative(),
  height: z.number().finite().nonnegative(),
  startCharacter: z.number().int().nonnegative(),
  endCharacter: z.number().int().nonnegative(),
  lineNumber: z.number().int().positive(),
});

const textItemsSchema = z.array(textItemSchema);

export type EvidencePage = {
  pageNumber: number;
  text: string;
  textItems: unknown;
};

export type BoundingBox = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type VerifiedEvidence = {
  pageNumber: number;
  quote: string;
  claimedQuote: string;
  normalizedQuote: string;
  contextBefore: string;
  contextAfter: string;
  startChar: number;
  endChar: number;
  boundingBoxes: BoundingBox[] | null;
  verificationMethod: VerificationMethod;
  verificationScore: number;
};

export type EvidenceVerificationResult =
  | { valid: true; evidence: VerifiedEvidence }
  | {
      valid: false;
      reason: "PAGE_NOT_FOUND" | "WRONG_PAGE" | "NO_RELIABLE_MATCH";
      bestScore?: number;
    };

export type GroundedFactDraft = ExtractedFactDraft & {
  verifiedEvidence: VerifiedEvidence[];
};

type NormalizedText = {
  text: string;
  sourceIndexes: number[];
};

function isLetterOrNumber(value: string | undefined): boolean {
  return value !== undefined && /[\p{L}\p{N}]/u.test(value);
}

function lineWrapEnd(text: string, hyphenIndex: number): number | undefined {
  if (!isLetterOrNumber(text[hyphenIndex - 1])) {
    return undefined;
  }

  let cursor = hyphenIndex + 1;
  while (text[cursor] === " " || text[cursor] === "\t") {
    cursor += 1;
  }
  if (text[cursor] === "\r") {
    cursor += 1;
  }
  if (text[cursor] !== "\n") {
    return undefined;
  }
  cursor += 1;
  while (/\s/u.test(text[cursor] ?? "")) {
    cursor += 1;
  }
  return isLetterOrNumber(text[cursor]) ? cursor : undefined;
}

function normalizeCharacter(character: string): string {
  return character
    .normalize("NFKC")
    .replace(/[‘’‚‛]/gu, "'")
    .replace(/[“”„‟]/gu, '"')
    .replace(/[‐‑‒–—―]/gu, "-");
}

export function normalizeEvidenceText(source: string): NormalizedText {
  let normalized = "";
  const sourceIndexes: number[] = [];

  for (let sourceIndex = 0; sourceIndex < source.length; ) {
    if (source[sourceIndex] === "-") {
      const wrapEnd = lineWrapEnd(source, sourceIndex);
      if (wrapEnd !== undefined) {
        sourceIndex = wrapEnd;
        continue;
      }
    }

    const codePoint = source.codePointAt(sourceIndex);
    if (codePoint === undefined) {
      break;
    }
    const sourceCharacter = String.fromCodePoint(codePoint);
    const replacement = normalizeCharacter(sourceCharacter);
    if (/^\s+$/u.test(replacement)) {
      if (normalized.length > 0 && !normalized.endsWith(" ")) {
        normalized += " ";
        sourceIndexes.push(sourceIndex);
      }
    } else {
      normalized += replacement;
      sourceIndexes.push(...Array.from({ length: replacement.length }, () => sourceIndex));
    }
    sourceIndex += sourceCharacter.length;
  }

  if (normalized.endsWith(" ")) {
    normalized = normalized.slice(0, -1);
    sourceIndexes.pop();
  }

  return { text: normalized, sourceIndexes };
}

function sourceEndForNormalizedIndex(source: string, sourceIndex: number): number {
  const codePoint = source.codePointAt(sourceIndex);
  return sourceIndex + (codePoint !== undefined && codePoint > 0xffff ? 2 : 1);
}

function originalOffsets(
  source: string,
  normalized: NormalizedText,
  normalizedStart: number,
  normalizedEnd: number,
): { start: number; end: number } | undefined {
  const start = normalized.sourceIndexes[normalizedStart];
  const lastSourceIndex = normalized.sourceIndexes[normalizedEnd - 1];
  if (start === undefined || lastSourceIndex === undefined) {
    return undefined;
  }
  return { start, end: sourceEndForNormalizedIndex(source, lastSourceIndex) };
}

/**
 * Text item coordinates are retained in PDF's original bottom-left coordinate
 * system. Browser conversion belongs to the PDF viewer.
 */
export function boundingBoxesForOffsets(
  textItems: unknown,
  startChar: number,
  endChar: number,
): BoundingBox[] | null {
  const parsedItems = textItemsSchema.safeParse(textItems);
  if (!parsedItems.success) {
    return null;
  }

  const intersecting = parsedItems.data.filter(
    (item) => item.endCharacter > startChar && item.startCharacter < endChar,
  );
  if (intersecting.length === 0) {
    return null;
  }

  const lines = new Map<number, typeof intersecting>();
  for (const item of intersecting) {
    const line = lines.get(item.lineNumber) ?? [];
    line.push(item);
    lines.set(item.lineNumber, line);
  }

  return [...lines.entries()]
    .sort(([left], [right]) => left - right)
    .map(([, items]) => {
      const x = Math.min(...items.map((item) => item.x));
      const y = Math.min(...items.map((item) => item.y));
      const right = Math.max(...items.map((item) => item.x + item.width));
      const top = Math.max(...items.map((item) => item.y + item.height));
      return { x, y, width: right - x, height: top - y };
    });
}

function characterTrigrams(value: string): Map<string, number> {
  const comparable = value
    .toLocaleLowerCase("en")
    .replace(/[^\p{L}\p{N}$€£₹%]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
  const padded = `  ${comparable}  `;
  const trigrams = new Map<string, number>();
  for (let index = 0; index <= padded.length - 3; index += 1) {
    const trigram = padded.slice(index, index + 3);
    trigrams.set(trigram, (trigrams.get(trigram) ?? 0) + 1);
  }
  return trigrams;
}

function trigramSimilarity(left: string, right: string): number {
  const leftTrigrams = characterTrigrams(left);
  const rightTrigrams = characterTrigrams(right);
  const leftCount = [...leftTrigrams.values()].reduce((sum, count) => sum + count, 0);
  const rightCount = [...rightTrigrams.values()].reduce((sum, count) => sum + count, 0);
  if (leftCount === 0 || rightCount === 0) {
    return 0;
  }

  let overlap = 0;
  for (const [trigram, count] of leftTrigrams) {
    overlap += Math.min(count, rightTrigrams.get(trigram) ?? 0);
  }
  return (2 * overlap) / (leftCount + rightCount);
}

type Token = { start: number; end: number };

function tokenOffsets(value: string): Token[] {
  return [...value.matchAll(/[\p{L}\p{N}$€£₹%]+(?:[.,'’-][\p{L}\p{N}$€£₹%]+)*/gu)].map(
    (match) => ({ start: match.index, end: match.index + match[0].length }),
  );
}

function bestTokenWindow(
  pageText: string,
  quoteText: string,
): { start: number; end: number; score: number } | undefined {
  const pageTokens = tokenOffsets(pageText);
  const quoteTokenCount = tokenOffsets(quoteText).length;
  if (quoteTokenCount < MINIMUM_FUZZY_TOKENS || pageTokens.length === 0) {
    return undefined;
  }

  let best: { start: number; end: number; score: number } | undefined;
  const minimumWindow = Math.max(MINIMUM_FUZZY_TOKENS, quoteTokenCount - 1);
  const maximumWindow = Math.min(pageTokens.length, quoteTokenCount + 1);
  for (let windowSize = minimumWindow; windowSize <= maximumWindow; windowSize += 1) {
    for (let index = 0; index + windowSize <= pageTokens.length; index += 1) {
      const first = pageTokens[index];
      const last = pageTokens[index + windowSize - 1];
      if (!first || !last) {
        continue;
      }
      const candidate = pageText.slice(first.start, last.end);
      const score = trigramSimilarity(candidate, quoteText);
      if (!best || score > best.score) {
        best = { start: first.start, end: last.end, score };
      }
    }
  }
  return best;
}

function verifiedEvidence(
  claim: FactDraft["evidence"][number],
  page: EvidencePage,
  startChar: number,
  endChar: number,
  method: VerificationMethod,
  score: number,
): EvidenceVerificationResult {
  const quote = page.text.slice(startChar, endChar);
  return {
    valid: true,
    evidence: {
      pageNumber: page.pageNumber,
      quote,
      claimedQuote: claim.quote,
      normalizedQuote: normalizeEvidenceText(quote).text,
      contextBefore: page.text.slice(Math.max(0, startChar - CONTEXT_CHARACTERS), startChar),
      contextAfter: page.text.slice(endChar, Math.min(page.text.length, endChar + CONTEXT_CHARACTERS)),
      startChar,
      endChar,
      boundingBoxes: boundingBoxesForOffsets(page.textItems, startChar, endChar),
      verificationMethod: method,
      verificationScore: score,
    },
  };
}

export function verifyEvidenceClaim(
  claim: FactDraft["evidence"][number],
  page: EvidencePage | undefined,
  options: { fuzzyThreshold?: number } = {},
): EvidenceVerificationResult {
  if (!page) {
    return { valid: false, reason: "PAGE_NOT_FOUND" };
  }
  if (page.pageNumber !== claim.pageNumber) {
    return { valid: false, reason: "WRONG_PAGE" };
  }

  const exactStart = page.text.indexOf(claim.quote);
  if (exactStart >= 0) {
    return verifiedEvidence(
      claim,
      page,
      exactStart,
      exactStart + claim.quote.length,
      "EXACT",
      1,
    );
  }

  const normalizedPage = normalizeEvidenceText(page.text);
  const normalizedQuote = normalizeEvidenceText(claim.quote).text;
  const normalizedStart = normalizedPage.text.indexOf(normalizedQuote);
  if (normalizedQuote.length > 0 && normalizedStart >= 0) {
    const offsets = originalOffsets(
      page.text,
      normalizedPage,
      normalizedStart,
      normalizedStart + normalizedQuote.length,
    );
    if (offsets) {
      return verifiedEvidence(claim, page, offsets.start, offsets.end, "NORMALIZED", 1);
    }
  }

  const window = bestTokenWindow(normalizedPage.text, normalizedQuote);
  const fuzzyThreshold = options.fuzzyThreshold ?? env.EVIDENCE_FUZZY_THRESHOLD;
  if (window && window.score >= fuzzyThreshold) {
    const offsets = originalOffsets(page.text, normalizedPage, window.start, window.end);
    if (offsets) {
      return verifiedEvidence(claim, page, offsets.start, offsets.end, "FUZZY", window.score);
    }
  }

  return {
    valid: false,
    reason: "NO_RELIABLE_MATCH",
    ...(window ? { bestScore: window.score } : {}),
  };
}

export function verifyFactDraftAgainstPages(
  extracted: ExtractedFactDraft,
  pages: EvidencePage[],
): GroundedFactDraft | undefined {
  const pagesByNumber = new Map(pages.map((page) => [page.pageNumber, page]));
  const verifiedEvidence = extracted.draft.evidence.flatMap((claim) => {
    const result = verifyEvidenceClaim(claim, pagesByNumber.get(claim.pageNumber));
    return result.valid ? [result.evidence] : [];
  });

  return verifiedEvidence.length > 0 ? { ...extracted, verifiedEvidence } : undefined;
}

export async function verifyDocumentFactDrafts(
  documentId: string,
  extractedDrafts: ExtractedFactDraft[],
  model: string,
): Promise<GroundedFactDraft[]> {
  const pages = await prisma.documentPage.findMany({
    where: { documentId },
    select: { pageNumber: true, text: true, textItems: true },
  });
  const grounded: GroundedFactDraft[] = [];
  const rejected: ExtractedFactDraft[] = [];

  for (const extracted of extractedDrafts) {
    const result = verifyFactDraftAgainstPages(extracted, pages);
    if (result) {
      grounded.push(result);
    } else {
      rejected.push(extracted);
    }
  }

  await prisma.$transaction(async (transaction) => {
    await transaction.processingIssue.deleteMany({
      where: {
        documentId,
        stage: "EVIDENCE",
        issueType: { in: ["EVIDENCE_NOT_FOUND", "EVIDENCE_AMBIGUOUS"] },
      },
    });
    if (rejected.length > 0) {
      await transaction.processingIssue.createMany({
        data: rejected.map(({ chunkId, draft }) => ({
          documentId,
          chunkId,
          stage: "EVIDENCE",
          issueType: "EVIDENCE_NOT_FOUND",
          severity: "WARNING",
          message: "No claimed evidence quote could be verified on its claimed page.",
          metadata: {
            subject: draft.subject.text,
            predicate: draft.predicate.canonical,
            rawValue: draft.value.raw,
            claimedEvidence: draft.evidence,
            chunkId,
            model,
          } as Prisma.InputJsonValue,
        })),
      });
    }
  });

  return grounded;
}
