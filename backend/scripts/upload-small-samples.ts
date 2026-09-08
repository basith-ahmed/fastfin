import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), "../.env"), quiet: true });

const samplesDirectory = path.resolve(process.cwd(), "storage/starter/calibration");
const minimumPages = 2;
const maximumPages = 3;
const backendUrl = (
  process.env.SAMPLE_UPLOAD_API_URL ??
  process.env.NEXT_PUBLIC_API_URL ??
  `http://localhost:${process.env.BACKEND_PORT ?? "4000"}`
).replace(/\/$/u, "");

async function countPdfPages(filePath: string): Promise<number> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({
    data: new Uint8Array(await readFile(filePath)),
    verbosity: 0,
  });

  try {
    return (await loadingTask.promise).numPages;
  } finally {
    await loadingTask.destroy();
  }
}

async function uploadPdf(filePath: string, filename: string): Promise<void> {
  const form = new FormData();
  form.append("file", new Blob([await readFile(filePath)], { type: "application/pdf" }), filename);

  const response = await fetch(`${backendUrl}/api/documents/upload`, {
    method: "POST",
    body: form,
  });
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    throw new Error(`Upload failed (${response.status}): ${JSON.stringify(body)}`);
  }

  const result = body as { data?: { id?: string }; duplicate?: boolean } | null;
  const disposition = result?.duplicate ? "already present" : "queued";
  console.log(`- ${filename}: ${disposition}${result?.data?.id ? ` (${result.data.id})` : ""}`);
}

async function main(): Promise<void> {
  const entries = await readdir(samplesDirectory, { withFileTypes: true });
  const selected: Array<{ filename: string; filePath: string; pages: number }> = [];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    if (!entry.isFile() || path.extname(entry.name).toLowerCase() !== ".pdf") continue;
    const filePath = path.join(samplesDirectory, entry.name);
    const pages = await countPdfPages(filePath);
    if (pages >= minimumPages && pages <= maximumPages) {
      selected.push({ filename: entry.name, filePath, pages });
    }
  }

  if (selected.length === 0) {
    throw new Error(`No ${minimumPages}-${maximumPages} page PDFs found in ${samplesDirectory}.`);
  }

  console.log(`Uploading ${selected.length} small sample PDFs to ${backendUrl}:`);
  for (const sample of selected) {
    console.log(`  ${sample.filename} (${sample.pages} pages)`);
  }

  for (const sample of selected) {
    await uploadPdf(sample.filePath, sample.filename);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
