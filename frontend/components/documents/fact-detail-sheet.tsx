"use client";

import { ArrowUpRight, CheckCircle2, FileText, Gauge, Link2, Quote, Tag } from "lucide-react";

import { ErrorState, LoadingState } from "@/components/common/data-states";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useFact } from "@/hooks/use-facts";
import { formatConfidence, formatJson, humanize, normalizedValue } from "@/lib/formatters";
import type { Evidence } from "@/types";

export function FactDetailSheet({ factId, onClose, onViewEvidence }: { factId: string | null; onClose: () => void; onViewEvidence: (evidence: Evidence) => void }) {
  const query = useFact(factId);
  const fact = query.data?.data;
  const primaryEvidence = fact?.evidence[0];

  function viewEvidence(evidence: Evidence) {
    onClose();
    onViewEvidence(evidence);
  }

  return (
    <Sheet open={factId !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="!w-full !max-w-none overflow-hidden border-l-slate-200 bg-slate-50 p-0 lg:!w-[min(900px,72vw)] xl:!w-[min(1000px,66vw)]">
        <SheetHeader className="border-b border-slate-200 bg-white px-6 py-5 pr-14">
          <SheetTitle className="text-xl font-semibold tracking-[-0.025em] text-slate-950">Fact inspection</SheetTitle>
          <SheetDescription className="sr-only">Fact details and evidence</SheetDescription>
        </SheetHeader>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {query.isLoading ? <LoadingState label="Loading fact details" /> : null}
          {query.error ? <div className="p-6"><ErrorState error={query.error} /></div> : null}
          {fact ? (
            <div className="space-y-5 p-5 sm:p-6">
              <section className="overflow-hidden rounded-2xl border border-blue-100 bg-white shadow-sm shadow-slate-900/[0.03]">
                <div className="border-b border-blue-100 bg-blue-50/70 px-5 py-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0"><p className="text-xs font-medium text-blue-700">Accepted claim</p><h2 className="mt-1 text-lg leading-6 font-semibold text-slate-950">{fact.subjectRaw} <span className="font-normal text-slate-400">·</span> {fact.predicateCanonical}</h2></div>
                    <ConfidenceBadge value={fact.confidence} />
                  </div>
                </div>
                <div className="grid sm:grid-cols-2"><ValueBlock label="Reported value" value={fact.valueRaw} /><ValueBlock label="Normalized value" value={normalizedValue(fact)} normalized /></div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <SectionHeading icon={Tag} title="Fact attributes" />
                <dl className="mt-4 grid gap-x-6 gap-y-4 sm:grid-cols-2">
                  <Detail label="Resolved entity" value={fact.entity?.canonicalName ?? "Not resolved"} />
                  <Detail label="Value type" value={humanize(fact.valueType)} />
                  <Detail label="Source predicate" value={fact.predicateRaw} />
                  <Detail label="Canonical predicate" value={fact.predicateCanonical} />
                  <Detail label="Unit / currency" value={[fact.unit, fact.currency].filter(Boolean).join(" / ") || "Not specified"} />
                  <Detail label="Extraction method" value={humanize(fact.extractionMethod)} />
                </dl>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <SectionHeading icon={Link2} title="Context and qualifiers" />
                <div className="mt-4 grid gap-5 sm:grid-cols-2"><ContextList label="Normalized context" value={fact.normalizedContext} /><ContextList label="Qualifiers" value={fact.qualifiers} /></div>
              </section>

              <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <SectionHeading icon={Quote} title={`Evidence (${fact.evidence.length})`} />
                <div className="mt-4 space-y-3">{fact.evidence.length ? fact.evidence.map((evidence, index) => <EvidenceCard key={evidence.id} evidence={evidence} index={index} onView={() => viewEvidence(evidence)} />) : <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">No evidence references were returned.</p>}</div>
              </section>

              <section className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5">
                <div className="flex items-center gap-3"><span className="grid size-9 place-items-center rounded-lg bg-violet-50 text-violet-700"><Link2 className="size-4" /></span><p className="font-semibold text-slate-900">Relationships</p></div>
                <span className="text-2xl font-semibold tracking-tight tabular-nums text-slate-900">{fact.relationshipsSummary?.total ?? 0}</span>
              </section>
            </div>
          ) : null}
        </div>

        {fact && primaryEvidence ? <SheetFooter className="border-t border-slate-200 bg-white px-6 py-4 sm:flex-row sm:items-center sm:justify-between"><p className="hidden max-w-72 truncate text-xs text-slate-500 sm:block"><FileText className="mr-1.5 inline size-3.5" />{fact.document.originalFilename}</p><Button onClick={() => viewEvidence(primaryEvidence)}>View primary evidence <ArrowUpRight /></Button></SheetFooter> : null}
      </SheetContent>
    </Sheet>
  );
}

function ConfidenceBadge({ value }: { value: number }) {
  const tone = value >= 0.9 ? "border-emerald-200 bg-emerald-50 text-emerald-800" : value >= 0.75 ? "border-amber-200 bg-amber-50 text-amber-800" : "border-slate-200 bg-slate-50 text-slate-700";
  return <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-semibold ${tone}`}><CheckCircle2 className="size-3.5" />{formatConfidence(value)} confidence</span>;
}

function ValueBlock({ label, value, normalized = false }: { label: string; value: string; normalized?: boolean }) {
  return <div className={`px-5 py-5 ${normalized ? "border-t border-slate-100 bg-slate-50/40 sm:border-t-0 sm:border-l" : ""}`}><p className="text-[11px] font-semibold tracking-[0.1em] text-slate-500 uppercase">{label}</p><p className={`mt-2 break-words font-semibold tracking-[-0.02em] text-slate-950 ${normalized ? "text-lg" : "text-2xl"}`}>{value}</p></div>;
}

function SectionHeading({ icon: Icon, title }: { icon: typeof Tag; title: string }) {
  return <div className="flex items-center gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-slate-100 text-slate-600"><Icon className="size-4" /></span><h3 className="font-semibold text-slate-900">{title}</h3></div>;
}

function Detail({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-xs text-slate-500">{label}</dt><dd className="mt-1 break-words text-sm font-medium text-slate-800">{value}</dd></div>;
}

function ContextList({ label, value }: { label: string; value: unknown }) {
  const entries = contextEntries(value);
  return <div><p className="mb-2 text-[11px] font-semibold tracking-[0.1em] text-slate-500 uppercase">{label}</p>{entries.length ? <dl className="overflow-hidden rounded-xl border border-slate-200">{entries.map(([key, item]) => <div key={key} className="flex items-start justify-between gap-3 border-b border-slate-100 px-3 py-2.5 last:border-0"><dt className="text-xs text-slate-500">{humanize(key)}</dt><dd className="max-w-[65%] break-words text-right text-xs font-medium text-slate-800">{item}</dd></div>)}</dl> : <p className="rounded-xl bg-slate-50 px-3 py-4 text-xs text-slate-500">No {label.toLowerCase()} specified</p>}</div>;
}

function contextEntries(value: unknown): Array<[string, string]> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return [];
  return Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== null && item !== undefined && item !== "").map(([key, item]) => [key, typeof item === "string" || typeof item === "number" || typeof item === "boolean" ? String(item) : formatJson(item)]);
}

function EvidenceCard({ evidence, index, onView }: { evidence: Evidence; index: number; onView: () => void }) {
  return <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50/50"><div className="flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-3"><div className="flex items-center gap-3"><span className="grid size-7 place-items-center rounded-md bg-emerald-50 text-emerald-700"><CheckCircle2 className="size-3.5" /></span><div><p className="text-xs font-semibold text-slate-800">Evidence {index + 1} · Page {evidence.pageNumber}</p><p className="mt-0.5 flex items-center gap-1 text-[11px] text-slate-500"><Gauge className="size-3" />{formatConfidence(evidence.verificationScore)} verified · {humanize(evidence.verificationMethod)}</p></div></div><Button variant="ghost" size="sm" onClick={onView}>Open <ArrowUpRight /></Button></div><div className="p-4"><blockquote className="border-l-2 border-blue-400 pl-3 text-sm leading-6 text-slate-700">“{evidence.quote}”</blockquote>{evidence.contextBefore || evidence.contextAfter ? <p className="mt-3 text-xs leading-5 text-slate-500">{evidence.contextBefore} <mark className="rounded bg-amber-100 px-0.5 text-slate-700">{evidence.quote}</mark> {evidence.contextAfter}</p> : null}</div></div>;
}
