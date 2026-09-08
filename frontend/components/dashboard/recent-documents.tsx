"use client";

import Link from "next/link";

import { EmptyState, ErrorState, LoadingState } from "@/components/common/data-states";
import { StatusBadge } from "@/components/common/status-badges";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useDocuments } from "@/hooks/use-documents";
import { formatDate } from "@/lib/formatters";

export function RecentDocuments() {
  const documents = useDocuments({ page: 1, pageSize: 5 });

  return (
    <Card className="shadow-none">
      <CardHeader className="border-b">
        <div className="flex items-center justify-between">
          <CardTitle>Recent documents</CardTitle>
          <Button variant="ghost" size="sm" asChild>
            <Link href="/documents">View all</Link>
          </Button>
        </div>
      </CardHeader>
      <CardContent className="p-0">
        {documents.isLoading ? <LoadingState label="Loading recent documents" /> : null}
        {documents.error ? (
          <div className="p-4">
            <ErrorState error={documents.error} retry={() => void documents.refetch()} />
          </div>
        ) : null}
        {documents.data?.data.length ? (
          <div className="divide-y">
            {documents.data.data.map((document) => (
              <Link
                key={document.id}
                href={`/documents/${document.id}`}
                className="flex items-center justify-between gap-4 px-4 py-3 hover:bg-muted/40"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{document.originalFilename}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {formatDate(document.createdAt)}
                  </p>
                </div>
                <StatusBadge status={document.status} />
              </Link>
            ))}
          </div>
        ) : null}
        {documents.data?.data.length === 0 ? (
          <div className="p-4">
            <EmptyState title="No documents yet" description="Your uploaded PDFs will appear here." />
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
