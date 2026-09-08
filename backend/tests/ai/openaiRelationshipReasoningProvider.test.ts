import OpenAI from "openai";

import { OpenAIRelationshipReasoningProvider } from "../../src/ai/openaiRelationshipReasoningProvider";
import type { RelationshipReasoningInput } from "../../src/ai/types";

function responseBody(output: unknown) {
  return {
    id: "resp_relationship_test",
    object: "response",
    created_at: 1,
    status: "completed",
    output: [
      {
        id: "msg_relationship_test",
        type: "message",
        status: "completed",
        role: "assistant",
        content: [
          {
            type: "output_text",
            text: JSON.stringify(output),
            annotations: [],
          },
        ],
      },
    ],
    usage: {
      input_tokens: 30,
      output_tokens: 20,
      total_tokens: 50,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 0 },
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
        text: { format: { schema: { required: string[] } } };
      };
      expect(request.text.format.schema.required).toContain("decisiveContext");

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

  it("rejects malformed structured output without retrying", async () => {
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
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
