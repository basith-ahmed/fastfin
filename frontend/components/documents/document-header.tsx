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
  const job = data.latestProcessingJob;
  const live = job?.metrics;
  const duration =
    typeof data.metrics?.durationMs === "number"
      ? `${(data.metrics.durationMs / 1000).toFixed(1)}s`
      : active && job?.startedAt
        ? formatElapsed(Date.now() - new Date(job.startedAt).getTime())
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
              <span>{humanize(job?.stage ?? data.status)}</span>
              <span className="text-muted-foreground">
                {job?.progress ?? 0}%
              </span>
            </div>
            <Progress value={job?.progress ?? 0} />
            <p className="mt-3 text-sm font-medium">
              {live?.activity ?? activityForStage(job?.stage ?? data.status)}
            </p>
            <div className="mt-2 grid gap-x-6 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
              <LiveMetric
                label="Chunks"
                value={
                  live?.chunksTotal
                    ? `${live.chunksProcessed ?? 0} of ${live.chunksTotal}`
                    : "Preparing"
                }
              />
              <LiveMetric label="Candidates" value={live?.factCandidates ?? 0} />
              <LiveMetric label="Facts accepted" value={live?.factsAccepted ?? 0} />
              <LiveMetric label="Failed chunks" value={live?.failedChunks ?? 0} />
            </div>
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

function LiveMetric({ label, value }: { label: string; value: string | number }) {
  return (
    <span>
      {label}: <strong className="font-medium text-foreground tabular-nums">{value}</strong>
    </span>
  );
}

function activityForStage(stage: string): string {
  const activities: Record<string, string> = {
    QUEUED: "Waiting for an available worker",
    PARSING: "Parsing PDF pages and building text chunks",
    EXTRACTING: "Waiting for structured fact extraction",
    NORMALIZING: "Verifying evidence and normalizing facts",
    RESOLVING_ENTITIES: "Resolving fact subjects to entities",
    EMBEDDING: "Generating fact embeddings",
    MATCHING: "Finding cross-document fact candidates",
    REASONING: "Classifying candidate relationships",
  };
  return activities[stage] ?? humanize(stage);
}

function formatElapsed(milliseconds: number): string {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return minutes > 0 ? `${minutes}m ${remainingSeconds}s` : `${remainingSeconds}s`;
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
