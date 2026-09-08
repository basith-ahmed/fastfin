import type { FactDraft } from "../../src/ai/types";
import { normalizeContext } from "../../src/normalization/contextNormalizer";
import { normalizeExactDate, normalizePeriod } from "../../src/normalization/dateNormalizer";
import {
  createFactSignature,
  normalizeGroundedFact,
  normalizePredicate,
  normalizeSubject,
} from "../../src/normalization/factNormalizer";
import { normalizeValue } from "../../src/normalization/valueNormalizers";
import type { GroundedFactDraft, VerifiedEvidence } from "../../src/services/evidenceVerifier";
import { validFactDraft } from "../fixtures/factDraft";

function value(raw: string, type: FactDraft["value"]["type"]): FactDraft["value"] {
  return { raw, type };
}

const verifiedEvidence: VerifiedEvidence = {
  pageNumber: 2,
  quote: "Acme Corporation reported revenue of $20 million in 2025.",
  claimedQuote: "Acme Corporation reported revenue of $20 million in 2025.",
  normalizedQuote: "Acme Corporation reported revenue of $20 million in 2025.",
  contextBefore: "",
  contextAfter: "",
  startChar: 10,
  endChar: 70,
  boundingBoxes: null,
  verificationMethod: "EXACT",
  verificationScore: 1,
};

describe("Phase 6 value normalization", () => {
  it.each([
    ["$1.2M", "MONEY", 1_200_000, "USD", "USD"],
    ["USD 1,200,000", "MONEY", 1_200_000, "USD", "USD"],
    ["₹10 crore", "MONEY", 100_000_000, "INR", "INR"],
    ["15%", "PERCENTAGE", 15, "percent", null],
    ["1.5x", "NUMBER", 1.5, "ratio_x", null],
  ] as const)("normalizes %s", (raw, type, normalizedNumber, unit, currency) => {
    expect(normalizeValue(value(raw, type))).toMatchObject({ normalizedNumber, unit, currency });
  });

  it.each([
    ["31 March 2025", "2025-03-31T00:00:00.000Z"],
    ["March 31, 2025", "2025-03-31T00:00:00.000Z"],
    ["2025-03-31", "2025-03-31T00:00:00.000Z"],
  ])("normalizes exact date %s", (raw, expected) => {
    expect(normalizeExactDate(raw)?.toISOString()).toBe(expected);
  });

  it("rejects impossible calendar dates", () => {
    expect(normalizeExactDate("31 February 2025")).toBeNull();
  });
});

describe("Phase 6 subject, predicate, and context normalization", () => {
  it("normalizes subjects conservatively and predicates to snake case", () => {
    expect(normalizeSubject("  ACME   Holdings, Ltd. ")).toBe("acme holdings, ltd.");
    expect(normalizePredicate("ANNUAL--Revenue")).toBe("annual_revenue");
    expect(normalizePredicate("annual_revenue")).toBe("annual_revenue");
  });

  it.each([
    ["countries and territories served", "countries_served"],
    ["pin codes served", "postal_code_reach"],
    ["Pincode Reach", "postal_code_reach"],
    ["postal codes served", "postal_code_reach"],
  ])("canonicalizes equivalent predicate wording %s", (raw, expected) => {
    expect(normalizePredicate(raw)).toBe(expected);
  });

  it.each([
    ["FY25", { kind: "FISCAL_YEAR", label: "FY2025" }],
    ["FY2025", { kind: "FISCAL_YEAR", label: "FY2025" }],
    ["Q1 FY2025", { kind: "QUARTER", label: "Q1 FY2025" }],
  ])("preserves and canonicalizes period %s", (raw, expected) => {
    expect(normalizePeriod(raw)).toMatchObject(expected);
  });

  it("creates a stable dynamic context without consuming qualifiers", () => {
    expect(
      normalizeContext({
        time: "FY25",
        geography: "  North   America ",
        scope: " Consolidated ",
        segment: null,
        basis: "IFRS",
        statusAsOf: "31 March 2025",
      }),
    ).toEqual({
      time: { kind: "FISCAL_YEAR", label: "FY2025", start: null, end: null },
      geography: "north america",
      scope: "consolidated",
      segment: null,
      basis: "ifrs",
      statusAsOf: "2025-03-31",
      extra: {},
    });
  });
});

describe("Phase 6 normalized facts and signatures", () => {
  function grounded(draft: FactDraft = validFactDraft): GroundedFactDraft {
    return { chunkId: "chunk-1", chunkIndex: 0, draft, verifiedEvidence: [verifiedEvidence] };
  }

  it("preserves all raw fields and arbitrary qualifiers", () => {
    const draft: FactDraft = {
      ...validFactDraft,
      predicate: { raw: "Annual Revenue", canonical: "annual-revenue" },
      value: { raw: "$1.2M", type: "MONEY" },
      qualifiers: [
        { name: "accounting_standard", value: "IFRS" },
        { name: "membership_class", value: "Series A" },
      ],
    };

    const normalized = normalizeGroundedFact("document-1", grounded(draft));

    expect(normalized).toMatchObject({
      subjectRaw: draft.subject.text,
      predicateRaw: "Annual Revenue",
      predicateCanonical: "annual_revenue",
      valueRaw: "$1.2M",
      normalizedNumber: 1_200_000,
      qualifiers: { accounting_standard: "IFRS", membership_class: "Series A" },
    });
    expect(draft.value.raw).toBe("$1.2M");
  });

  it("produces the same signature regardless of JSON key and evidence order", () => {
    const normalized = normalizeGroundedFact("document-1", grounded());
    const secondEvidence = { ...verifiedEvidence, pageNumber: 3, startChar: 4, endChar: 20 };
    const first = createFactSignature({
      documentId: normalized.documentId,
      subjectNormalized: normalized.subjectNormalized,
      predicateCanonical: normalized.predicateCanonical,
      value: normalized,
      context: normalized.normalizedContext,
      evidence: [verifiedEvidence, secondEvidence],
    });
    const second = createFactSignature({
      documentId: normalized.documentId,
      subjectNormalized: normalized.subjectNormalized,
      predicateCanonical: normalized.predicateCanonical,
      value: normalized,
      context: {
        ...normalized.normalizedContext,
        extra: {},
      },
      evidence: [secondEvidence, verifiedEvidence],
    });

    expect(first).toBe(second);
    expect(first).toMatch(/^[a-f0-9]{64}$/u);
  });
});
