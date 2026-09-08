import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatJson, humanize } from "@/lib/formatters";
import type { DocumentRecord } from "@/types";

export function DocumentProcessingPanel({ document }: { document: DocumentRecord }) {
  const job = document.latestProcessingJob;
  return (
    <Card className="shadow-none">
      <CardHeader>
        <CardTitle>Latest processing attempt</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <Metric label="Status" value={job?.status ?? document.status} />
          <Metric label="Stage" value={humanize(job?.stage ?? document.status)} />
          <Metric label="Attempt" value={job?.attempt ?? "—"} />
          <Metric label="Progress" value={`${job?.progress ?? 0}%`} />
        </div>
        {job?.error ? (
          <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{job.error}</p>
        ) : null}
        <pre className="overflow-x-auto rounded-lg bg-slate-950 p-4 text-xs whitespace-pre-wrap text-slate-200">
          {formatJson(document.metrics ?? {})}
        </pre>
      </CardContent>
    </Card>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-medium">{value}</p>
    </div>
  );
}
