"use client";

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api/client";

type Filters = Record<string, string | number | undefined>;

export function useRelationships(filters: Filters = {}) {
  return useQuery({
    queryKey: ["relationships", filters],
    queryFn: () => api.relationships(filters),
  });
}

export function useDocumentRelationships(
  documentId: string,
  filters: Filters = {},
  polling = false,
) {
  return useQuery({
    queryKey: ["document-relationships", documentId, filters],
    queryFn: () => api.documentRelationships(documentId, filters),
    refetchInterval: polling ? 2_000 : false,
  });
}

export function useRelationship(id: string) {
  return useQuery({
    queryKey: ["relationship", id],
    queryFn: () => api.relationship(id),
  });
}
