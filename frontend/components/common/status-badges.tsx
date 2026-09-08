import { Badge } from "@/components/ui/badge";
import type { DocumentStatus, IssueSeverity, RelationshipType } from "@/types";
import { cn } from "@/lib/utils";

const statusLabels: Record<DocumentStatus, string> = {
  UPLOADED: "Uploaded",
  QUEUED: "Queued",
  PARSING: "Parsing",
  EXTRACTING: "Extracting",
  NORMALIZING: "Normalizing",
  RESOLVING_ENTITIES: "Resolving entities",
  EMBEDDING: "Embedding",
  MATCHING: "Matching",
  REASONING: "Reasoning",
  COMPLETED: "Completed",
  COMPLETED_WITH_ISSUES: "Completed with issues",
  FAILED: "Failed",
};

export function StatusBadge({ status }: { status: DocumentStatus }) {
  const tone =
    status === "COMPLETED"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : status === "COMPLETED_WITH_ISSUES"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : status === "FAILED"
          ? "border-red-200 bg-red-50 text-red-700"
          : "border-blue-200 bg-blue-50 text-blue-700";
  return <Badge className={cn("gap-1.5 border px-2.5 py-1 font-semibold", tone)}><span className="size-1.5 rounded-full bg-current opacity-75" />{statusLabels[status]}</Badge>;
}

const relationshipLabels: Record<RelationshipType, string> = {
  CORROBORATES: "Corroborates",
  CONTRADICTS: "Contradiction",
  RECONCILABLE: "Reconciled by context",
  UNCERTAIN: "Uncertain",
};

export function RelationshipBadge({ type }: { type: RelationshipType }) {
  const tone =
    type === "CORROBORATES"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : type === "CONTRADICTS"
        ? "border-red-200 bg-red-50 text-red-700"
        : type === "RECONCILABLE"
          ? "border-amber-200 bg-amber-50 text-amber-800"
          : "border-slate-200 bg-slate-100 text-slate-700";
  return <Badge className={cn("gap-1.5 border px-2.5 py-1 font-semibold", tone)}><span className="size-1.5 rounded-full bg-current opacity-75" />{relationshipLabels[type]}</Badge>;
}

export function SeverityBadge({ severity }: { severity: IssueSeverity }) {
  const tone =
    severity === "ERROR"
      ? "border-red-200 bg-red-50 text-red-700"
      : severity === "WARNING"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-blue-200 bg-blue-50 text-blue-700";
  return <Badge className={cn("border", tone)}>{severity.toLowerCase()}</Badge>;
}
