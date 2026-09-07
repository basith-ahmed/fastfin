import pino from "pino";

import { env } from "../config/env";

export const logger = pino({
  enabled: env.NODE_ENV !== "test",
  level: env.NODE_ENV === "production" ? "info" : "debug",
  redact: {
    paths: [
      "req.headers.authorization",
      "req.headers.cookie",
      "OPENAI_API_KEY",
      "GEMINI_API_KEY",
    ],
    censor: "[REDACTED]",
  },
});
