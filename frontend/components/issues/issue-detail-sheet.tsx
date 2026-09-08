import { AlertTriangle, FileText, Layers3, Tag } from "lucide-react";

import { ErrorState, LoadingState } from "@/components/common/data-states";
import { SeverityBadge } from "@/components/common/status-badges";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { formatConfidence, formatDate, formatJson, humanize } from "@/lib/formatters";
import type { ProcessingIssue } from "@/types";

export function IssueDetailSheet({ issue, loading, error, open, onClose }: { issue: ProcessingIssue | undefined; loading: boolean; error: unknown; open: boolean; onClose: () => void }) {
  return (
    <Sheet open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <SheetContent className="w-full overflow-hidden border-l-slate-200 bg-slate-50 p-0 sm:max-w-[620px]">
        <SheetHeader className="border-b border-slate-200 bg-white px-6 py-5 pr-14">
          <SheetTitle className="text-xl font-semibold tracking-[-0.025em]">Issue details</SheetTitle>
          <SheetDescription className="sr-only">Processing issue details</SheetDescription>
        </SheetHeader>
        <div className="min-h-0 flex-1 overflow-y-auto">
          {loading ? <LoadingState label="Loading issue details" /> : null}
          {error ? <div className="p-6"><ErrorState error={error} /></div> : null}
          {issue ? (
            <div className="space-y-5 p-5 sm:p-6">
              <section className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
                <div className="flex items-center justify-between gap-4 border-b border-slate-100 px-5 py-4">
                  <SeverityBadge severity={issue.severity} />
                  <time className="text-xs text-slate-500">{formatDate(issue.createdAt)}</time>
                </div>
                <div className="p-5">
                  <div className="flex items-start gap-3">
                    <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-red-50 text-red-700"><AlertTriangle className="size-4" /></span>
                    <div><p className="text-sm font-semibold text-slate-950">{humanize(issue.issueType)}</p><p className="mt-2 text-sm leading-6 text-slate-600">{issue.message}</p></div>
                  </div>
                </div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <h3 className="text-sm font-semibold text-slate-900">Processing context</h3>
                <dl className="mt-4 grid gap-4 sm:grid-cols-2">
                  <Detail icon={FileText} label="Document" value={issue.document.originalFilename} />
                  <Detail icon={Layers3} label="Stage" value={humanize(issue.stage)} />
                  <Detail icon={Tag} label="Issue type" value={humanize(issue.issueType)} />
                  <Detail icon={Tag} label="Issue ID" value={issue.id} mono />
                </dl>
              </section>

              {issue.fact ? (
                <section className="rounded-2xl border border-slate-200 bg-white p-5">
                  <h3 className="text-sm font-semibold text-slate-900">Related fact</h3>
                  <p className="mt-3 text-sm leading-6 text-slate-700">{issue.fact.subjectRaw ?? "Unknown subject"} · {issue.fact.predicateCanonical ?? "Unknown predicate"} · <strong>{issue.fact.valueRaw ?? "Unknown value"}</strong></p>
                  {typeof issue.fact.confidence === "number" ? <p className="mt-2 text-xs text-slate-500">Confidence: {formatConfidence(issue.fact.confidence)}</p> : null}
                </section>
              ) : null}

              <details className="rounded-2xl border border-slate-200 bg-white">
                <summary className="cursor-pointer px-5 py-4 text-sm font-semibold text-slate-800">Metadata</summary>
                <div className="border-t border-slate-100 p-4"><pre className="overflow-x-auto rounded-xl bg-slate-950 p-4 text-xs whitespace-pre-wrap text-slate-200">{formatJson(issue.metadata)}</pre></div>
              </details>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Detail({ icon: Icon, label, value, mono = false }: { icon: typeof FileText; label: string; value: string; mono?: boolean }) {
  return <div className="flex min-w-0 items-start gap-2.5"><Icon className="mt-0.5 size-4 shrink-0 text-slate-400" /><div className="min-w-0"><dt className="text-xs text-slate-500">{label}</dt><dd className={`mt-1 break-words text-sm font-medium text-slate-800 ${mono ? "font-mono text-xs" : ""}`}>{value}</dd></div></div>;
}
