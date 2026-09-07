export type TestPdfLine = {
  text: string;
  x?: number;
  y: number;
};

export type TestPdfPage = {
  lines: TestPdfLine[];
  width?: number;
  height?: number;
};

function escapePdfText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function createTestPdf(pages: TestPdfPage[]): Buffer {
  const fontObjectNumber = 3;
  const objects = new Map<number, string>();
  const pageObjectNumbers = pages.map((_, index) => 4 + index * 2);

  objects.set(1, "<< /Type /Catalog /Pages 2 0 R >>");
  objects.set(
    2,
    `<< /Type /Pages /Kids [${pageObjectNumbers.map((number) => `${number} 0 R`).join(" ")}] /Count ${pages.length} >>`,
  );
  objects.set(fontObjectNumber, "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  pages.forEach((page, index) => {
    const pageObjectNumber = pageObjectNumbers[index];
    if (pageObjectNumber === undefined) {
      throw new Error("Missing test PDF page object number.");
    }
    const contentObjectNumber = pageObjectNumber + 1;
    const content = [
      "BT",
      "/F1 12 Tf",
      ...page.lines.map(
        (line) => `1 0 0 1 ${line.x ?? 72} ${line.y} Tm (${escapePdfText(line.text)}) Tj`,
      ),
      "ET",
    ].join("\n");

    objects.set(
      pageObjectNumber,
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${page.width ?? 612} ${page.height ?? 792}] /Resources << /Font << /F1 ${fontObjectNumber} 0 R >> >> /Contents ${contentObjectNumber} 0 R >>`,
    );
    objects.set(contentObjectNumber, `<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
  });

  const objectCount = 3 + pages.length * 2;
  let body = "%PDF-1.4\n";
  const offsets = [0];
  for (let objectNumber = 1; objectNumber <= objectCount; objectNumber += 1) {
    const object = objects.get(objectNumber);
    if (object === undefined) {
      throw new Error(`Missing test PDF object ${objectNumber}.`);
    }
    offsets[objectNumber] = Buffer.byteLength(body);
    body += `${objectNumber} 0 obj\n${object}\nendobj\n`;
  }

  const xrefOffset = Buffer.byteLength(body);
  body += `xref\n0 ${objectCount + 1}\n`;
  body += "0000000000 65535 f \n";
  for (let objectNumber = 1; objectNumber <= objectCount; objectNumber += 1) {
    body += `${String(offsets[objectNumber]).padStart(10, "0")} 00000 n \n`;
  }
  body += `trailer\n<< /Size ${objectCount + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;
  return Buffer.from(body);
}

export function createPhaseThreePdf(): Buffer {
  return createTestPdf([
    {
      lines: [
        { text: "FastFin Holdings Annual Report", y: 730 },
        { text: "Revenue was $1,250,000 in 2025.", y: 710 },
        { text: "Operating margin reached 18.5%.", y: 690 },
        { text: "The audited figures cover the consolidated group.", y: 640 },
      ],
    },
    {
      lines: [
        { text: "Quarterly Performance", y: 730 },
        { text: "Revenue increased to $1,400,000.", y: 710 },
        { text: "Year-over-year growth was 12.0%.", y: 690 },
        { text: "Management reported stable demand.", y: 640 },
      ],
    },
    { lines: [] },
  ]);
}
