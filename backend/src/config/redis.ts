import IORedis from "ioredis";

import { env } from "./env";
import { logger } from "../utils/logger";

export function createRedisConnection(component: string): IORedis {
  const connection = new IORedis(env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: null,
  });

  connection.on("error", (error) => {
    logger.error({ err: error, component }, "Redis connection error");
  });

  return connection;
}

export async function closeRedisConnection(connection: IORedis): Promise<void> {
  if (connection.status === "end") {
    return;
  }

  if (connection.status === "wait") {
    connection.disconnect();
    return;
  }

  await connection.quit();
}
