"use client";

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api/client";
import { isTerminalDocumentStatus } from "@/lib/document-status";

export function useDocument(id: string) {
  return useQuery({
    queryKey: ["document", id],
    queryFn: () => api.document(id),
    refetchInterval: (query) => {
      const status = query.state.data?.data.status;
      return status && isTerminalDocumentStatus(status) ? false : 2_000;
    },
  });
}
