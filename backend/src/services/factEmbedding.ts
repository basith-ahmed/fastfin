import { Prisma } from "@prisma/client";
import { z } from "zod";

import { env } from "../config/env";
import { prisma } from "../config/database";

const embeddingSchema = z.array(z.number().finite()).length(env.EMBEDDING_DIMENSIONS);

const factEmbeddingInputSchema = z.object({
  factId: z.uuid(),
  comparisonText: z.string().min(1),
  embedding: embeddingSchema,
  model: z.string().min(1),
});

export type CreateFactEmbeddingInput = z.input<typeof factEmbeddingInputSchema>;

export async function createFactEmbedding(input: CreateFactEmbeddingInput): Promise<void> {
  const validated = factEmbeddingInputSchema.parse(input);
  const vectorLiteral = `[${validated.embedding.join(",")}]`;

  await prisma.$executeRaw(
    Prisma.sql`
      INSERT INTO "fact_embeddings" (
        "fact_id",
        "comparison_text",
        "embedding",
        "model",
        "dimensions"
      ) VALUES (
        ${validated.factId}::uuid,
        ${validated.comparisonText},
        ${vectorLiteral}::vector,
        ${validated.model},
        ${env.EMBEDDING_DIMENSIONS}
      )
    `,
  );
}
