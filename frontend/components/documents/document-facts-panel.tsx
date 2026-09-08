import { EmptyState, ErrorState, LoadingState } from "@/components/common/data-states";
import { inputClassName } from "@/components/common/form-controls";
import { Card } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { formatConfidence, humanize, normalizedValue } from "@/lib/formatters";
import type { Fact } from "@/types";

export type FactFilters = {
  predicate: string;
  valueType: string;
  minConfidence: string;
  search: string;
};

export function DocumentFactsPanel({
  facts,
  filters,
  loading,
  error,
  retry,
  onFiltersChange,
  onSelectFact,
}: {
  facts: Fact[];
  filters: FactFilters;
  loading: boolean;
  error: unknown;
  retry: () => void;
  onFiltersChange: (filters: FactFilters) => void;
  onSelectFact: (id: string) => void;
}) {
  return (
    <>
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <input
          className={inputClassName}
          placeholder="Search subject or value"
          value={filters.search}
          onChange={(event) => onFiltersChange({ ...filters, search: event.target.value })}
        />
        <input
          className={inputClassName}
          placeholder="Predicate"
          value={filters.predicate}
          onChange={(event) => onFiltersChange({ ...filters, predicate: event.target.value })}
        />
        <select
          className={inputClassName}
          value={filters.valueType}
          onChange={(event) => onFiltersChange({ ...filters, valueType: event.target.value })}
        >
          <option value="">All value types</option>
          {[
            "TEXT",
            "NUMBER",
            "MONEY",
            "PERCENTAGE",
            "DATE",
            "BOOLEAN",
            "QUANTITY",
            "DURATION",
            "OTHER",
          ].map((value) => (
            <option key={value} value={value}>
              {humanize(value)}
            </option>
          ))}
        </select>
        <select
          className={inputClassName}
          value={filters.minConfidence}
          onChange={(event) =>
            onFiltersChange({ ...filters, minConfidence: event.target.value })
          }
        >
          <option value="">Any confidence</option>
          <option value="0.9">90%+</option>
          <option value="0.75">75%+</option>
          <option value="0.6">60%+</option>
        </select>
      </div>
      {loading ? <LoadingState label="Loading facts" /> : null}
      {error ? <ErrorState error={error} retry={retry} /> : null}
      {!loading && !error && !facts.length ? (
        <EmptyState title="No facts found" description="No accepted facts match these filters yet." />
      ) : null}
      {facts.length ? (
        <Card className="gap-0 py-0 shadow-none">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subject</TableHead>
                <TableHead>Predicate</TableHead>
                <TableHead>Raw value</TableHead>
                <TableHead>Normalized</TableHead>
                <TableHead>Context</TableHead>
                <TableHead>Confidence</TableHead>
                <TableHead>Page</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {facts.map((fact) => (
                <TableRow
                  key={fact.id}
                  className="cursor-pointer"
                  onClick={() => onSelectFact(fact.id)}
                >
                  <TableCell className="max-w-56 whitespace-normal font-medium">
                    {fact.subjectRaw}
                  </TableCell>
                  <TableCell>{fact.predicateCanonical}</TableCell>
                  <TableCell className="font-medium">{fact.valueRaw}</TableCell>
                  <TableCell>{normalizedValue(fact)}</TableCell>
                  <TableCell className="max-w-64 truncate">
                    {JSON.stringify(fact.normalizedContext)}
                  </TableCell>
                  <TableCell>{formatConfidence(fact.confidence)}</TableCell>
                  <TableCell>{fact.evidence[0]?.pageNumber ?? "—"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Card>
      ) : null}
    </>
  );
}
