import type {
  CollectionResponse,
  DocumentRecord,
  Fact,
  KnowledgeSummary,
  ProcessingIssue,
  Relationship,
  RelationshipDetail,
} from "@/types";

export const API_BASE_URL = (
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"
).replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type ErrorPayload = { error?: { code?: string; message?: string } };

export async function apiRequest<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: { Accept: "application/json", ...init?.headers },
    });
  } catch {
    throw new ApiError(
      "FastFin cannot reach the backend. Check that the API is running.",
      "OFFLINE",
      0,
    );
  }

  if (!response.ok) {
    let payload: ErrorPayload = {};
    try {
      payload = (await response.json()) as ErrorPayload;
    } catch {
      // The status text is used when an upstream error is not JSON.
    }
    throw new ApiError(
      payload.error?.message ?? response.statusText ?? "The request failed.",
      payload.error?.code ?? "REQUEST_FAILED",
      response.status,
    );
  }

  return (await response.json()) as T;
}

function queryString(
  values: Record<string, string | number | undefined>,
): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(values)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const query = params.toString();
  return query ? `?${query}` : "";
}

export const api = {
  summary: () =>
    apiRequest<{ data: KnowledgeSummary }>("/api/knowledge/summary"),
  documents: (
    filters: { page?: number; pageSize?: number; status?: string } = {},
  ) =>
    apiRequest<CollectionResponse<DocumentRecord>>(
      `/api/documents${queryString(filters)}`,
    ),
  document: (id: string) =>
    apiRequest<{ data: DocumentRecord }>(`/api/documents/${id}`),
  upload: async (file: File) => {
    const body = new FormData();
    body.append("file", file);
    return apiRequest<{ data: DocumentRecord; duplicate: boolean }>(
      "/api/documents/upload",
      {
        method: "POST",
        body,
      },
    );
  },
  facts: (filters: Record<string, string | number | undefined> = {}) =>
    apiRequest<CollectionResponse<Fact>>(`/api/facts${queryString(filters)}`),
  fact: (id: string) => apiRequest<{ data: Fact }>(`/api/facts/${id}`),
  relationships: (filters: Record<string, string | number | undefined> = {}) =>
    apiRequest<CollectionResponse<Relationship>>(
      `/api/relationships${queryString(filters)}`,
    ),
  relationship: (id: string) =>
    apiRequest<{ data: RelationshipDetail }>(`/api/relationships/${id}`),
  issues: (filters: Record<string, string | number | undefined> = {}) =>
    apiRequest<CollectionResponse<ProcessingIssue>>(
      `/api/issues${queryString(filters)}`,
    ),
  issue: (id: string) =>
    apiRequest<{ data: ProcessingIssue }>(`/api/issues/${id}`),
  documentFacts: (
    id: string,
    filters: Record<string, string | number | undefined> = {},
  ) =>
    apiRequest<CollectionResponse<Fact>>(
      `/api/documents/${id}/facts${queryString(filters)}`,
    ),
  documentRelationships: (
    id: string,
    filters: Record<string, string | number | undefined> = {},
  ) =>
    apiRequest<CollectionResponse<Relationship>>(
      `/api/documents/${id}/relationships${queryString(filters)}`,
    ),
  documentIssues: (
    id: string,
    filters: Record<string, string | number | undefined> = {},
  ) =>
    apiRequest<CollectionResponse<ProcessingIssue>>(
      `/api/documents/${id}/issues${queryString(filters)}`,
    ),
  pdfUrl: (id: string) => `${API_BASE_URL}/api/documents/${id}/file`,
};
