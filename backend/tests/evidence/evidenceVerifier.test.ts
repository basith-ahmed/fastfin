import type { FactDraft } from "../../src/ai/types";
import {
  boundingBoxesForOffsets,
  normalizeEvidenceText,
  verifyEvidenceClaim,
  verifyFactDraftAgainstPages,
  type EvidencePage,
} from "../../src/services/evidenceVerifier";
import { validFactDraft } from "../fixtures/factDraft";

function claim(quote: string, pageNumber = 1): FactDraft["evidence"][number] {
  return { quote, pageNumber };
}

function page(text: string, pageNumber = 1, textItems: unknown = []): EvidencePage {
  return { pageNumber, text, textItems };
}

describe("EvidenceVerifier", () => {
  it("matches exact quotes and computes offsets and bounded context", () => {
    const pageText = `Before context. ${"x".repeat(220)} Acme reported revenue of $12 million. ${"y".repeat(220)} After context.`;
    const quote = "Acme reported revenue of $12 million.";
    const result = verifyEvidenceClaim(claim(quote), page(pageText));

    expect(result.valid).toBe(true);
    if (!result.valid) {
      return;
    }
    expect(result.evidence).toMatchObject({
      quote,
      claimedQuote: quote,
      verificationMethod: "EXACT",
      verificationScore: 1,
      startChar: pageText.indexOf(quote),
      endChar: pageText.indexOf(quote) + quote.length,
    });
    expect(result.evidence.contextBefore).toHaveLength(200);
    expect(result.evidence.contextAfter).toHaveLength(200);
  });

  it.each([
    ["multiple spaces", "Acme   reported   revenue.", "Acme reported revenue."],
    ["newlines", "Acme reported\nrevenue.", "Acme reported revenue."],
    ["Unicode quotes", "Acme said “revenue increased”.", 'Acme said "revenue increased".'],
    ["ligatures", "The ﬁnancial result improved.", "The financial result improved."],
    ["hyphenated line wraps", "International revenue grew.", "Inter-\nnational revenue grew."],
  ])("normalizes %s while retaining original offsets", (_label, quote, pageText) => {
    const result = verifyEvidenceClaim(claim(quote), page(pageText));

    expect(result.valid).toBe(true);
    if (!result.valid) {
      return;
    }
    expect(result.evidence.verificationMethod).toBe("NORMALIZED");
    expect(result.evidence.quote).toBe(pageText);
    expect(result.evidence.startChar).toBe(0);
    expect(result.evidence.endChar).toBe(pageText.length);
    expect(normalizeEvidenceText(result.evidence.quote).text).toBe(
      normalizeEvidenceText(quote).text,
    );
  });

  it("accepts only strong token-window matches", () => {
    const pageText =
      "Acme reported consolidated annual revenue of $12 million for fiscal year 2025.";
    const strong = verifyEvidenceClaim(
      claim("Acme reported consolidated annual revenues of $12 million for fiscal year 2025."),
      page(pageText),
      { fuzzyThreshold: 0.92 },
    );
    const weak = verifyEvidenceClaim(
      claim("Acme may have generated substantial revenue during the prior year."),
      page(pageText),
      { fuzzyThreshold: 0.92 },
    );

    expect(strong.valid).toBe(true);
    if (strong.valid) {
      expect(strong.evidence.verificationMethod).toBe("FUZZY");
      expect(strong.evidence.verificationScore).toBeGreaterThanOrEqual(0.92);
    }
    expect(weak).toMatchObject({ valid: false, reason: "NO_RELIABLE_MATCH" });
  });

  it("rejects evidence when the supplied page is not the claimed page", () => {
    expect(
      verifyEvidenceClaim(claim("The quote exists here.", 1), page("The quote exists here.", 2)),
    ).toEqual({ valid: false, reason: "WRONG_PAGE" });
  });

  it("creates bottom-left PDF boxes for one or multiple evidence lines", () => {
    const pageText = "Revenue was $12 million.\nfor fiscal year 2025.";
    const textItems = [
      {
        text: "Revenue was $12 million.",
        x: 72,
        y: 700,
        width: 144,
        height: 12,
        startCharacter: 0,
        endCharacter: 24,
        lineNumber: 1,
      },
      {
        text: "for fiscal year 2025.",
        x: 72,
        y: 680,
        width: 126,
        height: 12,
        startCharacter: 25,
        endCharacter: pageText.length,
        lineNumber: 2,
      },
    ];
    const result = verifyEvidenceClaim(claim(pageText), page(pageText, 1, textItems));

    expect(result.valid).toBe(true);
    if (!result.valid) {
      return;
    }
    expect(result.evidence.boundingBoxes).toEqual([
      { x: 72, y: 700, width: 144, height: 12 },
      { x: 72, y: 680, width: 126, height: 12 },
    ]);
    expect(boundingBoxesForOffsets(textItems, 0, 24)).toEqual([
      { x: 72, y: 700, width: 144, height: 12 },
    ]);
  });

  it("allows a draft when one of multiple evidence claims verifies", () => {
    const draft = {
      ...validFactDraft,
      evidence: [
        { pageNumber: 1, quote: "This quote is absent." },
        { pageNumber: 2, quote: "Acme Corporation reported revenue of $20 million in 2025." },
      ],
    };
    const grounded = verifyFactDraftAgainstPages(
      { chunkId: "chunk", chunkIndex: 0, draft },
      [
        page("Different text.", 1),
        page("Acme Corporation reported revenue of $20 million in 2025.", 2),
      ],
    );

    expect(grounded?.verifiedEvidence).toHaveLength(1);
    expect(grounded?.verifiedEvidence[0]?.pageNumber).toBe(2);
  });
});
