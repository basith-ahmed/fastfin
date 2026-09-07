-- Cosine distance compares semantic direction while raw value magnitude is
-- intentionally excluded from each fact's embedding text.
CREATE INDEX "fact_embeddings_embedding_cosine_idx"
ON "fact_embeddings"
USING hnsw ("embedding" vector_cosine_ops);
