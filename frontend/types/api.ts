export type Pagination = {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
};

export type CollectionResponse<T> = {
  data: T[];
  pagination: Pagination;
};

export type KnowledgeSummary = {
  documents: number;
  facts: number;
  entities: number;
  relationships: {
    corroborates: number;
    contradicts: number;
    reconcilable: number;
    uncertain: number;
  };
  issues: number;
};
