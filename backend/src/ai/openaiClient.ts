import OpenAI from "openai";

import { env } from "../config/env";

let client: OpenAI | undefined;

// Keep provider metadata dynamic without coupling application behavior to a
// particular vendor. The SDK always uses the configured OpenAI-compatible URL.
export const generativeProviderName = new URL(env.OPENAI_BASE_URL).hostname;

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
