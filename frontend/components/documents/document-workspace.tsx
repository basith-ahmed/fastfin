"use client";

import dynamic from "next/dynamic";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

import { ErrorState, LoadingState } from "@/components/common/data-states";
import {
  DocumentFactsPanel,
  type FactFilters,
} from "@/components/documents/document-facts-panel";
import { DocumentIssuesPanel } from "@/components/documents/document-issues-panel";
import { DocumentProcessingPanel } from "@/components/documents/document-processing-panel";
import { DocumentRelationshipsPanel } from "@/components/documents/document-relationships-panel";
import { FactDetailSheet } from "@/components/documents/fact-detail-sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useDocument } from "@/hooks/use-document";
import { useDocumentFacts } from "@/hooks/use-facts";
import { useDocumentIssues } from "@/hooks/use-issues";
import { useDocumentRelationships } from "@/hooks/use-relationships";
import { isTerminalDocumentStatus } from "@/lib/document-status";
import type { Evidence } from "@/types";

const PdfViewer = dynamic(
  () => import("@/components/documents/pdf-viewer").then((module) => module.PdfViewer),
  {
    ssr: false,
    loading: () => <LoadingState label="Loading PDF viewer" />,
  },
);

export function DocumentWorkspace({ id }: { id: string }) {
  const searchParams = useSearchParams();
  const initialPage = Math.max(1, Number(searchParams.get("page")) || 1);
  const [tab, setTab] = useState(searchParams.has("page") ? "pdf" : "facts");
  const [page, setPage] = useState(initialPage);
  const [selectedFactId, setSelectedFactId] = useState<string | null>(null);
  const [selectedEvidence, setSelectedEvidence] = useState<Evidence | null>(null);
  const [factFilters, setFactFilters] = useState<FactFilters>({
    predicate: "",
    valueType: "",
    minConfidence: "",
    search: "",
  });

  const document = useDocument(id);
  const active = !document.data || !isTerminalDocumentStatus(document.data.data.status);
  const facts = useDocumentFacts(id, { ...factFilters, pageSize: 100 }, active);
  const relationships = useDocumentRelationships(id, { pageSize: 100 }, active);
  const issues = useDocumentIssues(id, { pageSize: 100 }, active);
  const linkedEvidence = useMemo(() => {
    const evidenceId = searchParams.get("evidence");
    if (!evidenceId) return null;
    return (
      facts.data?.data
        .flatMap((fact) => fact.evidence)
        .find((item) => item.id === evidenceId) ?? null
    );
  }, [facts.data, searchParams]);
  const evidence = selectedEvidence ?? linkedEvidence;

  if (document.isLoading) return <LoadingState label="Loading document workspace" />;
  if (document.error) {
    return <ErrorState error={document.error} retry={() => void document.refetch()} />;
  }
  const data = document.data!.data;

  function viewEvidence(item: Evidence) {
    setSelectedEvidence(item);
    setPage(item.pageNumber);
    setTab("pdf");
    setSelectedFactId(null);
  }

  return (
    <section aria-label="Document inspection tabs">
      <Tabs value={tab} onValueChange={setTab} className="gap-5">
        <TabsList className="max-w-full justify-start overflow-x-auto" variant="line">
          <TabsTrigger value="pdf">PDF</TabsTrigger>
          <TabsTrigger value="facts">
            Facts ({facts.data?.pagination.total ?? 0})
          </TabsTrigger>
          <TabsTrigger value="relationships">
            Relationships ({relationships.data?.pagination.total ?? 0})
          </TabsTrigger>
          <TabsTrigger value="issues">
            Issues ({issues.data?.pagination.total ?? 0})
          </TabsTrigger>
          <TabsTrigger value="processing">Processing</TabsTrigger>
        </TabsList>
        <TabsContent value="pdf">
          <PdfViewer
            documentId={id}
            page={page}
            onPageChange={setPage}
            selectedEvidence={evidence}
          />
        </TabsContent>
        <TabsContent value="facts">
          <DocumentFactsPanel
            facts={facts.data?.data ?? []}
            filters={factFilters}
            loading={facts.isLoading}
            error={facts.error}
            retry={() => void facts.refetch()}
            onFiltersChange={setFactFilters}
            onSelectFact={setSelectedFactId}
          />
        </TabsContent>
        <TabsContent value="relationships">
          <DocumentRelationshipsPanel
            relationships={relationships.data?.data ?? []}
            loading={relationships.isLoading}
            error={relationships.error}
          />
        </TabsContent>
        <TabsContent value="issues">
          <DocumentIssuesPanel
            issues={issues.data?.data ?? []}
            loading={issues.isLoading}
            error={issues.error}
          />
        </TabsContent>
        <TabsContent value="processing">
          <DocumentProcessingPanel document={data} />
        </TabsContent>
      </Tabs>
      <FactDetailSheet
        factId={selectedFactId}
        onClose={() => setSelectedFactId(null)}
        onViewEvidence={viewEvidence}
      />
    </section>
  );
}
