import { setTimeout as sleep } from "node:timers/promises";

import OpenAI, { APIConnectionError, APIConnectionTimeoutError, APIError } from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

import { env } from "../config/env";
import { prisma } from "../config/database";
import { hashTextSha256 } from "../utils/hash";
import { getOpenAIClient } from "./openaiClient";
import {
  buildRelationshipReasoningInput,
  RELATIONSHIP_REASONING_INSTRUCTIONS,
  RELATIONSHIP_REASONING_PROMPT_VERSION,
} from "./prompts/relationshipReasoning.v1";
import {
  relationshipReasoningResponseSchema,
  type RelationshipReasoningInput,
  type RelationshipReasoningProvider,
  type RelationshipReasoningResult,
} from "./types";

const MAX_RETRIES = 2;
const INITIAL_RETRY_DELAY_MS = 250;

type InvocationRecord = {
  provider: string;
  model: string;
  purpose: string;
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

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown OpenAI request failure.";
}

export class OpenAIRelationshipReasoningProvider implements RelationshipReasoningProvider {
  readonly model: string;
  readonly promptVersion = RELATIONSHIP_REASONING_PROMPT_VERSION;
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

  async reasonRelationship(input: RelationshipReasoningInput): Promise<RelationshipReasoningResult> {
    const userInput = buildRelationshipReasoningInput(input);
    const inputHash = hashTextSha256(
      JSON.stringify({
        promptVersion: this.promptVersion,
        model: this.model,
        userInput,
      }),
    );

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
      const startedAt = Date.now();
      try {
        const response = await this.client.responses.parse({
          model: this.model,
          instructions: RELATIONSHIP_REASONING_INSTRUCTIONS,
          input: userInput,
          text: {
            format: zodTextFormat(relationshipReasoningResponseSchema, "relationship_reasoning"),
          },
          store: false,
        });
        const parsed = relationshipReasoningResponseSchema.parse(response.output_parsed);
        await this.recordInvocation({
          provider: "openai",
          model: this.model,
          purpose: "RELATIONSHIP_REASONING",
          inputHash,
          promptVersion: this.promptVersion,
          inputTokens: response.usage?.input_tokens,
          outputTokens: response.usage?.output_tokens,
          latencyMs: Date.now() - startedAt,
          success: true,
        });
        return parsed;
      } catch (error: unknown) {
        await this.recordInvocation({
          provider: "openai",
          model: this.model,
          purpose: "RELATIONSHIP_REASONING",
          inputHash,
          promptVersion: this.promptVersion,
          latencyMs: Date.now() - startedAt,
          success: false,
          error: errorMessage(error),
        });

        if (!isTransientError(error) || attempt === MAX_RETRIES) {
          if (error instanceof z.ZodError) {
            throw new Error("OpenAI returned invalid structured relationship reasoning output.", {
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

    throw new Error("Relationship reasoning retry loop ended unexpectedly.");
  }
}
