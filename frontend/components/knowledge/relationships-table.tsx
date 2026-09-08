import { ArrowRight } from "lucide-react";
import Link from "next/link";

import { EmptyState, ErrorState, LoadingState } from "@/components/common/data-states";
import { PaginationControls } from "@/components/common/pagination-controls";
import { RelationshipBadge } from "@/components/common/status-badges";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatConfidence } from "@/lib/formatters";
import type { Relationship } from "@/types";

export function RelationshipsTable({
  relationships,
  loading,
  error,
  retry,
  page,
  totalPages,
  onPageChange,
}: {
  relationships: Relationship[];
  loading: boolean;
  error: unknown;
  retry: () => void;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}) {
  if (loading) return <LoadingState label="Loading relationships" />;
  if (error) return <ErrorState error={error} retry={retry} />;
  if (!relationships.length) {
    return (
      <EmptyState
        title="No relationships found"
        description="Relationships appear after two or more documents contain comparable facts."
      />
    );
  }

  return (
    <Card className="gap-0 py-0 shadow-none">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Classification</TableHead>
            <TableHead>Entity</TableHead>
            <TableHead>Predicate</TableHead>
            <TableHead>Fact A</TableHead>
            <TableHead>Fact B</TableHead>
            <TableHead>Documents</TableHead>
            <TableHead>Confidence</TableHead>
            <TableHead />
          </TableRow>
        </TableHeader>
        <TableBody>
          {relationships.map((relationship) => (
            <TableRow key={relationship.id}>
              <TableCell>
                <RelationshipBadge type={relationship.relationshipType} />
              </TableCell>
              <TableCell>
                {relationship.leftFact.entity?.canonicalName ?? relationship.leftFact.subjectRaw}
              </TableCell>
              <TableCell>{relationship.leftFact.predicateCanonical}</TableCell>
              <TableCell className="max-w-48 truncate font-medium">
                {relationship.leftFact.valueRaw}
              </TableCell>
              <TableCell className="max-w-48 truncate font-medium">
                {relationship.rightFact.valueRaw}
              </TableCell>
              <TableCell className="max-w-56 truncate text-muted-foreground">
                {relationship.leftFact.document.originalFilename} ·{" "}
                {relationship.rightFact.document.originalFilename}
              </TableCell>
              <TableCell>{formatConfidence(relationship.confidence)}</TableCell>
              <TableCell>
                <Button variant="ghost" size="icon-sm" asChild>
                  <Link
                    href={`/relationships/${relationship.id}`}
                    aria-label="Inspect relationship"
                  >
                    <ArrowRight />
                  </Link>
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <PaginationControls page={page} totalPages={totalPages} onPageChange={onPageChange} />
    </Card>
  );
}
