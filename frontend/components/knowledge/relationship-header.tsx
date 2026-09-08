"use client";

import { ErrorState, LoadingState } from "@/components/common/data-states";
import { RelationshipBadge } from "@/components/common/status-badges";
import { PageHeader } from "@/components/layout/page-header";
import { useRelationship } from "@/hooks/use-relationships";
import { formatConfidence } from "@/lib/formatters";

export function RelationshipHeader({ id }: { id: string }) {
  const query = useRelationship(id);
  if (query.isLoading) return <LoadingState label="Loading relationship" />;
  if (query.error) {
    return <ErrorState error={query.error} retry={() => void query.refetch()} />;
  }
  const data = query.data!.data;

  return (
    <section aria-label="Relationship classification" className="space-y-5">
      <PageHeader
        title={`${data.leftFact.predicateCanonical}: cross-document comparison`}
      />
      <div className="surface-panel flex flex-wrap items-center gap-x-8 gap-y-4 p-5">
        <div><p className="section-label mb-2">Classification</p><RelationshipBadge type={data.classification} /></div>
        <div><p className="section-label">Confidence</p><p className="mt-1 text-xl font-semibold tracking-tight">{formatConfidence(data.confidence)}</p></div>
        <div><p className="section-label">Decision method</p><p className="mt-1 text-sm font-medium text-slate-700">{data.decisionMethod}</p></div>
      </div>
    </section>
  );
}
