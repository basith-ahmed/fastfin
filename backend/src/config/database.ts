import { PrismaClient, type Prisma } from "@prisma/client";

import { env } from "./env";

const globalForPrisma = globalThis as unknown as {
  fastfinPrisma: PrismaClient | undefined;
};

const databaseLogLevels: Prisma.LogLevel[] =
  env.NODE_ENV === "test" ? [] : env.NODE_ENV === "development" ? ["warn", "error"] : ["error"];

export const prisma =
  globalForPrisma.fastfinPrisma ??
  new PrismaClient({
    datasourceUrl: env.DATABASE_URL,
    log: databaseLogLevels,
  });

if (env.NODE_ENV !== "production") {
  globalForPrisma.fastfinPrisma = prisma;
}

export async function connectDatabase(): Promise<void> {
  await prisma.$connect();
}

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect();
}
