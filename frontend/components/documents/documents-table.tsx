import Link from "next/link";

import { EmptyState, ErrorState, LoadingState } from "@/components/common/data-states";
import { PaginationControls } from "@/components/common/pagination-controls";
import { StatusBadge } from "@/components/common/status-badges";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate } from "@/lib/formatters";
import type { DocumentRecord } from "@/types";

type Counts = DocumentRecord["counts"];

export function DocumentsTable({
  documents,
  countsById,
  loading,
  error,
  retry,
  page,
  totalPages,
  onPageChange,
  emptyDescription,
}: {
  documents: DocumentRecord[];
  countsById: Record<string, Counts>;
  loading: boolean;
  error: unknown;
  retry: () => void;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  emptyDescription: string;
}) {
  if (loading) return <LoadingState label="Loading documents" />;
  if (error) return <ErrorState error={error} retry={retry} />;
  if (!documents.length) {
    return <EmptyState title="No documents found" description={emptyDescription} />;
  }

  return (
    <Card className="gap-0 py-0 shadow-none">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Pages</TableHead>
            <TableHead>Facts</TableHead>
            <TableHead>Relationships</TableHead>
            <TableHead>Issues</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Uploaded</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {documents.map((document) => {
            const counts = countsById[document.id];
            return (
              <TableRow key={document.id}>
                <TableCell className="max-w-72 whitespace-normal">
                  <Link className="font-medium hover:underline" href={`/documents/${document.id}`}>
                    {document.originalFilename}
                  </Link>
                </TableCell>
                <TableCell>{document.pageCount ?? "—"}</TableCell>
                <TableCell>{counts?.facts ?? "—"}</TableCell>
                <TableCell>{counts?.relationships ?? "—"}</TableCell>
                <TableCell>{counts?.issues ?? "—"}</TableCell>
                <TableCell>
                  <StatusBadge status={document.status} />
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {formatDate(document.createdAt)}
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
      <PaginationControls page={page} totalPages={totalPages} onPageChange={onPageChange} />
    </Card>
  );
}
