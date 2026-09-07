import { createHash } from "node:crypto";

import { chunkDocument, estimateTokens } from "../../src/pdf/chunker";
import type { AssembledPage } from "../../src/pdf/textAssembler";

function page(pageNumber: number, paragraphs: string[]): AssembledPage {
  return {
    pageNumber,
    width: 612,
    height: 792,
    text: paragraphs.join("\n\n"),
    textItems: [],
    hasImages: false,
  };
}

describe("PDF chunker", () => {
  it("builds bounded page-aware chunks with overlap, ranges, metadata, and stable hashes", () => {
    const pages = [
      page(1, [
        "Alpha revenue was one hundred dollars for the first reporting period.",
        "Beta operating margin was twenty percent for the consolidated business.",
        "Gamma cash balance remained strong after the annual reporting date.",
      ]),
      page(2, [
        "Delta revenue was two hundred dollars for the second reporting period.",
        "Epsilon operating margin was twenty two percent for the regional business.",
        "Zeta cash balance increased after the quarterly reporting date.",
      ]),
    ];

    const chunks = chunkDocument(pages, { targetTokens: 40, overlapTokens: 8 });

    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks[0]?.metadata.overlapFromPrevious).toBe(false);
    expect(chunks.slice(1).some((chunk) => chunk.metadata.overlapFromPrevious)).toBe(true);
    for (const chunk of chunks) {
      expect(chunk.text).toMatch(/\[PAGE [12]\]/);
      expect(chunk.tokenCount).toBe(estimateTokens(chunk.text));
      expect(chunk.tokenCount).toBeLessThanOrEqual(40);
      expect(chunk.metadata.estimatedTokens).toBe(chunk.tokenCount);
      expect(chunk.metadata.pageNumbers[0]).toBe(chunk.pageStart);
      expect(chunk.metadata.pageNumbers.at(-1)).toBe(chunk.pageEnd);
      expect(chunk.sha256).toBe(createHash("sha256").update(chunk.text).digest("hex"));
    }

    const overlappedChunkIndex = chunks.findIndex(
      (chunk, index) => index > 0 && chunk.metadata.overlapFromPrevious,
    );
    const previousWords = new Set(chunks[overlappedChunkIndex - 1]?.text.split(/\s+/));
    const currentWords = chunks[overlappedChunkIndex]?.text.split(/\s+/) ?? [];
    expect(currentWords.filter((word) => previousWords.has(word)).length).toBeGreaterThan(3);
    expect(chunks.some((chunk) => chunk.pageStart === 1)).toBe(true);
    expect(chunks.some((chunk) => chunk.pageEnd === 2)).toBe(true);
  });

  it("uses sentence and hard word boundaries when one paragraph exceeds the target", () => {
    const longParagraph = Array.from(
      { length: 30 },
      (_, index) => `Sentence ${index + 1} records a deterministic financial value.`,
    ).join(" ");
    const chunks = chunkDocument([page(7, [longParagraph])], {
      targetTokens: 35,
      overlapTokens: 5,
    });

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.pageStart === 7 && chunk.pageEnd === 7)).toBe(true);
    expect(chunks.every((chunk) => chunk.tokenCount <= 35)).toBe(true);
  });

  it("validates chunk sizing options and skips pages without usable text", () => {
    expect(chunkDocument([page(1, [])])).toEqual([]);
    expect(() => chunkDocument([page(1, ["text"])], { targetTokens: 10, overlapTokens: 10 })).toThrow(
      "targetTokens > overlapTokens",
    );
  });
});
