import { factDraftArraySchema, factDraftSchema, factExtractionResponseSchema } from "../../src/ai/types";
import { validFactDraft } from "../fixtures/factDraft";

describe("FactDraft schema", () => {
  it("validates structured drafts and multiple facts", () => {
    const second = {
      ...validFactDraft,
      predicate: { raw: "employed", canonical: "employee_count" },
      value: { raw: "2,000 employees", type: "QUANTITY" as const },
    };

    expect(factDraftArraySchema.parse([validFactDraft, second])).toHaveLength(2);
  });

  it("accepts an empty structured extraction result", () => {
    expect(factExtractionResponseSchema.parse({ facts: [] })).toEqual({ facts: [] });
  });

  it("rejects malformed drafts and confidence outside zero to one", () => {
    expect(() => factDraftSchema.parse({ subject: {} })).toThrow();
    expect(() => factDraftSchema.parse({ ...validFactDraft, confidence: 1.01 })).toThrow();
    expect(() =>
      factDraftSchema.parse({
        ...validFactDraft,
        evidence: [{ pageNumber: 0, quote: "support" }],
      }),
    ).toThrow();
    expect(() =>
      factDraftSchema.parse({ ...validFactDraft, subject: { ...validFactDraft.subject, text: " " } }),
    ).toThrow();
  });
});
