import { parseEnv } from "../src/config/env";

describe("environment validation", () => {
  it("parses and coerces valid values", () => {
    const result = parseEnv({
      NODE_ENV: "test",
      BACKEND_PORT: "4100",
      FRONTEND_URL: "http://localhost:3000",
      DATABASE_URL: "postgresql://FastFin:FastFin@localhost:5432/FastFin",
      REDIS_URL: "redis://localhost:6379",
      MAX_UPLOAD_MB: "25",
      EMBEDDING_DIMENSIONS: "768",
      FACT_MIN_CONFIDENCE: "0.75",
      OPENAI_BASE_URL: "https://llm-gateway.example/openai/v1",
      LLM_MODEL: "vendor/development-model",
      EMBEDDING_MODEL: "gemini-embedding-2",
    });

    expect(result).toMatchObject({
      NODE_ENV: "test",
      BACKEND_PORT: 4100,
      MAX_UPLOAD_MB: 25,
      EMBEDDING_DIMENSIONS: 768,
      FACT_MIN_CONFIDENCE: 0.75,
      OPENAI_BASE_URL: "https://llm-gateway.example/openai/v1",
      LLM_MODEL: "vendor/development-model",
      EMBEDDING_MODEL: "gemini-embedding-2",
    });
  });

  it("preserves arbitrary OpenAI-compatible endpoint and model values", () => {
    const result = parseEnv({
      OPENAI_BASE_URL: "https://another-provider.example/v1",
      LLM_MODEL: "experimental/model-name",
    });

    expect(result.OPENAI_BASE_URL).toBe("https://another-provider.example/v1");
    expect(result.LLM_MODEL).toBe("experimental/model-name");
  });

  it("rejects malformed values with a useful message", () => {
    expect(() =>
      parseEnv({
        BACKEND_PORT: "not-a-port",
        DATABASE_URL: "not-a-url",
        REDIS_URL: "https://localhost:6379",
        FACT_MIN_CONFIDENCE: "1.5",
      }),
    ).toThrow(/Invalid environment configuration/);
  });
});
