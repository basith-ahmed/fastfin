import { inputClassName } from "@/components/common/form-controls";
import { Button } from "@/components/ui/button";
import { humanize } from "@/lib/formatters";
import type { DocumentRecord } from "@/types";

const issueTypes = [
  "",
  "PDF_PARSE_FAILURE",
  "EMPTY_PAGE",
  "OCR_REQUIRED",
  "LLM_REQUEST_FAILURE",
  "LLM_INVALID_OUTPUT",
  "LOW_FACT_CONFIDENCE",
  "EVIDENCE_NOT_FOUND",
  "EVIDENCE_AMBIGUOUS",
  "NORMALIZATION_FAILURE",
  "AMBIGUOUS_ENTITY",
  "EMBEDDING_FAILURE",
  "RELATIONSHIP_UNCERTAIN",
  "RELATIONSHIP_REASONING_FAILURE",
  "UNKNOWN",
];

export function IssueFilters({
  documents,
  documentId,
  severity,
  issueType,
  hasFilters,
  onDocumentChange,
  onSeverityChange,
  onIssueTypeChange,
  onClear,
}: {
  documents: DocumentRecord[];
  documentId: string;
  severity: string;
  issueType: string;
  hasFilters: boolean;
  onDocumentChange: (value: string) => void;
  onSeverityChange: (value: string) => void;
  onIssueTypeChange: (value: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-[minmax(220px,1.2fr)_minmax(160px,.7fr)_minmax(220px,1fr)_auto] lg:items-end">
      <label className="grid gap-1.5"><span className="text-xs font-medium text-slate-600">Document</span><select
        aria-label="Filter by document"
        value={documentId}
        onChange={(event) => onDocumentChange(event.target.value)}
        className={inputClassName}
      >
        <option value="">All documents</option>
        {documents.map((document) => (
          <option key={document.id} value={document.id}>
            {document.originalFilename}
          </option>
        ))}
      </select></label>
      <label className="grid gap-1.5"><span className="text-xs font-medium text-slate-600">Severity</span><select
        aria-label="Filter by severity"
        value={severity}
        onChange={(event) => onSeverityChange(event.target.value)}
        className={inputClassName}
      >
        <option value="">All severities</option>
        <option value="INFO">Info</option>
        <option value="WARNING">Warning</option>
        <option value="ERROR">Error</option>
      </select></label>
      <label className="grid gap-1.5"><span className="text-xs font-medium text-slate-600">Issue type</span><select
        aria-label="Filter by issue type"
        value={issueType}
        onChange={(event) => onIssueTypeChange(event.target.value)}
        className={inputClassName}
      >
        {issueTypes.map((value) => (
          <option key={value || "all"} value={value}>
            {value ? humanize(value) : "All issue types"}
          </option>
        ))}
      </select></label>
      <Button variant="outline" disabled={!hasFilters} onClick={onClear}>Clear</Button>
    </div>
  );
}
