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

// ── Relationship Reasoning ──────────────────────────────────────────

export const relationshipClassificationSchema = z.enum([
  "CORROBORATES",
  "CONTRADICTS",
  "RECONCILABLE",
  "UNCERTAIN",
]);

export type RelationshipClassification = z.infer<typeof relationshipClassificationSchema>;

export const decisiveContextEffectSchema = z.enum([
  "SUPPORTS_MATCH",
  "SUPPORTS_CONTRADICTION",
  "EXPLAINS_DIFFERENCE",
  "INSUFFICIENT",
]);

export const decisiveContextEntrySchema = z.object({
  dimension: z.string(),
  factA: z.string().nullable(),
  factB: z.string().nullable(),
  effect: decisiveContextEffectSchema,
});

export const relationshipReasoningResponseSchema = z.object({
  classification: relationshipClassificationSchema,
  confidence: z.number().min(0).max(1),
  explanation: z.string(),
  decisiveContext: z.array(decisiveContextEntrySchema).optional(),
});

export type RelationshipReasoningResult = z.infer<typeof relationshipReasoningResponseSchema>;

export type RelationshipFactInput = {
  entity: string;
  predicate: string;
  value: string;
  unit: string | null;
  currency: string | null;
  period: string | null;
  scope: string | null;
  segment: string | null;
  quote: string | null;
};

export type RelationshipReasoningInput = {
  factA: RelationshipFactInput;
  factB: RelationshipFactInput;
};

export interface RelationshipReasoningProvider {
  readonly model: string;
  readonly promptVersion: string;
  reasonRelationship(input: RelationshipReasoningInput): Promise<RelationshipReasoningResult>;
}
