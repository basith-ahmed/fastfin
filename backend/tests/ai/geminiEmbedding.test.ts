import { GeminiEmbeddingProvider } from "../../src/ai/geminiEmbedding";

const validVector = Array.from({ length: 768 }, (_, index) => index / 768);

describe("Gemini embedding provider", () => {
  it("requests a 768-dimensional retrieval embedding and accepts a valid response", async () => {
    const embedContent = jest.fn(async () => ({ embeddings: [{ values: validVector }] }));
    const provider = new GeminiEmbeddingProvider({
      client: { models: { embedContent } },
      model: "gemini-embedding-test",
      dimensions: 768,
    });

    await expect(provider.embed("Entity: Acme\nPredicate: revenue")).resolves.toEqual(validVector);
    expect(embedContent).toHaveBeenCalledWith({
      model: "gemini-embedding-test",
      contents: "Entity: Acme\nPredicate: revenue",
      config: { outputDimensionality: 768, taskType: "RETRIEVAL_DOCUMENT" },
    });
  });

  it.each([
    ["wrong dimensions", [1, 2]],
    ["a NaN component", [...validVector.slice(0, -1), Number.NaN]],
  ])("rejects %s", async (_label, vector) => {
    const provider = new GeminiEmbeddingProvider({
      client: {
        models: { embedContent: async () => ({ embeddings: [{ values: vector }] }) },
      },
      dimensions: 768,
    });

    await expect(provider.embed("valid comparison text")).rejects.toThrow();
  });

  it("rejects blank input before making an API call", async () => {
    const embedContent = jest.fn(async () => ({ embeddings: [{ values: validVector }] }));
    const provider = new GeminiEmbeddingProvider({
      client: { models: { embedContent } },
      dimensions: 768,
    });

    await expect(provider.embed("   ")).rejects.toThrow("Embedding text must not be empty");
    expect(embedContent).not.toHaveBeenCalled();
  });
});
