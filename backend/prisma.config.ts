import path from "node:path";

import dotenv from "dotenv";
import { defineConfig } from "prisma/config";

dotenv.config({ path: path.resolve(__dirname, "../.env"), quiet: true });

const databaseUrl =
  process.env.DATABASE_URL ?? "postgresql://FastFin:FastFin@localhost:5432/FastFin";
process.env.DATABASE_URL = databaseUrl;

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  engine: "classic",
  datasource: {
    url: databaseUrl,
  },
});
