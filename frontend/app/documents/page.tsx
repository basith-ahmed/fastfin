"use client";

import { useState } from "react";

import { DocumentFilters } from "@/components/documents/document-filters";
import { DocumentsTable } from "@/components/documents/documents-table";
import { UploadZone } from "@/components/documents/upload-zone";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { useDocumentDetails, useDocuments } from "@/hooks/use-documents";

export default function DocumentsPage() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const documents = useDocuments({ page, pageSize: 20, status: status || undefined });
  const detailQueries = useDocumentDetails((documents.data?.data ?? []).map(({ id }) => id));
  const visibleDocuments = (documents.data?.data ?? []).filter((document) =>
    document.originalFilename.toLocaleLowerCase("en").includes(search.toLocaleLowerCase("en")),
  );
  const countsById = Object.fromEntries(
    (documents.data?.data ?? []).map((document, index) => [
      document.id,
      detailQueries[index]?.data?.data.counts,
    ]),
  );

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Library"
        title="Documents"
        description="Track processing and inspect the facts, relationships, and issues produced from each report."
      />
      <Card className="shadow-none">
        <CardContent>
          <UploadZone compact />
        </CardContent>
      </Card>
      <DocumentFilters
        search={search}
        status={status}
        onSearchChange={setSearch}
        onStatusChange={(value) => {
          setStatus(value);
          setPage(1);
        }}
      />
      <DocumentsTable
        documents={visibleDocuments}
        countsById={countsById}
        loading={documents.isLoading}
        error={documents.error}
        retry={() => void documents.refetch()}
        page={page}
        totalPages={documents.data?.pagination.totalPages ?? 0}
        onPageChange={setPage}
        emptyDescription={
          search
            ? "No filename on this page matches your search."
            : "Upload a PDF to begin building the knowledge layer."
        }
      />
    </div>
  );
}
