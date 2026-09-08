"use client";

import { useQueries, useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api/client";

export type DocumentFilters = {
  page?: number;
  pageSize?: number;
  status?: string;
};

export function useDocuments(filters: DocumentFilters = {}) {
  return useQuery({
    queryKey: ["documents", filters],
    queryFn: () => api.documents(filters),
  });
}

export function useDocumentDetails(ids: string[]) {
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: ["document", id],
      queryFn: () => api.document(id),
      staleTime: 15_000,
    })),
  });
}
