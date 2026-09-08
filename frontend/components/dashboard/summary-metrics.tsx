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
  const cards = [
    { label: "Documents", value: data.documents, icon: FileText },
    { label: "Facts", value: data.facts, icon: FileCheck2 },
    { label: "Entities", value: data.entities, icon: Building2 },
    { label: "Corroborations", value: data.relationships.corroborates, icon: ShieldCheck },
    { label: "Contradictions", value: data.relationships.contradicts, icon: AlertTriangle },
    { label: "Reconciliations", value: data.relationships.reconcilable, icon: Scale },
    { label: "Issues", value: data.issues, icon: Network },
  ];

  return (
    <section aria-label="Knowledge summary" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-7">
      {cards.map(({ label, value, icon: Icon }) => (
        <Card key={label} size="sm" className="shadow-none">
          <CardContent className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="mt-2 text-2xl font-semibold tabular-nums">{value.toLocaleString()}</p>
            </div>
            <Icon className="size-4 text-slate-400" />
          </CardContent>
        </Card>
      ))}
    </section>
  );
}
