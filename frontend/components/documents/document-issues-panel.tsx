import { EmptyState, ErrorState, LoadingState } from "@/components/common/data-states";
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

export function DocumentIssuesPanel({
  issues,
  loading,
  error,
}: {
  issues: ProcessingIssue[];
  loading: boolean;
  error: unknown;
}) {
  if (loading) return <LoadingState label="Loading issues" />;
  if (error) return <ErrorState error={error} />;
  if (!issues.length) {
    return (
      <EmptyState
        title="No processing issues"
        description="This document has no recorded extraction or reasoning issues."
      />
    );
  }

  return (
    <Card className="gap-0 py-0 shadow-none">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Severity</TableHead>
            <TableHead>Stage</TableHead>
            <TableHead>Type</TableHead>
            <TableHead>Message</TableHead>
            <TableHead>Created</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {issues.map((issue) => (
            <TableRow key={issue.id}>
              <TableCell>
                <SeverityBadge severity={issue.severity} />
              </TableCell>
              <TableCell>{humanize(issue.stage)}</TableCell>
              <TableCell>{humanize(issue.issueType)}</TableCell>
              <TableCell className="max-w-xl whitespace-normal">{issue.message}</TableCell>
              <TableCell>{formatDate(issue.createdAt)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
