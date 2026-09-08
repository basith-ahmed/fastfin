"use client";

import { Clock3, FileCheck2, FileText, Link2, TriangleAlert } from "lucide-react";
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
        ? "In progress"
      : "—";

  return (
    <section aria-label="Document status" className="space-y-5">
      <PageHeader
        title={data.originalFilename}
        description={`Uploaded ${formatDate(data.createdAt)}`}
        action={<StatusBadge status={data.status} />}
      />
      <div className="surface-panel grid divide-y divide-slate-100 overflow-hidden sm:grid-cols-3 sm:divide-x sm:divide-y-0 lg:grid-cols-5">
        <Metric icon={FileText} label="Pages" value={data.pageCount ?? "—"} />
        <Metric icon={FileCheck2} label="Verified facts" value={data.counts?.facts ?? "—"} />
        <Metric icon={Link2} label="Relationships" value={data.counts?.relationships ?? "—"} />
        <Metric icon={TriangleAlert} label="Issues" value={data.counts?.issues ?? "—"} />
        <Metric icon={Clock3} label="Processing time" value={duration} />
      </div>
      {active ? (
        <Card className="border-blue-100 bg-blue-50/35 shadow-none">
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

function Metric({ icon: Icon, label, value }: { icon: typeof FileText; label: string; value: string | number }) {
  return (
    <div className="flex items-center gap-3 px-5 py-4"><span className="grid size-9 place-items-center rounded-lg bg-slate-50 text-slate-500"><Icon className="size-4" /></span><div><p className="text-xs text-slate-500">{label}</p><p className="mt-0.5 text-lg font-semibold tracking-tight tabular-nums text-slate-900">{value}</p></div></div>
  );
}
