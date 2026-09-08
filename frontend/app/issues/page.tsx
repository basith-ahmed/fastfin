"use client";

import { useState } from "react";

import { IssueDetailSheet } from "@/components/issues/issue-detail-sheet";
import { IssueFilters } from "@/components/issues/issue-filters";
import { IssuesTable } from "@/components/issues/issues-table";
import { PageHeader } from "@/components/layout/page-header";
import { useDocuments } from "@/hooks/use-documents";
import { useIssue, useIssues } from "@/hooks/use-issues";

export default function IssuesPage() {
  const [page, setPage] = useState(1);
  const [documentId, setDocumentId] = useState("");
  const [severity, setSeverity] = useState("");
  const [issueType, setIssueType] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const documents = useDocuments({ pageSize: 100 });
  const issues = useIssues({
    page,
    pageSize: 20,
    documentId: documentId || undefined,
    severity: severity || undefined,
    issueType: issueType || undefined,
  });
  const detail = useIssue(selectedId);
  const updateFilter = (setter: (value: string) => void, value: string) => {
    setter(value);
    setPage(1);
  };
  const hasFilters = Boolean(documentId || severity || issueType);

  return (
    <div className="space-y-8">
      <PageHeader title="Processing issues" />
      <section className="space-y-4">
        <div className="surface-panel p-5">
          <IssueFilters
            documents={documents.data?.data ?? []}
            documentId={documentId}
            severity={severity}
            issueType={issueType}
            hasFilters={hasFilters}
            onDocumentChange={(value) => updateFilter(setDocumentId, value)}
            onSeverityChange={(value) => updateFilter(setSeverity, value)}
            onIssueTypeChange={(value) => updateFilter(setIssueType, value)}
            onClear={() => { setDocumentId(""); setSeverity(""); setIssueType(""); setPage(1); }}
          />
        </div>
        <div className="flex items-center justify-between"><h2 className="text-lg font-semibold">Issues</h2><p className="text-sm tabular-nums text-slate-500">{issues.data?.pagination.total ?? 0} results</p></div>
        <IssuesTable
          issues={issues.data?.data ?? []}
          loading={issues.isLoading}
          error={issues.error}
          retry={() => void issues.refetch()}
          page={page}
          totalPages={issues.data?.pagination.totalPages ?? 0}
          onPageChange={setPage}
          onSelect={setSelectedId}
        />
      </section>
      <IssueDetailSheet
        issue={detail.data?.data}
        loading={detail.isLoading}
        error={detail.error}
        open={selectedId !== null}
        onClose={() => setSelectedId(null)}
      />
    </div>
  );
}
