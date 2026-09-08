import {
  GoogleGenAI,
  type EmbedContentParameters,
  type EmbedContentResponse,
} from "@google/genai";
import { z } from "zod";

import { env } from "../config/env";
import { workerLogger } from "../utils/logger";
import type { EmbeddingProvider } from "./types";

const MAX_EMBEDDING_TEXT_LENGTH = 8_000;

const embeddingTextSchema = z
  .string()
  .trim()
  .min(1, "Embedding text must not be empty.")
  .max(MAX_EMBEDDING_TEXT_LENGTH, "Embedding text is too long.");

type GeminiClient = {
  models: {
    embedContent(params: EmbedContentParameters): Promise<EmbedContentResponse>;
  };
};

type GeminiEmbeddingDependencies = {
  client?: GeminiClient;
  model?: string;
  dimensions?: number;
};

let client: GoogleGenAI | undefined;

function getGeminiClient(): GoogleGenAI {
  if (!env.GEMINI_API_KEY) {
    throw new Error("GEMINI_API_KEY is required for embedding requests.");
  }
  client ??= new GoogleGenAI({ apiKey: env.GEMINI_API_KEY });
  return client;
}

export function validateEmbedding(vector: unknown, dimensions: number): number[] {
  if (!Number.isInteger(dimensions) || dimensions <= 0) {
    throw new Error("Embedding dimensions must be a positive integer.");
  }
  return z
    .array(z.number().finite())
    .length(dimensions, `Embedding must contain exactly ${dimensions} finite numbers.`)
    .parse(vector);
}

export class GeminiEmbeddingProvider implements EmbeddingProvider {
  readonly model: string;
  readonly dimensions: number;
  private readonly client: GeminiClient;

  constructor(dependencies: GeminiEmbeddingDependencies = {}) {
    this.model = dependencies.model ?? env.EMBEDDING_MODEL;
    this.dimensions = dependencies.dimensions ?? env.EMBEDDING_DIMENSIONS;
    this.client = dependencies.client ?? getGeminiClient();
  }

  async embed(text: string): Promise<number[]> {
    const validatedText = embeddingTextSchema.parse(text);
    try {
      const response = await this.client.models.embedContent({
        model: this.model,
        contents: validatedText,
        config: {
          outputDimensionality: this.dimensions,
          taskType: "RETRIEVAL_DOCUMENT",
        },
      });
      const vector = response.embeddings?.[0]?.values;
      return validateEmbedding(vector, this.dimensions);
    } catch (error: unknown) {
      workerLogger.error(
        { err: error, model: this.model },
        `Gemini embedding request failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }
  }
}
