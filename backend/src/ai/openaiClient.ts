import OpenAI from "openai";

import { env } from "../config/env";

let client: OpenAI | undefined;

export function getOpenAIClient(): OpenAI {
  if (!env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for generative AI requests.");
  }

  client ??= new OpenAI({
    apiKey: env.OPENAI_API_KEY,
    baseURL: env.OPENAI_BASE_URL,
    timeout: env.LLM_REQUEST_TIMEOUT_MS,
    maxRetries: 0,
  });
  return client;
}
