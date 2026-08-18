// Local-disk file storage. See client.server.ts for the same caveat: this
// needs a real writable filesystem, which local dev and any Node host have,
// but Cloudflare Workers does not (swap for R2 there).

import { mkdirSync, writeFileSync, readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { DATA_DIR } from "./db/client.server";

export type StorageBucket = "uploads" | "protected" | "scans";

function bucketDir(bucket: StorageBucket): string {
  const dir = path.join(DATA_DIR, bucket);
  mkdirSync(dir, { recursive: true });
  return dir;
}

export function saveFile(bucket: StorageBucket, id: string, ext: string, data: Buffer): string {
  const dir = bucketDir(bucket);
  const filename = `${id}.${ext}`;
  const fullPath = path.join(dir, filename);
  writeFileSync(fullPath, data);
  // store a bucket-relative path so it stays portable if DATA_DIR moves
  return path.join(bucket, filename);
}

export function readFile(relativePath: string): Buffer {
  const fullPath = path.join(DATA_DIR, relativePath);
  if (!existsSync(fullPath)) {
    throw new Error(`File not found in storage: ${relativePath}`);
  }
  return readFileSync(fullPath);
}

export function fileExists(relativePath: string): boolean {
  return existsSync(path.join(DATA_DIR, relativePath));
}
