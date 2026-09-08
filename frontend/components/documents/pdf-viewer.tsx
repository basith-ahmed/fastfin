"use client";

import { ChevronLeft, ChevronRight, Minus, Plus } from "lucide-react";
import { useState } from "react";
import { Document as PdfDocument, Page, pdfjs } from "react-pdf";

import { ErrorState, LoadingState } from "@/components/common/data-states";
import { inputClassName } from "@/components/common/form-controls";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api/client";
import type { Evidence } from "@/types";

import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

type Box = { x: number; y: number; width: number; height: number };

function boxes(value: unknown): Box[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (typeof item !== "object" || item === null) return [];
    const record = item as Record<string, unknown>;
    const values = [record.x, record.y, record.width, record.height];
    if (!values.every((entry) => typeof entry === "number")) return [];
    return [{ x: values[0] as number, y: values[1] as number, width: values[2] as number, height: values[3] as number }];
  });
}

export function PdfViewer({
  documentId,
  page,
  onPageChange,
  selectedEvidence,
}: {
  documentId: string;
  page: number;
  onPageChange: (page: number) => void;
  selectedEvidence: Evidence | null;
}) {
  const [numPages, setNumPages] = useState(0);
  const [zoom, setZoom] = useState(1);
  const [pageSize, setPageSize] = useState({ width: 1, height: 1 });
  const highlights = boxes(selectedEvidence?.boundingBoxes);
  const safePage = numPages ? Math.min(page, numPages) : page;

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="min-w-0 overflow-hidden rounded-xl border bg-slate-100">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b bg-white p-3">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon-sm" disabled={safePage <= 1} onClick={() => onPageChange(safePage - 1)} aria-label="Previous page"><ChevronLeft /></Button>
            <label className="flex items-center gap-2 text-sm text-muted-foreground">
              Page
              <input
                className={`${inputClassName} w-16 px-2 text-center`}
                type="number"
                min={1}
                max={numPages || undefined}
                value={safePage}
                onChange={(event) => onPageChange(Math.max(1, Math.min(numPages || 9999, Number(event.target.value) || 1)))}
              />
              of {numPages || "—"}
            </label>
            <Button variant="outline" size="icon-sm" disabled={!numPages || safePage >= numPages} onClick={() => onPageChange(safePage + 1)} aria-label="Next page"><ChevronRight /></Button>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="icon-sm" disabled={zoom <= 0.6} onClick={() => setZoom((value) => Math.max(0.6, value - 0.1))} aria-label="Zoom out"><Minus /></Button>
            <span className="w-12 text-center text-xs tabular-nums text-muted-foreground">{Math.round(zoom * 100)}%</span>
            <Button variant="outline" size="icon-sm" disabled={zoom >= 1.8} onClick={() => setZoom((value) => Math.min(1.8, value + 0.1))} aria-label="Zoom in"><Plus /></Button>
          </div>
        </div>
        <div className="overflow-auto p-4 sm:p-6">
          <PdfDocument
            file={api.pdfUrl(documentId)}
            loading={<LoadingState label="Loading PDF" />}
            error={
              <ErrorState
                error={new Error("The PDF could not be displayed. The file may be missing or invalid.")}
              />
            }
            onLoadSuccess={({ numPages: loadedPages }) => {
              setNumPages(loadedPages);
              if (page > loadedPages) onPageChange(loadedPages);
            }}
          >
            <div className="relative mx-auto w-fit bg-white shadow-sm">
              <Page
                pageNumber={safePage}
                width={Math.round(760 * zoom)}
                renderAnnotationLayer={false}
                onLoadSuccess={(loadedPage) => {
                  const viewport = loadedPage.getViewport({ scale: 1 });
                  setPageSize({ width: viewport.width, height: viewport.height });
                }}
              />
              {selectedEvidence?.pageNumber === safePage ? (
                <div className="pointer-events-none absolute inset-0">
                  {highlights.map((box, index) => (
                    <span
                      key={`${box.x}-${box.y}-${index}`}
                      className="absolute border-2 border-amber-500 bg-amber-300/25"
                      style={{
                        left: `${(box.x / pageSize.width) * 100}%`,
                        top: `${((pageSize.height - box.y - box.height) / pageSize.height) * 100}%`,
                        width: `${(box.width / pageSize.width) * 100}%`,
                        height: `${(box.height / pageSize.height) * 100}%`,
                      }}
                    />
                  ))}
                </div>
              ) : null}
            </div>
          </PdfDocument>
        </div>
      </div>

      <aside className="h-fit rounded-xl border bg-white p-4 xl:sticky xl:top-6">
        <p className="text-xs font-semibold tracking-wider text-muted-foreground uppercase">Selected evidence</p>
        {selectedEvidence ? (
          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between text-xs text-muted-foreground"><span>Page {selectedEvidence.pageNumber}</span><span>{Math.round(selectedEvidence.verificationScore * 100)}% match</span></div>
            <blockquote className="border-l-2 border-amber-400 pl-3 text-sm leading-6">“{selectedEvidence.quote}”</blockquote>
            {selectedEvidence.contextBefore || selectedEvidence.contextAfter ? <p className="rounded-lg bg-slate-50 p-3 text-xs leading-5 text-muted-foreground">{selectedEvidence.contextBefore} <mark className="bg-amber-100">{selectedEvidence.quote}</mark> {selectedEvidence.contextAfter}</p> : null}
            {!highlights.length ? <p className="text-xs text-muted-foreground">No coordinates were stored. The verified quotation and source page remain available here.</p> : null}
          </div>
        ) : <p className="mt-3 text-sm leading-6 text-muted-foreground">Select evidence from the Facts tab to jump to its source page and inspect the quotation.</p>}
      </aside>
    </div>
  );
}
