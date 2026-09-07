import fs from "node:fs";
import path from "node:path";

import { env } from "./env";

const backendRoot = path.resolve(__dirname, "../..");

function resolveStoragePath(configuredPath: string): string {
  return path.isAbsolute(configuredPath)
    ? path.normalize(configuredPath)
    : path.resolve(backendRoot, configuredPath);
}

export const pdfStoragePath = resolveStoragePath(env.PDF_STORAGE_PATH);
export const pdfTempPath = resolveStoragePath(env.PDF_TEMP_PATH);

export function ensureStorageDirectories(): void {
  fs.mkdirSync(pdfStoragePath, { recursive: true });
  fs.mkdirSync(pdfTempPath, { recursive: true });
}

export function isManagedPdfPath(filePath: string): boolean {
  const relativePath = path.relative(pdfStoragePath, path.resolve(filePath));
  return relativePath !== "" && !relativePath.startsWith("..") && !path.isAbsolute(relativePath);
}
