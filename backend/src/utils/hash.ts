import { createHash } from "node:crypto";
import { createReadStream } from "node:fs";

export function hashTextSha256(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

export async function hashFileSha256(filePath: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);

    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", () => resolve(hash.digest("hex")));
  });
}
