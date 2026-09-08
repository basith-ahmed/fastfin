import { app } from "./app";
import { env } from "./config/env";
import { serverLogger } from "./utils/logger";

const server = app.listen(env.BACKEND_PORT, () => {
  serverLogger.info({ port: env.BACKEND_PORT, env: env.NODE_ENV }, `FastFin API listening on http://localhost:${env.BACKEND_PORT}`);
});

server.on("error", (error) => {
  serverLogger.fatal({ err: error }, "FastFin API failed to start");
  process.exitCode = 1;
});

const shutdown = (signal: NodeJS.Signals) => {
  serverLogger.info({ signal }, "Shutting down FastFin API server");
  server.close(() => {
    serverLogger.info("FastFin API server closed");
    process.exit(0);
  });
};

process.once("SIGINT", () => shutdown("SIGINT"));
process.once("SIGTERM", () => shutdown("SIGTERM"));
