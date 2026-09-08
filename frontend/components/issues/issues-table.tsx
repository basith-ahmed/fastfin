import { ChevronRight } from "lucide-react";

import { EmptyState, ErrorState, LoadingState } from "@/components/common/data-states";
import { PaginationControls } from "@/components/common/pagination-controls";
import { SeverityBadge } from "@/components/common/status-badges";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatDate, humanize } from "@/lib/formatters";
import type { ProcessingIssue } from "@/types";

export function IssuesTable({
  issues,
  loading,
  error,
  retry,
  page,
  totalPages,
  onPageChange,
  onSelect,
}: {
  issues: ProcessingIssue[];
  loading: boolean;
  error: unknown;
  retry: () => void;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  onSelect: (id: string) => void;
}) {
  if (loading) return <LoadingState label="Loading issues" />;
  if (error) return <ErrorState error={error} retry={retry} />;
  if (!issues.length) {
    return <EmptyState title="No issues found" description="No processing issues match the selected filters." />;
  }

  return (
    <Card className="gap-0 py-0 shadow-none">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Severity</TableHead>
            <TableHead>Issue</TableHead>
            <TableHead>Document</TableHead>
            <TableHead>Stage</TableHead>
            <TableHead>Created</TableHead>
            <TableHead><span className="sr-only">Open</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {issues.map((issue) => (
            <TableRow key={issue.id} className="group cursor-pointer" onClick={() => onSelect(issue.id)}>
              <TableCell>
                <SeverityBadge severity={issue.severity} />
              </TableCell>
              <TableCell className="max-w-lg whitespace-normal">
                <p className="font-medium text-slate-900">{humanize(issue.issueType)}</p>
                <p className="mt-1 line-clamp-2 text-xs leading-5 text-slate-500">{issue.message}</p>
              </TableCell>
              <TableCell className="max-w-56 truncate font-medium text-slate-700">{issue.document.originalFilename}</TableCell>
              <TableCell className="text-slate-600">{humanize(issue.stage)}</TableCell>
              <TableCell className="text-slate-500">
                {formatDate(issue.createdAt)}
              </TableCell>
              <TableCell className="w-12"><ChevronRight className="size-4 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-blue-600" /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <PaginationControls page={page} totalPages={totalPages} onPageChange={onPageChange} />
    </Card>
  );
}
