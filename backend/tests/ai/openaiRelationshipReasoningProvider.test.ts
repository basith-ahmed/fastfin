import OpenAI from "openai";

import { OpenAIRelationshipReasoningProvider } from "../../src/ai/openaiRelationshipReasoningProvider";
import type { RelationshipReasoningInput } from "../../src/ai/types";

function responseBody(output: unknown) {
  return {
    id: "chatcmpl_relationship_test",
    object: "chat.completion",
    created: 1,
    model: "test-model",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: JSON.stringify(output) },
        finish_reason: "stop",
        logprobs: null,
      },
    ],
    usage: {
      prompt_tokens: 30,
      completion_tokens: 20,
      total_tokens: 50,
    },
  };
}

const reasoningInput: RelationshipReasoningInput = {
  factA: {
    entity: "Acme Corporation",
    predicate: "annual_revenue",
    value: "$12 million",
    unit: "USD",
    currency: "USD",
    period: "FY2025",
    scope: "consolidated",
    segment: null,
    quote: "FY2025 revenue was $12 million.",
  },
  factB: {
    entity: "Acme Corporation",
    predicate: "annual_revenue",
    value: "$18 million",
    unit: "USD",
    currency: "USD",
    period: "FY2025",
    scope: "consolidated",
    segment: null,
    quote: "FY2025 revenue was $18 million.",
  },
};

describe("OpenAI relationship reasoning provider", () => {
  it("uses an API-compatible strict schema and parses structured output", async () => {
    const fetchMock = jest.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as {
        response_format: { json_schema: { schema: { required: string[] } } };
      };
      expect(request.response_format.json_schema.schema.required).toContain("decisiveContext");

      return new Response(
        JSON.stringify(
          responseBody({
            classification: "CONTRADICTS",
            confidence: 0.94,
            explanation: "The facts assert different revenue values under the same context.",
            decisiveContext: [
              {
                dimension: "value",
                factA: "$12 million",
                factB: "$18 million",
                effect: "SUPPORTS_CONTRADICTION",
              },
            ],
          }),
        ),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    });
    const records: Array<{ success: boolean; inputTokens?: number; outputTokens?: number }> = [];
    const provider = new OpenAIRelationshipReasoningProvider({
      client: new OpenAI({ apiKey: "test", maxRetries: 0, fetch: fetchMock }),
      recordInvocation: async (record) => {
        records.push(record);
      },
    });

    await expect(provider.reasonRelationship(reasoningInput)).resolves.toMatchObject({
      classification: "CONTRADICTS",
      confidence: 0.94,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(records).toEqual([
      expect.objectContaining({ success: true, inputTokens: 30, outputTokens: 20 }),
    ]);
  });

  it("retries and then rejects malformed structured output", async () => {
    const fetchMock = jest.fn(async () =>
      new Response(
        JSON.stringify(
          responseBody({
            classification: "CONTRADICTS",
            confidence: 0.9,
            explanation: "Missing required context array.",
          }),
        ),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const provider = new OpenAIRelationshipReasoningProvider({
      client: new OpenAI({ apiKey: "test", maxRetries: 0, fetch: fetchMock }),
      recordInvocation: async () => undefined,
    });

    await expect(provider.reasonRelationship(reasoningInput)).rejects.toThrow(
      "invalid structured relationship reasoning output",
    );
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
