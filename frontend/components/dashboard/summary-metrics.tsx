"use client";

import {
  AlertTriangle,
  Building2,
  FileCheck2,
  FileText,
  Network,
  Scale,
  ShieldCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { ErrorState, LoadingState } from "@/components/common/data-states";
import { Card, CardContent } from "@/components/ui/card";
import { useSummary } from "@/hooks/use-summary";

export function SummaryMetrics() {
  const summary = useSummary();
  if (summary.isLoading) return <LoadingState label="Loading knowledge summary" />;
  if (summary.error) {
    return <ErrorState error={summary.error} retry={() => void summary.refetch()} />;
  }

  const data = summary.data!.data;
  const cards: Array<{ label: string; value: number; icon: LucideIcon; tone: string }> = [
    { label: "Documents", value: data.documents, icon: FileText, tone: "bg-blue-50 text-blue-700" },
    { label: "Verified facts", value: data.facts, icon: FileCheck2, tone: "bg-indigo-50 text-indigo-700" },
    { label: "Entities", value: data.entities, icon: Building2, tone: "bg-violet-50 text-violet-700" },
    { label: "Corroborations", value: data.relationships.corroborates, icon: ShieldCheck, tone: "bg-emerald-50 text-emerald-700" },
    { label: "Contradictions", value: data.relationships.contradicts, icon: AlertTriangle, tone: "bg-red-50 text-red-700" },
    { label: "Reconciled", value: data.relationships.reconcilable, icon: Scale, tone: "bg-amber-50 text-amber-700" },
    { label: "Open issues", value: data.issues, icon: Network, tone: "bg-slate-100 text-slate-600" },
  ];

  return (
    <section aria-label="Knowledge summary" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-7">
      {cards.map(({ label, value, icon: Icon, tone }) => (
        <Card key={label} size="sm" className="min-h-28 shadow-none">
          <CardContent className="flex h-full flex-col justify-between gap-4">
            <span className={`grid size-8 place-items-center rounded-lg ${tone}`}><Icon className="size-4" /></span>
            <div>
              <p className="text-2xl font-semibold tracking-[-0.03em] tabular-nums text-slate-950">{value.toLocaleString()}</p>
              <p className="mt-1 text-xs text-slate-500">{label}</p>
            </div>
          </CardContent>
        </Card>
      ))}
    </section>
  );
}
