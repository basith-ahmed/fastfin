"use client";

import { ErrorState, LoadingState } from "@/components/common/data-states";
import { StatusBadge } from "@/components/common/status-badges";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useDocument } from "@/hooks/use-document";
import { isTerminalDocumentStatus } from "@/lib/document-status";
import { formatDate, humanize } from "@/lib/formatters";

export function DocumentHeader({ id }: { id: string }) {
  const document = useDocument(id);
  if (document.isLoading) return <LoadingState label="Loading document" />;
  if (document.error) {
    return <ErrorState error={document.error} retry={() => void document.refetch()} />;
  }

  const data = document.data!.data;
  const active = !isTerminalDocumentStatus(data.status);
  const duration =
    typeof data.metrics?.durationMs === "number"
      ? `${(data.metrics.durationMs / 1000).toFixed(1)}s`
      : "—";

  return (
    <section aria-label="Document status" className="space-y-5">
      <PageHeader
        eyebrow="Document workspace"
        title={data.originalFilename}
        description={`Uploaded ${formatDate(data.createdAt)}`}
        action={<StatusBadge status={data.status} />}
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
        <Metric label="Pages" value={data.pageCount ?? "—"} />
        <Metric label="Facts" value={data.counts?.facts ?? "—"} />
        <Metric label="Relationships" value={data.counts?.relationships ?? "—"} />
        <Metric label="Issues" value={data.counts?.issues ?? "—"} />
        <Metric label="Duration" value={duration} />
        <Metric
          label="Progress"
          value={`${data.latestProcessingJob?.progress ?? (active ? 0 : 100)}%`}
        />
      </div>
      {active ? (
        <Card className="shadow-none">
          <CardContent>
            <div className="mb-2 flex items-center justify-between text-sm">
              <span>{humanize(data.latestProcessingJob?.stage ?? data.status)}</span>
              <span className="text-muted-foreground">
                {data.latestProcessingJob?.progress ?? 0}%
              </span>
            </div>
            <Progress value={data.latestProcessingJob?.progress ?? 0} />
          </CardContent>
        </Card>
      ) : null}
      {data.status === "FAILED" ? (
        <ErrorState
          error={
            new Error(
              data.latestProcessingJob?.error ??
                "Document processing failed. Review the Issues tab for details.",
            )
          }
        />
      ) : null}
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <Card size="sm" className="shadow-none">
      <CardContent>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-2 text-lg font-semibold tabular-nums">{value}</p>
      </CardContent>
    </Card>
  );
}
