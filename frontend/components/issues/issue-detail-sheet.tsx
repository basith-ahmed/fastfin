import { ErrorState, LoadingState } from "@/components/common/data-states";
import { SeverityBadge } from "@/components/common/status-badges";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { formatConfidence, formatDate, formatJson, humanize } from "@/lib/formatters";
import type { ProcessingIssue } from "@/types";

export function IssueDetailSheet({
  issue,
  loading,
  error,
  open,
  onClose,
}: {
  issue: ProcessingIssue | undefined;
  loading: boolean;
  error: unknown;
  open: boolean;
  onClose: () => void;
}) {
  return (
    <Sheet open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <SheetContent className="overflow-y-auto sm:max-w-xl">
        <SheetHeader>
          <SheetTitle>Issue detail</SheetTitle>
          <SheetDescription>
            Operational context captured when this pipeline issue occurred.
          </SheetDescription>
        </SheetHeader>
        <div className="space-y-5 px-4 pb-8">
          {loading ? <LoadingState /> : null}
          {error ? <ErrorState error={error} /> : null}
          {issue ? (
            <>
              <div className="flex items-center justify-between">
                <SeverityBadge severity={issue.severity} />
                <span className="text-xs text-muted-foreground">
                  {formatDate(issue.createdAt)}
                </span>
              </div>
              <Detail label="Document" value={issue.document.originalFilename} />
              <div className="grid grid-cols-2 gap-4">
                <Detail label="Stage" value={humanize(issue.stage)} />
                <Detail label="Type" value={humanize(issue.issueType)} />
              </div>
              <Detail label="Message" value={issue.message} />
              {issue.fact ? (
                <div>
                  <p className="text-xs text-muted-foreground uppercase">
                    Related candidate or fact
                  </p>
                  <p className="mt-1">
                    {issue.fact.subjectRaw} · {issue.fact.predicateCanonical} ·{" "}
                    {issue.fact.valueRaw}
                  </p>
                  {typeof issue.fact.confidence === "number" ? (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Confidence {formatConfidence(issue.fact.confidence)}
                    </p>
                  ) : null}
                </div>
              ) : null}
              <div>
                <p className="text-xs text-muted-foreground uppercase">Metadata</p>
                <pre className="mt-2 overflow-x-auto rounded-lg bg-slate-950 p-4 text-xs whitespace-pre-wrap text-slate-200">
                  {formatJson(issue.metadata)}
                </pre>
              </div>
            </>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground uppercase">{label}</p>
      <p className="mt-1 leading-6 font-medium">{value}</p>
    </div>
  );
}
