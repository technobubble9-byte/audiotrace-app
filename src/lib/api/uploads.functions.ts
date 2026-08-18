import { createServerFn } from "@tanstack/react-start";
import { createHash } from "node:crypto";
import { z } from "zod";

import { probeAudio, extensionFromFilename, isSupportedExtension } from "../audio/transcode.server";
import { saveFile } from "../storage.server";
import { insertUpload, listUploads, type UploadRow } from "../db/queries.server";

export const getUploads = createServerFn({ method: "GET" }).handler(async () => {
  return listUploads();
});

export const uploadAudio = createServerFn({ method: "POST" })
  .validator(
    z.object({
      filename: z.string().min(1),
      base64Data: z.string().min(1),
    }),
  )
  .handler(async ({ data }) => {
    const ext = extensionFromFilename(data.filename);
    if (!isSupportedExtension(ext)) {
      throw new Error(`Unsupported file type ".${ext}". Supported: WAV, MP3, FLAC, AIFF, M4A, OGG.`);
    }

    const buffer = Buffer.from(data.base64Data, "base64");
    if (buffer.length === 0) {
      throw new Error("Uploaded file is empty.");
    }
    // 100MB sanity cap for this MVP's base64-over-JSON transport
    if (buffer.length > 100 * 1024 * 1024) {
      throw new Error("File too large (100MB limit for this workflow).");
    }

    const probe = await probeAudio(buffer, ext);
    if (probe.durationSeconds <= 0) {
      throw new Error("Could not read this file as audio. Is it a valid audio file?");
    }

    const id = crypto.randomUUID();
    const sha256 = createHash("sha256").update(buffer).digest("hex");
    const storagePath = saveFile("uploads", id, ext, buffer);

    const row: UploadRow = {
      id,
      original_filename: data.filename,
      ext,
      size_bytes: buffer.length,
      duration_seconds: probe.durationSeconds,
      sample_rate: probe.sampleRate,
      channels: probe.channels,
      storage_path: storagePath,
      sha256,
      created_at: new Date().toISOString(),
    };
    insertUpload(row);
    return row;
  });
