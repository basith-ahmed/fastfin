import type { DocumentStatus } from "@/types";

const terminalStatuses = new Set<DocumentStatus>([
  "COMPLETED",
  "COMPLETED_WITH_ISSUES",
  "FAILED",
]);

export function isTerminalDocumentStatus(status: DocumentStatus): boolean {
  return terminalStatuses.has(status);
}
