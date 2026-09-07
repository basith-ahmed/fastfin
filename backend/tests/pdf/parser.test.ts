import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { parsePdf } from "../../src/pdf/parser";
import { assembleDocumentPages } from "../../src/pdf/textAssembler";
import { createPhaseThreePdf } from "../fixtures/pdf";

describe("PDF parser", () => {
  let fixtureDirectory: string;

  beforeEach(async () => {
    fixtureDirectory = await mkdtemp(path.join(tmpdir(), "fastfin-pdf-test-"));
  });

  afterEach(async () => {
    await rm(fixtureDirectory, { recursive: true, force: true });
  });

  it("extracts a stable internal page and geometry contract from a real multi-page PDF", async () => {
    const filePath = path.join(fixtureDirectory, "phase-three.pdf");
    await writeFile(filePath, createPhaseThreePdf());

    const parsed = await parsePdf(filePath);
    const pages = assembleDocumentPages(parsed.pages);

    expect(parsed.pages).toHaveLength(3);
    expect(parsed.pages[0]).toMatchObject({ pageNumber: 1, width: 612, height: 792 });
    expect(parsed.pages[0]?.items.length).toBeGreaterThan(0);
    expect(parsed.pages[0]?.items[0]).toEqual({
      text: expect.any(String),
      x: expect.any(Number),
      y: expect.any(Number),
      width: expect.any(Number),
      height: expect.any(Number),
    });
    expect(pages[0]?.text).toContain("Revenue was $1,250,000 in 2025.");
    expect(pages[0]?.text).toContain("Operating margin reached 18.5%.");
    expect(pages[1]?.text).toContain("Revenue increased to $1,400,000.");
    expect(pages[2]?.text).toBe("");
  });
});
