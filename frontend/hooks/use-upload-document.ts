"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";

import { api } from "@/lib/api/client";

export function useUploadDocument() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: api.upload,
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["documents"] }),
        queryClient.invalidateQueries({ queryKey: ["summary"] }),
      ]);
    },
  });
}
