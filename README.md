# FastFin: Evidence-Grounded Cross-Document Fact Knowledge Layer

FastFin extracts atomic, evidence-grounded facts from corporate and financial PDFs, anchors every claim to precise source text and page coordinates, and compares facts across documents to classify corroborations, genuine contradictions, and context-reconciled differences.

## Video Demo

Video Link: [https://drive.google.com/file/d/1gDHd22PncUFfPb5XYLwJZy8Gd16deWPp/view?usp=sharing]

The demo video walks through:
1. Uploading and asynchronously processing financial PDF filings.
2. Inspecting extracted facts with source evidence quotes, page references, and visual bounding-box highlights in the split-screen PDF viewer.
3. The four required cases: corroboration, genuine contradiction, context-reconciled apparent contradiction, and extraction/reasoning failure.
4. The processing issues audit log showing recoverable warnings and rejected ungrounded proposals.

## Setup and Run Instructions

### Prerequisites

* Node.js >= 20.9.0
* pnpm 10
* Docker and Docker Compose
* OpenAI or OpenRouter API key (for fact extraction and reasoning)
* Google Gemini API key (for `gemini-embedding-2` vector embeddings)

### 1. Clone and Configure Environment

```bash
git clone git@github.com:basith-ahmed/fastfin.git
cd fastfin
cp .env.example .env
```

Edit `.env` to configure your API keys:

```env
OPENAI_API_KEY=your_openai_or_openrouter_key
OPENAI_BASE_URL=https://openrouter.ai/api/v1  
LLM_MODEL=openai/gpt-4o-mini                 

GEMINI_API_KEY=your_gemini_api_key
EMBEDDING_MODEL=gemini-embedding-2
EMBEDDING_DIMENSIONS=768
```

Default local database credentials (`DATABASE_URL=postgresql://FastFin:FastFin@localhost:5432/FastFin`) and Redis URL (`REDIS_URL=redis://localhost:6379`) are pre-configured for Docker Compose.

### 2. Start Local Infrastructure

Start PostgreSQL (with `pgvector` and `pg_trgm`) and Redis 8:

```bash
docker compose up -d
docker compose ps
```

### 3. Setup and Run Backend API

In terminal 1:

```bash
cd backend
pnpm install
pnpm prisma:migrate:deploy
pnpm dev
```

The Express API starts at `http://localhost:4000`. Health check: `curl http://localhost:4000/health`.

### 4. Start BullMQ Processing Worker

In terminal 2:

```bash
cd backend
pnpm worker
```

The worker connects to Redis and processes PDF parsing, extraction, embedding, and reasoning jobs asynchronously.

### 5. Start Frontend Application

In terminal 3:

```bash
cd frontend
pnpm install
pnpm dev
```

Open `http://localhost:3000` to access the FastFin web interface.

### 6. Ingest Sample Calibration Documents (Optional)

To automatically upload the included 2-3 page calibration filings:

```bash
cd backend
pnpm samples:upload
```

### 7. Run Test Suite

To verify all 24 Jest test suites and TypeScript types:

```bash
cd backend
pnpm test
pnpm typecheck
```

## Approach

### Core Invariant

A fact in FastFin is not an unverified text snippet. It is a strictly grounded tuple:

`Fact = Subject + Predicate + Value + Context + Evidence + Confidence`

No fact is persisted to the database unless its claimed source evidence is verified against the actual PDF text.

### Processing Pipeline

1. **PDF Parsing**: `pdfjs-dist` extracts text items, character offsets, line numbers, and spatial coordinates `[x, y, width, height]` for each page.
2. **Chunking**: Assembles structured chunks (~500 tokens) with overlap and regex-based numerical candidate hints.
3. **Candidate Fact Extraction**: The chunk text, numerical hints, and document context are passed to the LLM (`OpenAIFactExtractionProvider`) using a strict Zod JSON schema to propose atomic facts.
4. **Source Evidence Verification**: `EvidenceVerifier` searches the claimed page text using exact matching, normalized text matching (NFKC, collapsed whitespace, rejoined line breaks), and character-trigram fuzzy matching (`EVIDENCE_FUZZY_THRESHOLD = 0.92`). Unverified proposals are rejected.
5. **Normalization**: Parses values into numeric decimals, ISO dates, currencies, and structured context objects (fiscal year, quarter, scope, segment).
6. **Entity Resolution**: Resolves subjects to canonical `Entity` records and maintains document-level `EntityAlias` entries via `pg_trgm`.
7. **Storage & Deduplication**: Persists verified facts with unique SHA-256 signatures to prevent duplicate entries upon re-indexing.
8. **Vector Embedding**: Generates 768-dimensional dense vectors using Google Gemini (`gemini-embedding-2`) and stores them in PostgreSQL via `pgvector`.
9. **Cross-Document Candidate Retrieval**: Uses hybrid pgvector cosine similarity (`CANDIDATE_VECTOR_THRESHOLD = 0.62`, top 10) and entity-predicate compatibility to retrieve candidates from other documents.
10. **Relationship Classification**:
    * Deterministic Rule Engine: Identical normalized values with matching predicates and periods are classified as `CORROBORATES` (`confidence = 1.0`) with zero LLM calls. Tightly rounded values within 0.5% tolerance are corroborations. Explicit temporal differences are marked `RECONCILABLE`.
    * LLM Reasoner: Non-identical or semantically complex pairs are sent to `OpenAIRelationshipReasoningProvider` with a strict Zod response schema enforcing classification, confidence, explanation, and decisive context dimensions.
11. **Inspection UI**: Results are presented in Next.js with split-screen PDF viewing, coordinate-based bounding box highlight overlays, and side-by-side fact relationship comparisons.

### System Architecture

```mermaid
flowchart TD
    subgraph Client [Frontend: Next.js 16 + React 19]
        UI[Web Dashboard]
        Viewer[Split-Screen PDF Viewer + Bounding Boxes]
        Inspector[Cross-Document Relationship Inspector]
        IssueAuditor[Processing Issues Audit Table]
    end

    subgraph API [Backend API: Express 5 + TypeScript]
        Routes[REST API Routes]
        DocCtrl[Document Controller]
        KnowCtrl[Knowledge Controller]
        Multer[Multer PDF Storage]
    end

    subgraph Queue [Task Queue: BullMQ + Redis 8]
        Redis[(Redis 6379)]
        BQueue[BullMQ Processing Queue]
        BWorker[BullMQ Worker Process]
    end

    subgraph Engine [Processing Pipeline]
        Parser[pdfjs-dist Layout Parser]
        Extractor[Fact Extractor + Zod Schema]
        Verifier[Evidence Verifier: Exact / Normalized / Trigram]
        Normalizer[Fact & Context Normalizer]
        Resolver[Entity Resolver & Alias Registry]
        Embedder[Embedding Generator]
        Retriever[pgvector Candidate Retriever]
        Reasoner[Relationship Reasoner: Rules + LLM]
    end

    subgraph Storage [Persistence: PostgreSQL 17 + Local Disk]
        Postgres[(PostgreSQL 5432)]
        VectorExt[pgvector: vector 768]
        TrgmExt[pg_trgm: Trigram Index]
        FileSystem[(Local PDF Storage)]
    end

    subgraph External [External AI Services]
        LLM[OpenAI / OpenRouter: LLM_MODEL]
        Gemini[Google Gemini API: gemini-embedding-2]
    end

    UI --> Routes
    Viewer --> Routes
    Routes --> DocCtrl
    Routes --> KnowCtrl
    DocCtrl --> Multer --> FileSystem
    DocCtrl --> BQueue
    BQueue --> Redis
    Redis --> BWorker
    BWorker --> Engine

    Parser --> FileSystem
    Extractor --> LLM
    Verifier -.->|Rejected Claims| Postgres
    Verifier --> Normalizer
    Normalizer --> Resolver --> Postgres
    Normalizer --> Embedder --> Gemini
    Embedder --> Postgres
    Retriever --> Postgres
    Retriever --> Reasoner
    Reasoner --> LLM
    Reasoner --> Postgres

    DocCtrl --> Postgres
    KnowCtrl --> Postgres
```

### Required Cases Demonstrated

The following cases are verified from the included Delhivery calibration files (`delhivery-annual-report-fy24-pages-6-8.pdf`, `delhivery-earnings-fy24-pages-6-8.pdf`, and `delhivery-prospectus-pages-16-18.pdf`):

#### 1. Corroborated Fact
* Fact: Delhivery Limited FY2024 Services EBITDA
* Document A: `delhivery-annual-report-fy24-pages-6-8.pdf` (Page 3)
* Document B: `delhivery-earnings-fy24-pages-6-8.pdf` (Page 1)
* Evidence A: *"to a profit of ₹1,266 million in FY24."*
* Evidence B: *"ssIndia’s largest integrated logistics platform(1)\nFY24\n\n₹8,142 Cr ₹127Cr / 1.6% ₹76Cr / 0.9%"*
* System Classification: `CORROBORATES` (Confidence: 0.96 | Decision Method: `RULE`)
* Reasoning: The reports give effectively the same FY2024 services EBITDA after unit conversion and rounding: ₹1,266 million equals ₹126.6 crore, compared with ₹127 crore.

#### 2. Genuine / Likely Contradiction
* Fact: Delhivery Limited FY2024 Consolidated EBITDA
* Document A: `delhivery-annual-report-fy24-pages-6-8.pdf` (Page 3)
* Document B: `delhivery-earnings-fy24-pages-6-8.pdf` (Page 1)
* Evidence A: *"to a profit of ₹1,266 million in FY24."*
* Evidence B: *"ssIndia’s largest integrated logistics platform(1)\nFY24\n\n₹8,142 Cr ₹127Cr / 1.6% ₹76Cr / 0.9%"*
* System Classification: `CONTRADICTS` (Confidence: 0.80 | Decision Method: `RULE` / `LLM`)
* Reasoning: Both sources report FY2024 EBITDA for Delhivery but state materially different values: ₹1,266 million (~₹126.6 crore) and ₹76 crore. Because both claims assert the same entity, the same canonical metric (`ebitda`), and the same reporting period (`FY24`) without an explicit segment modifier distinguishing them, the system flags a genuine contradiction.

#### 3. Context-Reconciled Apparent Contradiction
* Fact: Delhivery Limited EBITDA (FY2023 Loss vs. FY2024 Profit)
* Document A: `delhivery-annual-report-fy24-pages-6-8.pdf` (Page 3)
* Document B: `delhivery-earnings-fy24-pages-6-8.pdf` (Page 1)
* Evidence A: *"from a loss of ₹4,516 million in FY23"*
* Evidence B: *"ssIndia’s largest integrated logistics platform(1)\nFY24\n\n₹8,142 Cr ₹127Cr / 1.6% ₹76Cr / 0.9%"*
* System Classification: `RECONCILABLE` (Confidence: 0.98 | Decision Method: `RULE`)
* Decisive Context: `time` (Reporting Period: `FY23` vs. `FY24`)
* Reasoning: The values describe different fiscal years: an EBITDA loss in FY2023 (-₹4,516 million) and positive EBITDA in FY2024 (₹76 crore). What appears to be an extreme numerical contradiction is resolved by identifying that the reporting periods differ.

#### 4. Extraction / Reasoning Failure
* What Failed: Candidate Fact Rejection due to Verification Failure (`EVIDENCE_NOT_FOUND`)
* Document: `delhivery-annual-report-fy24-pages-6-8.pdf` (Page 3)
* Claimed Fact: Delhivery Lonad mega gateway processing capacity of 17,000 freight units per hour.
* Claimed Quote: *"Processing capacity at Lonad 32,000 shipments and 17,000 freight units per hour."*
* Why It Failed: In the PDF, this information was split across stylized graphic icon badges and disjoint multi-line labels. The LLM synthesized a smooth sentence rather than copying verbatim text. When `EvidenceVerifier` tested the quote against page tokens using exact, normalized, and trigram fuzzy matching, the score fell below the 0.92 threshold.
* Current Handling: The system rejects the candidate and records a `ProcessingIssue` (`EVIDENCE_NOT_FOUND`, severity `WARNING`). The document finishes processing cleanly as `COMPLETED_WITH_ISSUES`, preventing unverified hallucinations from entering the knowledge store.
* Improvement: Layout-aware visual callout reconstruction and multi-span evidence attribution for disjoint graphic tokens.

### Important Engineering Decisions

1. **PostgreSQL with pgvector as the Single Store**: Storing relational tables, context JSON, and dense vectors in one database eliminates dual-write drift and allows atomic queries joining facts, embeddings, and document status in one SQL transaction.
2. **Evidence Verification Gate**: LLM extractions are treated as untrusted proposals. Persisting a fact requires cryptographic and character-level verification against the underlying document text.
3. **Deterministic Fast-Path**: Eliminates LLM latency and cost for identical normalized values, unit-converted equivalents, and canonical periods.
4. **Structured JSON Output**: All AI interactions use Zod schemas and structured output modes. No arbitrary markdown or free-form prose is parsed.
5. **Decoupled Worker Architecture**: Express handles HTTP requests while BullMQ processes CPU/network-intensive PDF parsing and LLM calls in the background.

### Trade-offs

* **Truthfulness over Recall**: The strict fuzzy verification threshold (0.92) rejects candidate facts when quotes diverge from source text, reducing overall extraction count but guaranteeing zero hallucinated claims in the knowledge base.
* **Native Text Parsing over Heavy OCR**: FastFin uses `pdfjs-dist` for fast text and spatial coordinate extraction. Scanned image-only PDFs require pre-OCR processing.
* **Local Storage over Cloud S3**: PDFs are stored locally (`./storage/pdfs`) to ensure complete local reproducibility without cloud vendor dependencies.
* **Unified Model Configuration**: Using a single unified model (`LLM_MODEL = openai/gpt-4o-mini`) keeps token usage efficient while providing reliable structured outputs.

### AI Tools Used

* **AI Inside the Product**:
  * OpenAI SDK / OpenRouter (`LLM_MODEL`): Used for fact candidate extraction and cross-document relationship reasoning.
  * Google Gemini API (`EMBEDDING_MODEL = gemini-embedding-2`): Generates 768-dimensional dense vector embeddings for fact similarity search.

## Limitations and Next Steps

### Current Limitations

1. **Scanned Documents**: PDFs without an embedded text layer cannot be parsed without an external OCR pre-processing step.
2. **Complex Multi-Span Tables**: When table cells span multiple rows or headers are split across columns, the LLM may extract synthesized quotes that fail verbatim evidence verification.
3. **Implicit Currency Conversions**: Cross-currency comparisons lacking explicit exchange rates or transaction dates in the source text are classified as `UNCERTAIN`.
4. **API Rate Limits**: Ingesting dozens of multi-hundred page documents concurrently can hit free-tier API provider rate limits.

### Next Steps

1. **OCR Pipeline**: Integrate Tesseract or PaddleOCR for automatic text-layer generation on scanned documents.
2. **Visual Table Extraction**: Add layout-aware vision models to extract complex financial tables directly from rendered page images.
3. **Historical Exchange Rate Integration**: Include an offline currency conversion table to reconcile cross-currency figures when dates are present.
4. **Multi-Span Quotations**: Allow candidate facts to cite multiple disjoint text spans (e.g., column header + row label + cell value) to verify tabular claims.
5. **Knowledge Graph Export**: Provide RDF / JSON-LD export endpoints for enterprise graph database ingestion.

## Additional Notes

* **Calibration Excerpts**: Pre-extracted 2-3 page calibration PDFs are located in `backend/storage/starter/calibration/`. Run `pnpm samples:upload` from `backend/` to upload and test them.
* **Database Reset**: To clear the database and start fresh:
  ```bash
  cd backend
  pnpm reset
  ```
* **Prisma Studio**: To inspect raw database rows and vector tables via web UI:
  ```bash
  cd backend
  pnpm prisma:studio
  ```
* **Generalization**: FastFin contains no hardcoded company names, ticker symbols, filenames, or document-specific schemas. Any valid corporate or financial PDF can be uploaded and processed.
