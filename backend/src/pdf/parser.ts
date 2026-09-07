import { readFile } from "node:fs/promises";

export type ParsedTextItem = {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ParsedPage = {
  pageNumber: number;
  width: number;
  height: number;
  items: ParsedTextItem[];
  hasImages: boolean;
};

export type ParsedDocument = {
  pages: ParsedPage[];
};

type PdfTextItem = {
  str: string;
  transform: number[];
  width: number;
  height: number;
};

function isPdfTextItem(value: unknown): value is PdfTextItem {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.str === "string" &&
    Array.isArray(candidate.transform) &&
    candidate.transform.length >= 6 &&
    candidate.transform.every((part) => typeof part === "number") &&
    typeof candidate.width === "number" &&
    typeof candidate.height === "number"
  );
}

function positiveDimension(primary: number, fallback: number): number {
  return primary > 0 ? primary : Math.abs(fallback);
}

export async function parsePdf(filePath: string): Promise<ParsedDocument> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(await readFile(filePath));
  const loadingTask = pdfjs.getDocument({ data, useSystemFonts: true, verbosity: 0 });

  try {
    const document = await loadingTask.promise;
    const imageOperations = new Set(
      Object.entries(pdfjs.OPS)
        .filter(([name, value]) => name.toLowerCase().includes("image") && typeof value === "number")
        .map(([, value]) => value),
    );
    const pages: ParsedPage[] = [];

    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const viewport = page.getViewport({ scale: 1 });
      const [textContent, operatorList] = await Promise.all([
        page.getTextContent(),
        page.getOperatorList(),
      ]);
      const rawItems: unknown[] = textContent.items;
      const items = rawItems.filter(isPdfTextItem).map((item) => ({
        text: item.str,
        x: item.transform[4] ?? 0,
        y: item.transform[5] ?? 0,
        width: positiveDimension(item.width, item.transform[0] ?? 0),
        height: positiveDimension(item.height, item.transform[3] ?? 0),
      }));

      pages.push({
        pageNumber,
        width: viewport.width,
        height: viewport.height,
        items,
        hasImages: operatorList.fnArray.some((operation) => imageOperations.has(operation)),
      });

      page.cleanup();
    }

    await document.cleanup();
    return { pages };
  } finally {
    await loadingTask.destroy();
  }
}
