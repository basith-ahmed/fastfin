"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";

import { LoadingState } from "@/components/common/data-states";
import { PaginationControls } from "@/components/common/pagination-controls";
import { SummaryMetrics } from "@/components/dashboard/summary-metrics";
import {
  DocumentFactsPanel,
  type FactFilters,
} from "@/components/documents/document-facts-panel";
import { FactDetailSheet } from "@/components/documents/fact-detail-sheet";
import { RelationshipFilters } from "@/components/knowledge/relationship-filters";
import { RelationshipsTable } from "@/components/knowledge/relationships-table";
import { PageHeader } from "@/components/layout/page-header";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useFacts } from "@/hooks/use-facts";
import { useRelationships } from "@/hooks/use-relationships";
import type { RelationshipType } from "@/types";

export default function KnowledgePage() {
  return <Suspense fallback={<LoadingState label="Loading knowledge" />}><KnowledgeContent /></Suspense>;
}

function KnowledgeContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const tab = searchParams.get("view") === "relationships" ? "relationships" : "facts";
  const [selectedFactId, setSelectedFactId] = useState<string | null>(null);
  const [factPage, setFactPage] = useState(1);
  const [factFilters, setFactFilters] = useState<FactFilters>({
    predicate: "",
    valueType: "",
    minConfidence: "",
    search: "",
  });
  const [type, setType] = useState<RelationshipType | "">("");
  const [relationshipPage, setRelationshipPage] = useState(1);
  const facts = useFacts({ ...factFilters, page: factPage, pageSize: 20 });
  const relationships = useRelationships({
    type: type || undefined,
    page: relationshipPage,
    pageSize: 20,
  });

  function changeTab(value: string) {
    const nextParams = new URLSearchParams(searchParams.toString());
    nextParams.set("view", value === "relationships" ? "relationships" : "facts");
    router.replace(`/knowledge?${nextParams.toString()}`, { scroll: false });
  }

  return (
    <div className="space-y-8">
      <PageHeader title="Knowledge" />
      <div className="space-y-4"><h2 className="text-lg font-semibold">Summary</h2><SummaryMetrics /></div>
      <Tabs value={tab} onValueChange={changeTab} className="gap-5">
        <div className="flex flex-col gap-3 border-b border-slate-200 sm:flex-row sm:items-end sm:justify-between"><h2 className="text-lg font-semibold">Records</h2><TabsList variant="line" className="h-11 gap-5">
          <TabsTrigger value="facts">
            Facts ({facts.data?.pagination.total ?? 0})
          </TabsTrigger>
          <TabsTrigger value="relationships">
            Relationships ({relationships.data?.pagination.total ?? 0})
          </TabsTrigger>
        </TabsList></div>
        <TabsContent value="facts">
          <DocumentFactsPanel
            facts={facts.data?.data ?? []}
            filters={factFilters}
            loading={facts.isLoading}
            error={facts.error}
            retry={() => void facts.refetch()}
            onFiltersChange={(filters) => {
              setFactFilters(filters);
              setFactPage(1);
            }}
            onSelectFact={setSelectedFactId}
          />
          <PaginationControls
            page={factPage}
            totalPages={facts.data?.pagination.totalPages ?? 0}
            onPageChange={setFactPage}
          />
        </TabsContent>
        <TabsContent value="relationships" className="space-y-4">
          <RelationshipFilters
            value={type}
            onChange={(value) => {
              setType(value);
              setRelationshipPage(1);
            }}
          />
          <RelationshipsTable
            relationships={relationships.data?.data ?? []}
            loading={relationships.isLoading}
            error={relationships.error}
            retry={() => void relationships.refetch()}
            page={relationshipPage}
            totalPages={relationships.data?.pagination.totalPages ?? 0}
            onPageChange={setRelationshipPage}
          />
        </TabsContent>
      </Tabs>
      <FactDetailSheet
        factId={selectedFactId}
        onClose={() => setSelectedFactId(null)}
        onViewEvidence={(evidence) =>
          router.push(
            `/documents/${evidence.documentId}?page=${evidence.pageNumber}&evidence=${evidence.id}`,
          )
        }
      />
    </div>
  );
}
