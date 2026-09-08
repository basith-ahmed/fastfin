"use client";

import { useQuery } from "@tanstack/react-query";

import { api } from "@/lib/api/client";

export function useSummary() {
  return useQuery({ queryKey: ["summary"], queryFn: api.summary });
}
