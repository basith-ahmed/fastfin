import type { ParsedPage, ParsedTextItem } from "./parser";

export type AssembledTextItem = ParsedTextItem & {
  startCharacter: number;
  endCharacter: number;
  lineNumber: number;
};

export type AssembledPage = {
  pageNumber: number;
  width: number;
  height: number;
  text: string;
  textItems: AssembledTextItem[];
  hasImages: boolean;
};

type TextLine = {
  y: number;
  height: number;
  items: ParsedTextItem[];
};

function cleanItemText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function verticalDistance(item: ParsedTextItem, line: TextLine): number {
  return Math.abs(item.y - line.y);
}

function groupIntoLines(items: ParsedTextItem[]): TextLine[] {
  const visibleItems = items
    .map((item) => ({ ...item, text: cleanItemText(item.text) }))
    .filter((item) => item.text.length > 0)
    .sort((left, right) => right.y - left.y || left.x - right.x);
  const lines: TextLine[] = [];

  for (const item of visibleItems) {
    const tolerance = Math.max(2, item.height * 0.45);
    const line = lines.find((candidate) => verticalDistance(item, candidate) <= tolerance);

    if (line) {
      line.items.push(item);
      line.y = (line.y * (line.items.length - 1) + item.y) / line.items.length;
      line.height = Math.max(line.height, item.height);
    } else {
      lines.push({ y: item.y, height: item.height, items: [item] });
    }
  }

  return lines
    .sort((left, right) => right.y - left.y)
    .map((line) => ({ ...line, items: line.items.sort((left, right) => left.x - right.x) }));
}

function shouldInsertSpace(previous: ParsedTextItem, current: ParsedTextItem): boolean {
  const gap = current.x - (previous.x + previous.width);
  const approximateCharacterWidth = previous.width / Math.max(previous.text.length, 1);
  return gap > Math.max(1, approximateCharacterWidth * 0.2);
}

export function assemblePageText(page: ParsedPage): AssembledPage {
  const lines = groupIntoLines(page.items);
  const textParts: string[] = [];
  const textItems: AssembledTextItem[] = [];
  let characterOffset = 0;

  lines.forEach((line, lineIndex) => {
    if (lineIndex > 0) {
      const previousLine = lines[lineIndex - 1];
      const verticalGap = previousLine ? previousLine.y - line.y : 0;
      const separator = verticalGap > Math.max(previousLine?.height ?? 0, line.height) * 1.65 ? "\n\n" : "\n";
      textParts.push(separator);
      characterOffset += separator.length;
    }

    line.items.forEach((item, itemIndex) => {
      const previousItem = line.items[itemIndex - 1];
      if (previousItem && shouldInsertSpace(previousItem, item)) {
        textParts.push(" ");
        characterOffset += 1;
      }

      const startCharacter = characterOffset;
      textParts.push(item.text);
      characterOffset += item.text.length;
      textItems.push({
        ...item,
        startCharacter,
        endCharacter: characterOffset,
        lineNumber: lineIndex + 1,
      });
    });
  });

  return {
    pageNumber: page.pageNumber,
    width: page.width,
    height: page.height,
    text: textParts.join("").trim(),
    textItems,
    hasImages: page.hasImages,
  };
}

export function assembleDocumentPages(pages: ParsedPage[]): AssembledPage[] {
  return pages.map(assemblePageText);
}
