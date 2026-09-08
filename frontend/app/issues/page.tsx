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

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Pipeline transparency"
        title="Processing issues"
        description="Inspect extraction, grounding, normalization, embedding, and reasoning failures without hiding incomplete work."
      />
      <IssueFilters
        documents={documents.data?.data ?? []}
        documentId={documentId}
        severity={severity}
        issueType={issueType}
        onDocumentChange={(value) => updateFilter(setDocumentId, value)}
        onSeverityChange={(value) => updateFilter(setSeverity, value)}
        onIssueTypeChange={(value) => updateFilter(setIssueType, value)}
      />
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
