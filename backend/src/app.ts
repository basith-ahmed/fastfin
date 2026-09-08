import cors from "cors";
import express from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";

import { env } from "./config/env";
import { errorHandler } from "./middleware/errorHandler";
import { documentsRouter } from "./routes/documents";
import {
  factsRouter,
  issuesRouter,
  knowledgeRouter,
  relationshipsRouter,
} from "./routes/knowledge";
import { serverLogger } from "./utils/logger";

export function createApp(): express.Express {
  const app = express();

  app.disable("x-powered-by");
  app.use(helmet());
  app.use(
    cors({
      origin: env.FRONTEND_URL,
    }),
  );
  app.use(express.json());
  app.use(pinoHttp({ logger: serverLogger }));

  app.get("/health", (_req, res) => {
    res.status(200).json({ status: "ok" });
  });

  app.use("/api/documents", documentsRouter);
  app.use("/api/facts", factsRouter);
  app.use("/api/relationships", relationshipsRouter);
  app.use("/api/issues", issuesRouter);
  app.use("/api/knowledge", knowledgeRouter);

  app.use((req, res) => {
    serverLogger.warn({ method: req.method, path: req.path }, "Resource not found (404)");
    res.status(404).json({
      error: {
        code: "NOT_FOUND",
        message: "The requested resource was not found.",
      },
    });
  });

  app.use(errorHandler);

  return app;
}

export const app = createApp();
