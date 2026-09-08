import OpenAI from "openai";

import { OpenAIFactExtractionProvider } from "../../src/ai/openaiFactExtractionProvider";
import type { FactExtractionInput } from "../../src/ai/types";
import { validFactDraft } from "../fixtures/factDraft";

function responseBody(facts: unknown) {
  return {
    id: "resp_test",
    object: "response",
    created_at: 1,
    status: "completed",
    output: [
      {
        id: "msg_test",
        type: "message",
        status: "completed",
        role: "assistant",
        content: [
          {
            type: "output_text",
            text: JSON.stringify({ facts }),
            annotations: [],
          },
        ],
      },
    ],
    usage: {
      input_tokens: 25,
      output_tokens: 40,
      total_tokens: 65,
      input_tokens_details: { cached_tokens: 0 },
      output_tokens_details: { reasoning_tokens: 0 },
    },
  };
}

const extractionInput: FactExtractionInput = {
  documentId: "6d535d4d-3002-4cce-8a49-b890cab5a75c",
  chunkSha: "a".repeat(64),
  documentContext: "Original filename: acme-annual-report.pdf\nOpening page text: Acme Corporation",
  chunkText: "[PAGE 2]\n\nAcme Corporation reported revenue of $20 million in 2025.",
  numericalCandidates: [],
};

describe("OpenAI fact extraction provider", () => {
  it("uses the real Responses API structured parser and returns multiple facts", async () => {
    const fetchMock = jest.fn(async () =>
      new Response(JSON.stringify(responseBody([validFactDraft, validFactDraft])), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const records: Array<{ success: boolean; inputTokens?: number; outputTokens?: number }> = [];
    const provider = new OpenAIFactExtractionProvider({
      client: new OpenAI({ apiKey: "test", maxRetries: 0, fetch: fetchMock }),
      recordInvocation: async (record) => {
        records.push(record);
      },
    });

    await expect(provider.extractFacts(extractionInput)).resolves.toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(records).toEqual([
      expect.objectContaining({ success: true, inputTokens: 25, outputTokens: 40 }),
    ]);
  });

  it("retries transient responses at most twice and records every attempt", async () => {
    const responses = [
      new Response(JSON.stringify({ error: { message: "temporary", type: "server_error" } }), {
        status: 500,
        headers: { "content-type": "application/json" },
      }),
      new Response(JSON.stringify(responseBody([])), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    ];
    const fetchMock = jest.fn(async () => {
      const response = responses.shift();
      if (!response) {
        throw new Error("No test response remains.");
      }
      return response;
    });
    const records: Array<{ success: boolean }> = [];
    const delays: number[] = [];
    const provider = new OpenAIFactExtractionProvider({
      client: new OpenAI({ apiKey: "test", maxRetries: 0, fetch: fetchMock }),
      recordInvocation: async (record) => {
        records.push(record);
      },
      wait: async (milliseconds) => {
        delays.push(milliseconds);
      },
      random: () => 0,
    });

    await expect(provider.extractFacts(extractionInput)).resolves.toEqual([]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(records.map((record) => record.success)).toEqual([false, true]);
    expect(delays).toEqual([250]);
  });

  it("does not retry permanent API or malformed structured-output failures", async () => {
    const permanentFetch = jest.fn(async () =>
      new Response(JSON.stringify({ error: { message: "bad request", type: "invalid_request" } }), {
        status: 400,
        headers: { "content-type": "application/json" },
      }),
    );
    const malformedFetch = jest.fn(async () =>
      new Response(JSON.stringify(responseBody([{ confidence: 4 }])), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );

    const permanentProvider = new OpenAIFactExtractionProvider({
      client: new OpenAI({ apiKey: "test", maxRetries: 0, fetch: permanentFetch }),
      recordInvocation: async () => undefined,
    });
    const malformedProvider = new OpenAIFactExtractionProvider({
      client: new OpenAI({ apiKey: "test", maxRetries: 0, fetch: malformedFetch }),
      recordInvocation: async () => undefined,
    });

    await expect(permanentProvider.extractFacts(extractionInput)).rejects.toThrow("bad request");
    await expect(malformedProvider.extractFacts(extractionInput)).rejects.toThrow(
      "invalid structured fact extraction output",
    );
    expect(permanentFetch).toHaveBeenCalledTimes(1);
    expect(malformedFetch).toHaveBeenCalledTimes(1);
  });
});
