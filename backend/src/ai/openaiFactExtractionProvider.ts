import { setTimeout as sleep } from "node:timers/promises";

import OpenAI, { APIConnectionError, APIConnectionTimeoutError, APIError } from "openai";
import { zodResponseFormat } from "openai/helpers/zod";
import { z } from "zod";

import { env } from "../config/env";
import { prisma } from "../config/database";
import { hashTextSha256 } from "../utils/hash";
import { generativeProviderName, getOpenAIClient } from "./openaiClient";
import {
  buildFactExtractionInput,
  FACT_EXTRACTION_INSTRUCTIONS,
  FACT_EXTRACTION_PROMPT_VERSION,
} from "./prompts/factExtraction.v1";
import {
  factExtractionResponseSchema,
  type FactDraft,
  type FactExtractionInput,
  type FactExtractionProvider,
} from "./types";

const MAX_RETRIES = 2;
const INITIAL_RETRY_DELAY_MS = 250;

type InvocationRecord = {
  provider: string;
  model: string;
  purpose: string;
  documentId: string;
  inputHash: string;
  promptVersion: string;
  inputTokens?: number;
  outputTokens?: number;
  latencyMs: number;
  success: boolean;
  error?: string;
};

type ProviderDependencies = {
  client?: OpenAI;
  recordInvocation?: (record: InvocationRecord) => Promise<void>;
  wait?: (milliseconds: number) => Promise<void>;
  random?: () => number;
};

async function recordModelInvocation(record: InvocationRecord): Promise<void> {
  await prisma.modelInvocation.create({
    data: {
      provider: record.provider,
      model: record.model,
      purpose: record.purpose,
      documentId: record.documentId,
      inputHash: record.inputHash,
      promptVersion: record.promptVersion,
      inputTokens: record.inputTokens,
      outputTokens: record.outputTokens,
      latencyMs: record.latencyMs,
      success: record.success,
      error: record.error,
    },
  });
}

function isTransientError(error: unknown): boolean {
  if (error instanceof APIConnectionTimeoutError || error instanceof APIConnectionError) {
    return true;
  }
  if (error instanceof APIError) {
    return error.status === 429 || (typeof error.status === "number" && error.status >= 500);
  }
  if (typeof error === "object" && error !== null) {
    const candidate = error as { status?: unknown; code?: unknown };
    if (candidate.status === 429 || (typeof candidate.status === "number" && candidate.status >= 500)) {
      return true;
    }
    return (
      typeof candidate.code === "string" &&
      ["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EAI_AGAIN"].includes(candidate.code)
    );
  }
  return false;
}

function isStructuredOutputError(error: unknown): boolean {
  return error instanceof SyntaxError || error instanceof z.ZodError;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown OpenAI request failure.";
}

export class OpenAIFactExtractionProvider implements FactExtractionProvider {
  readonly model: string;
  readonly promptVersion = FACT_EXTRACTION_PROMPT_VERSION;
  private readonly client: OpenAI;
  private readonly recordInvocation: (record: InvocationRecord) => Promise<void>;
  private readonly wait: (milliseconds: number) => Promise<void>;
  private readonly random: () => number;

  constructor(dependencies: ProviderDependencies = {}) {
    this.model = env.LLM_MODEL;
    this.client = dependencies.client ?? getOpenAIClient();
    this.recordInvocation = dependencies.recordInvocation ?? recordModelInvocation;
    this.wait = dependencies.wait ?? sleep;
    this.random = dependencies.random ?? Math.random;
  }

  async extractFacts(input: FactExtractionInput): Promise<FactDraft[]> {
    const userInput = buildFactExtractionInput(input);
    const inputHash = hashTextSha256(
      JSON.stringify({
        promptVersion: this.promptVersion,
        model: this.model,
        chunkSha: input.chunkSha,
        userInput,
      }),
    );

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      const startedAt = Date.now();
      try {
        const response = await this.client.chat.completions.parse({
          model: this.model,
          messages: [
            { role: "system", content: FACT_EXTRACTION_INSTRUCTIONS },
            { role: "user", content: userInput },
          ],
          response_format: zodResponseFormat(factExtractionResponseSchema, "fact_extraction"),
        });
        const parsed = factExtractionResponseSchema.parse(response.choices[0]?.message.parsed);
        await this.recordInvocation({
          provider: generativeProviderName,
          model: this.model,
          purpose: "FACT_EXTRACTION",
          documentId: input.documentId,
          inputHash,
          promptVersion: this.promptVersion,
          inputTokens: response.usage?.prompt_tokens,
          outputTokens: response.usage?.completion_tokens,
          latencyMs: Date.now() - startedAt,
          success: true,
        });
        return parsed.facts;
      } catch (error: unknown) {
        await this.recordInvocation({
          provider: generativeProviderName,
          model: this.model,
          purpose: "FACT_EXTRACTION",
          documentId: input.documentId,
          inputHash,
          promptVersion: this.promptVersion,
          latencyMs: Date.now() - startedAt,
          success: false,
          error: errorMessage(error),
        });

        const retryable = isTransientError(error) || isStructuredOutputError(error);
        if (!retryable || attempt === MAX_RETRIES) {
          if (isStructuredOutputError(error)) {
            throw new Error("OpenAI returned invalid structured fact extraction output.", {
              cause: error,
            });
          }
          throw error;
        }

        const exponentialDelay = INITIAL_RETRY_DELAY_MS * 2 ** attempt;
        const jitter = Math.floor(this.random() * INITIAL_RETRY_DELAY_MS);
        await this.wait(exponentialDelay + jitter);
      }
    }

    throw new Error("Fact extraction retry loop ended unexpectedly.");
  }
}
