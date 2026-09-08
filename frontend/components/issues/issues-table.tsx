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
            <TableHead>Document</TableHead>
            <TableHead>Stage</TableHead>
            <TableHead>Issue type</TableHead>
            <TableHead>Severity</TableHead>
            <TableHead>Message</TableHead>
            <TableHead>Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {issues.map((issue) => (
            <TableRow key={issue.id} className="cursor-pointer" onClick={() => onSelect(issue.id)}>
              <TableCell className="max-w-52 truncate font-medium">
                {issue.document.originalFilename}
              </TableCell>
              <TableCell>{humanize(issue.stage)}</TableCell>
              <TableCell>{humanize(issue.issueType)}</TableCell>
              <TableCell>
                <SeverityBadge severity={issue.severity} />
              </TableCell>
              <TableCell className="max-w-md whitespace-normal">{issue.message}</TableCell>
              <TableCell className="text-muted-foreground">
                {formatDate(issue.createdAt)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <PaginationControls page={page} totalPages={totalPages} onPageChange={onPageChange} />
    </Card>
  );
}
