import path from "node:path";

import dotenv from "dotenv";
import { z } from "zod";

dotenv.config({ path: path.resolve(__dirname, "../../../.env"), quiet: true });

const optionalNumber = <T extends number>(schema: z.ZodType<T, number>, defaultValue: T) =>
  z.preprocess(
    (value) => (value === "" || value === undefined ? undefined : value),
    z.coerce.number().default(defaultValue).pipe(schema),
  );

const serviceUrl = (protocol: string, label: string) =>
  z
    .url(`${label} must be a valid URL.`)
    .refine((value) => value.startsWith(`${protocol}//`), {
      message: `${label} must use the ${protocol} protocol.`,
    });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  BACKEND_PORT: optionalNumber(z.number().int().positive().max(65_535), 4000),
  FRONTEND_URL: z.url("FRONTEND_URL must be a valid URL.").default("http://localhost:3000"),

  DATABASE_URL: serviceUrl("postgresql:", "DATABASE_URL").default(
    "postgresql://FastFin:FastFin@localhost:5432/FastFin",
  ),
  REDIS_URL: serviceUrl("redis:", "REDIS_URL").default("redis://localhost:6379"),

  PDF_STORAGE_PATH: z.string().trim().min(1).default("./storage/pdfs"),
  PDF_TEMP_PATH: z.string().trim().min(1).default("./storage/temp"),
  MAX_UPLOAD_MB: optionalNumber(z.number().positive(), 50),

  OPENAI_API_KEY: z.string().default(""),
  OPENAI_BASE_URL: z.string().trim().min(1).default("https://openrouter.ai/api/v1"),
  LLM_MODEL: z.string().trim().min(1).default("openai/gpt-4o-mini"),

  GEMINI_API_KEY: z.string().default(""),
  EMBEDDING_MODEL: z.string().trim().min(1).default("gemini-embedding-2"),
  EMBEDDING_DIMENSIONS: optionalNumber(z.literal(768), 768),

  LLM_MAX_CONCURRENCY: optionalNumber(z.number().int().positive(), 3),
  LLM_REQUEST_TIMEOUT_MS: optionalNumber(z.number().int().positive(), 60_000),

  FACT_MIN_CONFIDENCE: optionalNumber(z.number().min(0).max(1), 0.65),
  EVIDENCE_FUZZY_THRESHOLD: optionalNumber(z.number().min(0).max(1), 0.92),
  ENTITY_AUTO_MATCH_THRESHOLD: optionalNumber(z.number().min(0).max(1), 0.94),
  CANDIDATE_VECTOR_THRESHOLD: optionalNumber(z.number().min(0).max(1), 0.62),
  CANDIDATE_TOP_K: optionalNumber(z.number().int().positive(), 10),
  RELATION_MIN_CONFIDENCE: optionalNumber(z.number().min(0).max(1), 0.7),
});

export type Environment = z.infer<typeof envSchema>;

export function parseEnv(source: Record<string, string | undefined>): Environment {
  const result = envSchema.safeParse(source);

  if (!result.success) {
    const details = z.prettifyError(result.error);
    throw new Error(`Invalid environment configuration:\n${details}`);
  }

  return result.data;
}

export const env = parseEnv(process.env);
