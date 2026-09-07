import { z } from "zod";

export const factSubjectTypeSchema = z.enum([
  "PERSON",
  "ORGANIZATION",
  "LOCATION",
  "PRODUCT",
  "OTHER",
]);

export const factValueTypeSchema = z.enum([
  "TEXT",
  "NUMBER",
  "MONEY",
  "PERCENTAGE",
  "DATE",
  "BOOLEAN",
  "PERSON",
  "ORGANIZATION",
  "LOCATION",
  "QUANTITY",
  "DURATION",
  "OTHER",
]);

const nonBlankString = z.string().min(1).refine((value) => value.trim().length > 0, {
  message: "Value must not contain only whitespace.",
});

const qualifierValueSchema = z.union([z.string(), z.number(), z.boolean(), z.null()]);

export const factDraftSchema = z.object({
  subject: z.object({
    text: nonBlankString,
    type: factSubjectTypeSchema,
  }),
  predicate: z.object({
    raw: nonBlankString,
    canonical: nonBlankString,
  }),
  value: z.object({
    raw: nonBlankString,
    type: factValueTypeSchema,
  }),
  qualifiers: z.record(z.string(), qualifierValueSchema),
  context: z.object({
    time: z.string().nullable(),
    geography: z.string().nullable(),
    scope: z.string().nullable(),
    segment: z.string().nullable(),
    basis: z.string().nullable(),
    statusAsOf: z.string().nullable(),
  }),
  evidence: z
    .array(
      z.object({
        pageNumber: z.number().int().positive(),
        quote: nonBlankString,
      }),
    )
    .min(1),
  confidence: z.number().min(0).max(1),
});

export const factDraftArraySchema = z.array(factDraftSchema);
export const factExtractionResponseSchema = z.object({ facts: factDraftArraySchema });

export type FactDraft = z.infer<typeof factDraftSchema>;

export type NumericalCandidate = {
  raw: string;
  typeHint: string;
  surroundingText: string;
};

export type FactExtractionInput = {
  documentId: string;
  chunkSha: string;
  chunkText: string;
  numericalCandidates: NumericalCandidate[];
};

export interface FactExtractionProvider {
  readonly model: string;
  readonly promptVersion: string;
  extractFacts(input: FactExtractionInput): Promise<FactDraft[]>;
}

export interface EmbeddingProvider {
  readonly model: string;
  readonly dimensions: number;
  embed(text: string): Promise<number[]>;
}
