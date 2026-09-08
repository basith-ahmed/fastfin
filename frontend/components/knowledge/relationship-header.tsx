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
        eyebrow="Relationship inspector"
        title={`${data.leftFact.predicateCanonical}: cross-document comparison`}
        description="Review both source claims, their context, and the evidence behind FastFin’s decision."
      />
      <div className="flex flex-wrap items-center gap-3 rounded-xl border bg-white p-4">
        <RelationshipBadge type={data.classification} />
        <span className="text-sm">
          <strong>{formatConfidence(data.confidence)}</strong> confidence
        </span>
        <span className="text-sm text-muted-foreground">
          Decision: {data.decisionMethod}
        </span>
      </div>
    </section>
  );
}
