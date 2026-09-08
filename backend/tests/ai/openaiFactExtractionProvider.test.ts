import OpenAI from "openai";

import { OpenAIFactExtractionProvider } from "../../src/ai/openaiFactExtractionProvider";
import type { FactExtractionInput } from "../../src/ai/types";
import { validFactDraft } from "../fixtures/factDraft";

function responseBody(facts: unknown) {
  return {
    id: "chatcmpl_test",
    object: "chat.completion",
    created: 1,
    model: "test-model",
    choices: [
      {
        index: 0,
        message: { role: "assistant", content: JSON.stringify({ facts }) },
        finish_reason: "stop",
        logprobs: null,
      },
    ],
    usage: {
      prompt_tokens: 25,
      completion_tokens: 40,
      total_tokens: 65,
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
  it("uses the Chat Completions structured parser and returns multiple facts", async () => {
    const fetchMock = jest.fn(async (_input: string | URL | Request, init?: RequestInit) => {
      const request = JSON.parse(String(init?.body)) as { response_format?: unknown };
      expect(JSON.stringify(request.response_format)).not.toContain("propertyNames");
      return new Response(JSON.stringify(responseBody([validFactDraft, validFactDraft])), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    });
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

  it("retries a non-JSON response and accepts a later valid structured response", async () => {
    const responses = [
      responseBody("**This is Markdown, not structured output.**"),
      responseBody([validFactDraft]),
    ];
    responses[0]!.choices[0]!.message.content = "**This is Markdown, not JSON.**";
    const fetchMock = jest.fn(async () =>
      new Response(JSON.stringify(responses.shift()), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const delays: number[] = [];
    const provider = new OpenAIFactExtractionProvider({
      client: new OpenAI({ apiKey: "test", maxRetries: 0, fetch: fetchMock }),
      recordInvocation: async () => undefined,
      wait: async (milliseconds) => {
        delays.push(milliseconds);
      },
      random: () => 0,
    });

    await expect(provider.extractFacts(extractionInput)).resolves.toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(delays).toEqual([250]);
  });

  it("does not retry permanent API failures but retries malformed structured output", async () => {
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
    expect(malformedFetch).toHaveBeenCalledTimes(3);
  });
});
