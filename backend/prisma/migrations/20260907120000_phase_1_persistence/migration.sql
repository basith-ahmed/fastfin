-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- Required PostgreSQL extensions
CREATE EXTENSION IF NOT EXISTS "vector";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateEnum
CREATE TYPE "DocumentStatus" AS ENUM ('UPLOADED', 'QUEUED', 'PARSING', 'EXTRACTING', 'NORMALIZING', 'RESOLVING_ENTITIES', 'EMBEDDING', 'MATCHING', 'REASONING', 'COMPLETED', 'COMPLETED_WITH_ISSUES', 'FAILED');

-- CreateEnum
CREATE TYPE "EntityType" AS ENUM ('PERSON', 'ORGANIZATION', 'LOCATION', 'PRODUCT', 'OTHER');

-- CreateEnum
CREATE TYPE "ValueType" AS ENUM ('TEXT', 'NUMBER', 'MONEY', 'PERCENTAGE', 'DATE', 'BOOLEAN', 'PERSON', 'ORGANIZATION', 'LOCATION', 'QUANTITY', 'DURATION', 'OTHER');

-- CreateEnum
CREATE TYPE "ExtractionMethod" AS ENUM ('LLM', 'DETERMINISTIC', 'HYBRID');

-- CreateEnum
CREATE TYPE "VerificationMethod" AS ENUM ('EXACT', 'NORMALIZED', 'FUZZY');

-- CreateEnum
CREATE TYPE "RelationshipType" AS ENUM ('CORROBORATES', 'CONTRADICTS', 'RECONCILABLE', 'UNCERTAIN');

-- CreateEnum
CREATE TYPE "DecisionMethod" AS ENUM ('RULE', 'LLM', 'HYBRID');

-- CreateEnum
CREATE TYPE "IssueType" AS ENUM ('PDF_PARSE_FAILURE', 'EMPTY_PAGE', 'OCR_REQUIRED', 'LLM_REQUEST_FAILURE', 'LLM_INVALID_OUTPUT', 'LOW_FACT_CONFIDENCE', 'EVIDENCE_NOT_FOUND', 'EVIDENCE_AMBIGUOUS', 'NORMALIZATION_FAILURE', 'AMBIGUOUS_ENTITY', 'EMBEDDING_FAILURE', 'RELATIONSHIP_UNCERTAIN', 'RELATIONSHIP_REASONING_FAILURE', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "IssueSeverity" AS ENUM ('INFO', 'WARNING', 'ERROR');

-- CreateTable
CREATE TABLE "documents" (
    "id" UUID NOT NULL,
    "filename" TEXT NOT NULL,
    "original_filename" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "sha256" TEXT NOT NULL,
    "file_path" TEXT NOT NULL,
    "file_size_bytes" BIGINT NOT NULL,
    "page_count" INTEGER,
    "status" "DocumentStatus" NOT NULL DEFAULT 'UPLOADED',
    "processing_started_at" TIMESTAMPTZ(3),
    "processing_completed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_pages" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "page_number" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "text_items" JSONB NOT NULL,
    "width" DOUBLE PRECISION NOT NULL,
    "height" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "chunks" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "chunk_index" INTEGER NOT NULL,
    "page_start" INTEGER NOT NULL,
    "page_end" INTEGER NOT NULL,
    "text" TEXT NOT NULL,
    "token_count" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "chunks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entities" (
    "id" UUID NOT NULL,
    "canonical_name" TEXT NOT NULL,
    "normalized_name" TEXT NOT NULL,
    "entity_type" "EntityType" NOT NULL,
    "metadata" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "entities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "entity_aliases" (
    "id" UUID NOT NULL,
    "entity_id" UUID NOT NULL,
    "alias" TEXT NOT NULL,
    "normalized_alias" TEXT NOT NULL,
    "document_id" UUID,
    "confidence" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "entity_aliases_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "facts" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "chunk_id" UUID NOT NULL,
    "entity_id" UUID,
    "subject_raw" TEXT NOT NULL,
    "subject_normalized" TEXT NOT NULL,
    "predicate_raw" TEXT NOT NULL,
    "predicate_canonical" TEXT NOT NULL,
    "value_raw" TEXT NOT NULL,
    "value_type" "ValueType" NOT NULL,
    "normalized_text" TEXT,
    "normalized_number" DECIMAL(38,12),
    "normalized_date" TIMESTAMPTZ(3),
    "unit" TEXT,
    "currency" TEXT,
    "qualifiers" JSONB NOT NULL,
    "normalized_context" JSONB NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "extraction_method" "ExtractionMethod" NOT NULL,
    "fact_signature" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "facts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "evidence" (
    "id" UUID NOT NULL,
    "fact_id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "page_number" INTEGER NOT NULL,
    "quote" TEXT NOT NULL,
    "normalized_quote" TEXT NOT NULL,
    "context_before" TEXT NOT NULL,
    "context_after" TEXT NOT NULL,
    "start_char" INTEGER,
    "end_char" INTEGER,
    "bounding_boxes" JSONB,
    "verification_method" "VerificationMethod" NOT NULL,
    "verification_score" DOUBLE PRECISION NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "evidence_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "fact_embeddings" (
    "fact_id" UUID NOT NULL,
    "comparison_text" TEXT NOT NULL,
    "embedding" vector(768) NOT NULL,
    "model" TEXT NOT NULL,
    "dimensions" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "fact_embeddings_pkey" PRIMARY KEY ("fact_id")
);

-- CreateTable
CREATE TABLE "fact_relationships" (
    "id" UUID NOT NULL,
    "left_fact_id" UUID NOT NULL,
    "right_fact_id" UUID NOT NULL,
    "relationship_type" "RelationshipType" NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL,
    "explanation" TEXT NOT NULL,
    "context_comparison" JSONB NOT NULL,
    "rule_signals" JSONB NOT NULL,
    "decision_method" "DecisionMethod" NOT NULL,
    "model_name" TEXT,
    "prompt_version" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "fact_relationships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processing_issues" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "chunk_id" UUID,
    "fact_id" UUID,
    "stage" TEXT NOT NULL,
    "issue_type" "IssueType" NOT NULL,
    "severity" "IssueSeverity" NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" JSONB NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "processing_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "processing_jobs" (
    "id" UUID NOT NULL,
    "document_id" UUID NOT NULL,
    "bull_job_id" TEXT,
    "stage" TEXT NOT NULL,
    "progress" INTEGER NOT NULL DEFAULT 0,
    "attempt" INTEGER NOT NULL DEFAULT 0,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "metrics" JSONB NOT NULL,
    "started_at" TIMESTAMPTZ(3),
    "finished_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "processing_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "model_invocations" (
    "id" UUID NOT NULL,
    "provider" TEXT NOT NULL,
    "model" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "document_id" UUID,
    "input_hash" TEXT NOT NULL,
    "prompt_version" TEXT NOT NULL,
    "input_tokens" INTEGER,
    "output_tokens" INTEGER,
    "latency_ms" INTEGER NOT NULL,
    "success" BOOLEAN NOT NULL,
    "error" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "model_invocations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "documents_sha256_key" ON "documents"("sha256");

-- CreateIndex
CREATE UNIQUE INDEX "document_pages_document_id_page_number_key" ON "document_pages"("document_id", "page_number");

-- CreateIndex
CREATE INDEX "chunks_document_id_idx" ON "chunks"("document_id");

-- CreateIndex
CREATE UNIQUE INDEX "chunks_document_id_chunk_index_key" ON "chunks"("document_id", "chunk_index");

-- CreateIndex
CREATE INDEX "entities_normalized_name_idx" ON "entities"("normalized_name");

-- CreateIndex
CREATE INDEX "entity_aliases_entity_id_idx" ON "entity_aliases"("entity_id");

-- CreateIndex
CREATE INDEX "entity_aliases_normalized_alias_idx" ON "entity_aliases"("normalized_alias");

-- CreateIndex
CREATE INDEX "facts_document_id_idx" ON "facts"("document_id");

-- CreateIndex
CREATE INDEX "facts_entity_id_idx" ON "facts"("entity_id");

-- CreateIndex
CREATE INDEX "facts_predicate_canonical_idx" ON "facts"("predicate_canonical");

-- CreateIndex
CREATE INDEX "facts_value_type_idx" ON "facts"("value_type");

-- CreateIndex
CREATE INDEX "facts_fact_signature_idx" ON "facts"("fact_signature");

-- CreateIndex
CREATE INDEX "evidence_fact_id_idx" ON "evidence"("fact_id");

-- CreateIndex
CREATE INDEX "evidence_document_id_idx" ON "evidence"("document_id");

-- CreateIndex
CREATE INDEX "evidence_document_id_page_number_idx" ON "evidence"("document_id", "page_number");

-- CreateIndex
CREATE INDEX "fact_relationships_left_fact_id_idx" ON "fact_relationships"("left_fact_id");

-- CreateIndex
CREATE INDEX "fact_relationships_right_fact_id_idx" ON "fact_relationships"("right_fact_id");

-- CreateIndex
CREATE UNIQUE INDEX "fact_relationships_left_fact_id_right_fact_id_key" ON "fact_relationships"("left_fact_id", "right_fact_id");

-- CreateIndex
CREATE INDEX "processing_issues_document_id_idx" ON "processing_issues"("document_id");

-- CreateIndex
CREATE INDEX "processing_issues_chunk_id_idx" ON "processing_issues"("chunk_id");

-- CreateIndex
CREATE INDEX "processing_issues_fact_id_idx" ON "processing_issues"("fact_id");

-- CreateIndex
CREATE INDEX "processing_jobs_document_id_idx" ON "processing_jobs"("document_id");

-- CreateIndex
CREATE INDEX "processing_jobs_bull_job_id_idx" ON "processing_jobs"("bull_job_id");

-- CreateIndex
CREATE INDEX "model_invocations_document_id_idx" ON "model_invocations"("document_id");

-- CreateIndex
CREATE INDEX "model_invocations_provider_model_idx" ON "model_invocations"("provider", "model");

-- AddForeignKey
ALTER TABLE "document_pages" ADD CONSTRAINT "document_pages_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "chunks" ADD CONSTRAINT "chunks_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_aliases" ADD CONSTRAINT "entity_aliases_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "entity_aliases" ADD CONSTRAINT "entity_aliases_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facts" ADD CONSTRAINT "facts_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facts" ADD CONSTRAINT "facts_chunk_id_fkey" FOREIGN KEY ("chunk_id") REFERENCES "chunks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "facts" ADD CONSTRAINT "facts_entity_id_fkey" FOREIGN KEY ("entity_id") REFERENCES "entities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_fact_id_fkey" FOREIGN KEY ("fact_id") REFERENCES "facts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "evidence" ADD CONSTRAINT "evidence_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fact_embeddings" ADD CONSTRAINT "fact_embeddings_fact_id_fkey" FOREIGN KEY ("fact_id") REFERENCES "facts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fact_relationships" ADD CONSTRAINT "fact_relationships_left_fact_id_fkey" FOREIGN KEY ("left_fact_id") REFERENCES "facts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "fact_relationships" ADD CONSTRAINT "fact_relationships_right_fact_id_fkey" FOREIGN KEY ("right_fact_id") REFERENCES "facts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_issues" ADD CONSTRAINT "processing_issues_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_issues" ADD CONSTRAINT "processing_issues_chunk_id_fkey" FOREIGN KEY ("chunk_id") REFERENCES "chunks"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_issues" ADD CONSTRAINT "processing_issues_fact_id_fkey" FOREIGN KEY ("fact_id") REFERENCES "facts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "processing_jobs" ADD CONSTRAINT "processing_jobs_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "model_invocations" ADD CONSTRAINT "model_invocations_document_id_fkey" FOREIGN KEY ("document_id") REFERENCES "documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Domain constraints that Prisma cannot express in the schema
ALTER TABLE "documents"
    ADD CONSTRAINT "documents_file_size_bytes_check" CHECK ("file_size_bytes" >= 0),
    ADD CONSTRAINT "documents_page_count_check" CHECK ("page_count" IS NULL OR "page_count" >= 0);

ALTER TABLE "document_pages"
    ADD CONSTRAINT "document_pages_page_number_check" CHECK ("page_number" > 0),
    ADD CONSTRAINT "document_pages_dimensions_check" CHECK ("width" > 0 AND "height" > 0);

ALTER TABLE "chunks"
    ADD CONSTRAINT "chunks_chunk_index_check" CHECK ("chunk_index" >= 0),
    ADD CONSTRAINT "chunks_page_range_check" CHECK ("page_start" > 0 AND "page_end" >= "page_start"),
    ADD CONSTRAINT "chunks_token_count_check" CHECK ("token_count" >= 0);

ALTER TABLE "entity_aliases"
    ADD CONSTRAINT "entity_aliases_confidence_check" CHECK ("confidence" >= 0 AND "confidence" <= 1);

ALTER TABLE "facts"
    ADD CONSTRAINT "facts_confidence_check" CHECK ("confidence" >= 0 AND "confidence" <= 1);

ALTER TABLE "evidence"
    ADD CONSTRAINT "evidence_page_number_check" CHECK ("page_number" > 0),
    ADD CONSTRAINT "evidence_character_range_check" CHECK (
        ("start_char" IS NULL AND "end_char" IS NULL)
        OR ("start_char" >= 0 AND "end_char" >= "start_char")
    ),
    ADD CONSTRAINT "evidence_verification_score_check" CHECK ("verification_score" >= 0 AND "verification_score" <= 1);

ALTER TABLE "fact_embeddings"
    ADD CONSTRAINT "fact_embeddings_dimensions_check" CHECK ("dimensions" = 768);

ALTER TABLE "fact_relationships"
    ADD CONSTRAINT "fact_relationships_ordered_pair_check" CHECK ("left_fact_id" < "right_fact_id"),
    ADD CONSTRAINT "fact_relationships_confidence_check" CHECK ("confidence" >= 0 AND "confidence" <= 1);

ALTER TABLE "processing_jobs"
    ADD CONSTRAINT "processing_jobs_progress_check" CHECK ("progress" >= 0 AND "progress" <= 100),
    ADD CONSTRAINT "processing_jobs_attempt_check" CHECK ("attempt" >= 0);

ALTER TABLE "model_invocations"
    ADD CONSTRAINT "model_invocations_token_counts_check" CHECK (
        ("input_tokens" IS NULL OR "input_tokens" >= 0)
        AND ("output_tokens" IS NULL OR "output_tokens" >= 0)
    ),
    ADD CONSTRAINT "model_invocations_latency_check" CHECK ("latency_ms" >= 0);
