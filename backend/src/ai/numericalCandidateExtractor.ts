import type { NumericalCandidate } from "./types";

type CandidatePattern = {
  typeHint: string;
  expression: RegExp;
};

const monthNames =
  "January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec";

const candidatePatterns: CandidatePattern[] = [
  {
    typeHint: "MONEY",
    expression:
      /(?:[$€£₹]\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:thousand|million|billion|crore|lakh|[KMB]))?|\b(?:USD|EUR|GBP|INR)\s?\d[\d,]*(?:\.\d+)?(?:\s?(?:thousand|million|billion|crore|lakh|[KMB]))?)/giu,
  },
  {
    typeHint: "DATE",
    expression: new RegExp(`\\b\\d{1,2}\\s+(?:${monthNames})\\s+\\d{4}\\b`, "giu"),
  },
  { typeHint: "PERCENTAGE", expression: /\b\d[\d,]*(?:\.\d+)?\s?%/gu },
  { typeHint: "BASIS_POINTS", expression: /\b\d[\d,]*(?:\.\d+)?\s+basis points?\b/giu },
  { typeHint: "MULTIPLE", expression: /\b\d+(?:\.\d+)?x\b/giu },
  { typeHint: "QUANTITY", expression: /\b\d[\d,]*\s+employees?\b/giu },
  { typeHint: "YEAR", expression: /\b(?:19|20)\d{2}\b/gu },
];

type LocatedCandidate = NumericalCandidate & { start: number; end: number };

function overlapsExisting(start: number, end: number, candidates: LocatedCandidate[]): boolean {
  return candidates.some((candidate) => start < candidate.end && end > candidate.start);
}

export function extractNumericalCandidates(text: string): NumericalCandidate[] {
  const located: LocatedCandidate[] = [];

  for (const pattern of candidatePatterns) {
    pattern.expression.lastIndex = 0;
    for (const match of text.matchAll(pattern.expression)) {
      const raw = match[0];
      const start = match.index;
      const end = start + raw.length;
      if (overlapsExisting(start, end, located)) {
        continue;
      }

      const contextStart = Math.max(0, start - 80);
      const contextEnd = Math.min(text.length, end + 80);
      located.push({
        raw,
        typeHint: pattern.typeHint,
        surroundingText: text.slice(contextStart, contextEnd).replace(/\s+/g, " ").trim(),
        start,
        end,
      });
    }
  }

  return located
    .sort((left, right) => left.start - right.start)
    .map(({ raw, typeHint, surroundingText }) => ({ raw, typeHint, surroundingText }));
}
