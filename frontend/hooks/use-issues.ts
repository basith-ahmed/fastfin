"use client";

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api/client";

type Filters = Record<string, string | number | undefined>;

export function useIssues(filters: Filters = {}) {
  return useQuery({
    queryKey: ["issues", filters],
    queryFn: () => api.issues(filters),
  });
}

export function useDocumentIssues(
  documentId: string,
  filters: Filters = {},
  polling = false,
) {
  return useQuery({
    queryKey: ["document-issues", documentId, filters],
    queryFn: () => api.documentIssues(documentId, filters),
    refetchInterval: polling ? 2_000 : false,
  });
}

export function useIssue(id: string | null) {
  return useQuery({
    queryKey: ["issue", id],
    queryFn: () => {
      if (!id) throw new Error("No issue selected.");
      return api.issue(id);
    },
    enabled: id !== null,
  });
}
