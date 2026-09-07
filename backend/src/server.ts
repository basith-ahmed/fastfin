import { app } from "./app";
import { env } from "./config/env";
import { logger } from "./utils/logger";

const server = app.listen(env.BACKEND_PORT, () => {
  logger.info({ port: env.BACKEND_PORT }, "FastFin API listening");
});

server.on("error", (error) => {
  logger.fatal({ err: error }, "FastFin API failed to start");
  process.exitCode = 1;
});
