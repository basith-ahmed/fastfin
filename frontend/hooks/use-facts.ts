"use client";

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api/client";

type Filters = Record<string, string | number | undefined>;

export function useFact(id: string | null) {
  return useQuery({
    queryKey: ["fact", id],
    queryFn: () => {
      if (!id) throw new Error("No fact selected.");
      return api.fact(id);
    },
    enabled: id !== null,
  });
}

export function useFacts(filters: Filters = {}) {
  return useQuery({
    queryKey: ["facts", filters],
    queryFn: () => api.facts(filters),
  });
}

export function useDocumentFacts(
  documentId: string,
  filters: Filters = {},
  polling = false,
) {
  return useQuery({
    queryKey: ["document-facts", documentId, filters],
    queryFn: () => api.documentFacts(documentId, filters),
    refetchInterval: polling ? 2_000 : false,
  });
}
