import type { FactExtractionInput } from "../types";

export const FACT_EXTRACTION_PROMPT_VERSION = "fact-extraction-v1";

export const FACT_EXTRACTION_INSTRUCTIONS = `You are extracting atomic claims from document text.

Use only the supplied document content. Do not use external knowledge. Do not infer a claim that is not asserted.
Extract useful numerical and semantic facts. A fact must be atomic. Every fact must contain supporting evidence.
Evidence must be copied verbatim or nearly verbatim from the provided source, including its [PAGE N] page number.

Preserve context that changes interpretation: time, reporting period, scope, geography, segment, basis, and status date.
Do not extract meaningless standalone numbers. If a claim cannot be supported, omit it.

Atomicity example:
Bad: "Acme had $20m revenue and 2,000 employees" as one fact.
Good: Acme -> revenue -> $20m, and Acme -> employee_count -> 2,000 as two separate facts.

Numerical candidates are hints only. They are not facts unless the supplied document content asserts a supported claim.`;

export function buildFactExtractionInput(input: FactExtractionInput): string {
  const candidateHints = input.numericalCandidates.length
    ? JSON.stringify(input.numericalCandidates)
    : "No deterministic numerical hints were found.";

  return `Numerical candidate hints:\n${candidateHints}\n\nDocument chunk:\n${input.chunkText}`;
}
