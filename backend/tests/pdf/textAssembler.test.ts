import type { ParsedPage } from "../../src/pdf/parser";
import { assemblePageText } from "../../src/pdf/textAssembler";

describe("PageTextAssembler", () => {
  it("sorts positioned items, reconstructs spacing and paragraphs, and retains source mapping", () => {
    const page: ParsedPage = {
      pageNumber: 2,
      width: 612,
      height: 792,
      hasImages: false,
      items: [
        { text: "paragraph.", x: 130, y: 650, width: 58, height: 12 },
        { text: "Revenue", x: 72, y: 720, width: 45, height: 12 },
        { text: "Second", x: 72, y: 650, width: 42, height: 12 },
        { text: "  was   $1.2M ", x: 122, y: 720, width: 72, height: 12 },
        { text: "in 2025.", x: 199, y: 720, width: 45, height: 12 },
      ],
    };

    const assembled = assemblePageText(page);

    expect(assembled.text).toBe("Revenue was $1.2M in 2025.\n\nSecond paragraph.");
    expect(assembled.textItems).toHaveLength(5);
    expect(assembled.textItems[0]).toMatchObject({
      text: "Revenue",
      lineNumber: 1,
      startCharacter: 0,
      endCharacter: 7,
    });
    for (const item of assembled.textItems) {
      expect(assembled.text.slice(item.startCharacter, item.endCharacter)).toBe(item.text);
      expect(item).toEqual(
        expect.objectContaining({
          x: expect.any(Number),
          y: expect.any(Number),
          width: expect.any(Number),
          height: expect.any(Number),
        }),
      );
    }
  });

  it("returns a stable empty representation for blank pages", () => {
    const assembled = assemblePageText({
      pageNumber: 3,
      width: 612,
      height: 792,
      items: [{ text: "   ", x: 72, y: 720, width: 10, height: 12 }],
      hasImages: false,
    });

    expect(assembled.text).toBe("");
    expect(assembled.textItems).toEqual([]);
  });
});
