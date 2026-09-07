import { extractNumericalCandidates } from "../../src/ai/numericalCandidateExtractor";

describe("numerical candidate extractor", () => {
  it("detects supported financial, percentage, date, multiple, and quantity forms", () => {
    const text = `Revenue was $1.2 million and USD 4.5B. Indian revenue reached ₹12 crore.
      Margin was 44%, improving 320 basis points at 1.6x leverage.
      On 31 March 2025 the company employed 4,300 employees.`;

    const candidates = extractNumericalCandidates(text);
    const values = candidates.map(({ raw, typeHint }) => `${typeHint}:${raw}`);

    expect(values).toEqual(
      expect.arrayContaining([
        "MONEY:$1.2 million",
        "MONEY:USD 4.5B",
        "MONEY:₹12 crore",
        "PERCENTAGE:44%",
        "BASIS_POINTS:320 basis points",
        "MULTIPLE:1.6x",
        "DATE:31 March 2025",
        "QUANTITY:4,300 employees",
      ]),
    );
    expect(candidates.every((candidate) => candidate.surroundingText.includes(candidate.raw))).toBe(
      true,
    );
    expect(values).not.toContain("YEAR:2025");
  });
});
