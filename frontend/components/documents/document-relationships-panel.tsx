import Link from "next/link";

import { EmptyState, ErrorState, LoadingState } from "@/components/common/data-states";
import { RelationshipBadge } from "@/components/common/status-badges";
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

export function DocumentRelationshipsPanel({
  relationships,
  loading,
  error,
}: {
  relationships: Relationship[];
  loading: boolean;
  error: unknown;
}) {
  if (loading) return <LoadingState label="Loading relationships" />;
  if (error) return <ErrorState error={error} />;
  if (!relationships.length) {
    return (
      <EmptyState
        title="No relationships"
        description="Comparable cross-document facts have not produced relationships yet."
      />
    );
  }

  return (
    <Card className="gap-0 py-0 shadow-none">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Type</TableHead>
            <TableHead>Fact A</TableHead>
            <TableHead>Fact B</TableHead>
            <TableHead>Confidence</TableHead>
            <TableHead>Explanation</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {relationships.map((relationship) => (
            <TableRow key={relationship.id}>
              <TableCell>
                <RelationshipBadge type={relationship.relationshipType} />
              </TableCell>
              <TableCell>
                <Link
                  className="font-medium hover:underline"
                  href={`/relationships/${relationship.id}`}
                >
                  {relationship.leftFact.valueRaw}
                </Link>
              </TableCell>
              <TableCell>{relationship.rightFact.valueRaw}</TableCell>
              <TableCell>{formatConfidence(relationship.confidence)}</TableCell>
              <TableCell className="max-w-lg whitespace-normal text-muted-foreground">
                {relationship.explanation}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
