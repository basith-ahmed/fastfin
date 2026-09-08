import { inputClassName } from "@/components/common/form-controls";
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
  onDocumentChange,
  onSeverityChange,
  onIssueTypeChange,
}: {
  documents: DocumentRecord[];
  documentId: string;
  severity: string;
  issueType: string;
  onDocumentChange: (value: string) => void;
  onSeverityChange: (value: string) => void;
  onIssueTypeChange: (value: string) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-3">
      <select
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
      </select>
      <select
        aria-label="Filter by severity"
        value={severity}
        onChange={(event) => onSeverityChange(event.target.value)}
        className={inputClassName}
      >
        <option value="">All severities</option>
        <option value="INFO">Info</option>
        <option value="WARNING">Warning</option>
        <option value="ERROR">Error</option>
      </select>
      <select
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
      </select>
    </div>
  );
}
