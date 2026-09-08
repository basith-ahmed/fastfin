"use client";

import { ExternalLink } from "lucide-react";

import { ErrorState, LoadingState } from "@/components/common/data-states";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useFact } from "@/hooks/use-facts";
import { formatConfidence, formatJson, humanize, normalizedValue } from "@/lib/formatters";
import type { Evidence } from "@/types";

export function FactDetailSheet({
  factId,
  onClose,
  onViewEvidence,
}: {
  factId: string | null;
  onClose: () => void;
  onViewEvidence: (evidence: Evidence) => void;
}) {
  const query = useFact(factId);
  const fact = query.data?.data;

  return (
    <Sheet open={factId !== null} onOpenChange={(open) => { if (!open) onClose(); }}>
      <SheetContent className="overflow-y-auto sm:max-w-2xl">
        <SheetHeader><SheetTitle>Fact detail</SheetTitle><SheetDescription>Normalized knowledge and every verified evidence reference.</SheetDescription></SheetHeader>
        <div className="space-y-6 px-4 pb-8">
          {query.isLoading ? <LoadingState /> : null}
          {query.error ? <ErrorState error={query.error} /> : null}
          {fact ? (
            <>
              <section className="grid gap-4 sm:grid-cols-2">
                <Detail label="Subject" value={fact.subjectRaw} /><Detail label="Resolved entity" value={fact.entity?.canonicalName ?? "Unresolved"} />
                <Detail label="Raw predicate" value={fact.predicateRaw} /><Detail label="Canonical predicate" value={fact.predicateCanonical} />
                <Detail label="Raw value" value={fact.valueRaw} emphasized /><Detail label="Normalized value" value={normalizedValue(fact)} emphasized />
                <Detail label="Value type" value={humanize(fact.valueType)} /><Detail label="Unit / currency" value={[fact.unit, fact.currency].filter(Boolean).join(" / ") || "Not specified"} />
                <Detail label="Confidence" value={formatConfidence(fact.confidence)} /><Detail label="Extraction method" value={humanize(fact.extractionMethod)} />
              </section>
              <section className="grid gap-4 sm:grid-cols-2"><JsonView label="Qualifiers" value={fact.qualifiers} /><JsonView label="Normalized context" value={fact.normalizedContext} /></section>
              <section><p className="mb-3 text-xs font-medium tracking-wider text-muted-foreground uppercase">Verified evidence</p><div className="space-y-3">{fact.evidence.map((evidence) => <button key={evidence.id} onClick={() => onViewEvidence(evidence)} className="w-full rounded-lg border p-3 text-left hover:bg-slate-50"><div className="mb-2 flex items-center justify-between text-xs text-muted-foreground"><span>Page {evidence.pageNumber}</span><span className="flex items-center gap-1">View in PDF <ExternalLink className="size-3" /></span></div><blockquote className="border-l-2 border-slate-300 pl-3 text-sm leading-6">“{evidence.quote}”</blockquote></button>)}</div></section>
              <section><p className="text-xs font-medium tracking-wider text-muted-foreground uppercase">Related relationships</p><p className="mt-2 text-sm">{fact.relationshipsSummary?.total ?? 0} relationship{fact.relationshipsSummary?.total === 1 ? "" : "s"} reference this fact.</p></section>
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Detail({ label, value, emphasized = false }: { label: string; value: string; emphasized?: boolean }) {
  return <div><p className="text-xs text-muted-foreground">{label}</p><p className={`mt-1 ${emphasized ? "text-base font-semibold" : "font-medium"}`}>{value}</p></div>;
}

function JsonView({ label, value }: { label: string; value: unknown }) {
  return <div><p className="text-xs text-muted-foreground">{label}</p><pre className="mt-2 overflow-x-auto rounded-lg bg-slate-100 p-3 text-xs whitespace-pre-wrap">{formatJson(value)}</pre></div>;
}
