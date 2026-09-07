-- Prevent concurrent or repeated processing from persisting the same grounded fact twice.
CREATE UNIQUE INDEX "facts_document_id_fact_signature_key"
ON "facts"("document_id", "fact_signature");
