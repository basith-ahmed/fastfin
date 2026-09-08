import type { FactExtractionInput } from "../types";

export const FACT_EXTRACTION_PROMPT_VERSION = "fact-extraction-v2";

export const FACT_EXTRACTION_INSTRUCTIONS = `You are extracting atomic claims from document text.

Return only the structured JSON response required by the supplied response schema. Never return Markdown,
commentary, headings, code fences, or explanatory prose outside that response.

Use only the supplied document content. Do not use external knowledge. Do not infer a claim that is not asserted.
Extract useful numerical and semantic facts. A fact must be atomic. Every fact must contain supporting evidence.
Evidence must be copied verbatim or nearly verbatim from the provided source, including its [PAGE N] page number.

Preserve context that changes interpretation: time, reporting period, scope, geography, segment, basis, and status date.
Do not extract meaningless standalone numbers. If a claim cannot be supported, omit it.

Subject rules:
- The subject is the real person, organization, location, or product that the claim describes.
- Never use a metric name, table row label, section heading, slogan, or descriptive phrase as the subject.
- Use the document context to identify the reporting entity consistently across chunks, but do not treat
  document-context text as evidence for a fact. Evidence must still appear in the current document chunk.
- If the actual subject cannot be identified from the document context and chunk, omit the claim rather than
  inventing a subject.

Predicate rules:
- Use a concise, reusable snake_case property name.
- Do not include the subject, value, reporting period, geography, or scope in the canonical predicate.
- Prefer common concepts such as revenue, employee_count, active_customers, and postal_code_reach over
  document-specific wording.

Atomicity example:
Bad: "Acme had $20m revenue and 2,000 employees" as one fact.
Good: Acme -> revenue -> $20m, and Acme -> employee_count -> 2,000 as two separate facts.

Numerical candidates are hints only. They are not facts unless the supplied document content asserts a supported claim.`;

export function buildFactExtractionInput(input: FactExtractionInput): string {
  const candidateHints = input.numericalCandidates.length
    ? JSON.stringify(input.numericalCandidates)
    : "No deterministic numerical hints were found.";

  return `Document identity context (for resolving subjects only; not fact evidence):\n${input.documentContext}\n\nNumerical candidate hints:\n${candidateHints}\n\nDocument chunk:\n${input.chunkText}`;
}
