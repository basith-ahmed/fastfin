"use client";

import { useState } from "react";

import { RelationshipFilters } from "@/components/knowledge/relationship-filters";
import { RelationshipsTable } from "@/components/knowledge/relationships-table";
import { PageHeader } from "@/components/layout/page-header";
import { useRelationships } from "@/hooks/use-relationships";
import type { RelationshipType } from "@/types";

export default function KnowledgePage() {
  const [type, setType] = useState<RelationshipType | "">("");
  const [page, setPage] = useState(1);
  const relationships = useRelationships({
    type: type || undefined,
    page,
    pageSize: 20,
  });

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Knowledge layer"
        title="Cross-document relationships"
        description="Compare claims across reports and inspect the evidence and context behind every classification."
      />
      <RelationshipFilters
        value={type}
        onChange={(value) => {
          setType(value);
          setPage(1);
        }}
      />
      <RelationshipsTable
        relationships={relationships.data?.data ?? []}
        loading={relationships.isLoading}
        error={relationships.error}
        retry={() => void relationships.refetch()}
        page={page}
        totalPages={relationships.data?.pagination.totalPages ?? 0}
        onPageChange={setPage}
      />
    </div>
  );
}
