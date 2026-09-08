"use client";

import { ExternalLink, Quote } from "lucide-react";
import Link from "next/link";

import { ErrorState, LoadingState } from "@/components/common/data-states";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { useRelationship } from "@/hooks/use-relationships";
import { formatJson, normalizedValue } from "@/lib/formatters";
import type { Evidence, Fact, RelationshipType } from "@/types";

function field(context: unknown, key: string): string {
  if (typeof context !== "object" || context === null || Array.isArray(context)) return "Not specified";
  const value = (context as Record<string, unknown>)[key];
  if (typeof value === "string") return value;
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    const label = (value as Record<string, unknown>).label;
    if (typeof label === "string") return label;
  }
  return value == null ? "Not specified" : formatJson(value);
}

function EvidencePanel({ evidence, documentId }: { evidence: Evidence[]; documentId: string }) {
  if (!evidence.length) return <p className="text-sm text-muted-foreground">No evidence was returned.</p>;
  return <div className="space-y-3">{evidence.map((item) => (
    <div key={item.id} className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="mb-2 flex items-center justify-between"><span className="text-xs font-medium text-muted-foreground">Page {item.pageNumber}</span><Button variant="ghost" size="xs" asChild><Link href={{ pathname: `/documents/${documentId}`, query: { page: item.pageNumber, evidence: item.id } }}>View in PDF <ExternalLink /></Link></Button></div>
      <blockquote className="border-l-2 border-blue-400 pl-3 text-sm leading-6 text-slate-700">“{item.quote}”</blockquote>
      {item.contextBefore || item.contextAfter ? <p className="mt-2 text-xs leading-5 text-muted-foreground">{item.contextBefore} <mark className="bg-amber-100">{item.quote}</mark> {item.contextAfter}</p> : null}
    </div>
  ))}</div>;
}

function FactPanel({ title, document, fact, evidence }: { title: string; document: { id: string; originalFilename: string }; fact: Omit<Fact, "document" | "evidence">; evidence: Evidence[] }) {
  return (
    <Card className="shadow-none">
      <CardHeader className="border-b border-slate-100 bg-slate-50/50"><p className="section-label text-blue-700">{title}</p><CardTitle className="break-words text-lg">{document.originalFilename}</CardTitle></CardHeader>
      <CardContent className="space-y-5">
        <dl className="grid gap-4 sm:grid-cols-2">
          <div><dt className="text-xs text-muted-foreground">Subject</dt><dd className="mt-1 font-medium">{fact.subjectRaw}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Predicate</dt><dd className="mt-1 font-medium">{fact.predicateCanonical}</dd></div>
          <div className="rounded-xl bg-blue-50 p-3"><dt className="text-xs text-blue-700">Raw value</dt><dd className="mt-1 text-xl font-semibold text-blue-950">{fact.valueRaw}</dd></div>
          <div><dt className="text-xs text-muted-foreground">Normalized</dt><dd className="mt-1 font-medium">{normalizedValue(fact)}</dd></div>
        </dl>
        <div><p className="mb-2 text-xs font-medium text-muted-foreground uppercase">Context</p><pre className="overflow-x-auto rounded-lg bg-slate-100 p-3 text-xs whitespace-pre-wrap">{formatJson(fact.normalizedContext)}</pre></div>
        <div><div className="mb-2 flex items-center gap-2 text-xs font-medium text-muted-foreground uppercase"><Quote className="size-3" /> Source evidence</div><EvidencePanel evidence={evidence} documentId={document.id} /></div>
      </CardContent>
    </Card>
  );
}

function effect(a: string, b: string, type: RelationshipType): string {
  if (a === b) return "Same";
  return type === "RECONCILABLE" ? "Explains difference" : "Conflicts";
}

export function RelationshipComparison({ id }: { id: string }) {
  const query = useRelationship(id);
  if (query.isLoading) return <LoadingState label="Loading relationship" />;
  if (query.error) return <ErrorState error={query.error} retry={() => void query.refetch()} />;
  const data = query.data!.data;
  const rows: Array<[string, string, string]> = [
    ["Time", field(data.leftFact.normalizedContext, "time"), field(data.rightFact.normalizedContext, "time")],
    ["Scope", field(data.leftFact.normalizedContext, "scope"), field(data.rightFact.normalizedContext, "scope")],
    ["Currency", data.leftFact.currency ?? "Not specified", data.rightFact.currency ?? "Not specified"],
    ["Value", data.leftFact.valueRaw, data.rightFact.valueRaw],
  ];

  return (
    <section aria-label="Relationship evidence and context" className="space-y-6">
      <div className="grid gap-5 xl:grid-cols-2">
        <FactPanel title="Fact A" document={data.leftDocument} fact={data.leftFact} evidence={data.leftEvidence} />
        <FactPanel title="Fact B" document={data.rightDocument} fact={data.rightFact} evidence={data.rightEvidence} />
      </div>
      <Card className="shadow-none"><CardHeader className="border-b border-slate-100"><CardTitle className="text-lg">Context comparison</CardTitle></CardHeader><CardContent className="p-0"><Table><TableHeader><TableRow><TableHead>Dimension</TableHead><TableHead>Fact A</TableHead><TableHead>Fact B</TableHead><TableHead>Effect</TableHead></TableRow></TableHeader><TableBody>{rows.map(([dimension, a, b]) => <TableRow key={dimension}><TableCell className="font-medium">{dimension}</TableCell><TableCell className="whitespace-normal">{a}</TableCell><TableCell className="whitespace-normal">{b}</TableCell><TableCell>{effect(a, b, data.classification)}</TableCell></TableRow>)}</TableBody></Table></CardContent></Card>
      <Card className="border-blue-200 bg-blue-50/70 shadow-none"><CardHeader><CardTitle className="text-lg">Explanation</CardTitle></CardHeader><CardContent><p className="max-w-4xl text-[15px] leading-7 text-slate-700">{data.explanation}</p><details className="mt-5 border-t border-blue-200/70 pt-4 text-xs text-muted-foreground"><summary className="cursor-pointer font-semibold text-blue-800">Reasoning signals</summary><pre className="mt-3 overflow-x-auto rounded-lg bg-white/80 p-3 whitespace-pre-wrap">{formatJson(data.ruleSignals)}</pre></details></CardContent></Card>
    </section>
  );
}
