import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { detectFingerprintInAudio } from "../audio/pipeline.server";
import { extensionFromFilename, isSupportedExtension } from "../audio/transcode.server";
import { saveFile } from "../storage.server";
import {
  insertTraceScan,
  listTraceScans,
  getProtectedFileByFingerprint,
  type TraceScanRow,
} from "../db/queries.server";

export const getTraceScans = createServerFn({ method: "GET" }).handler(async () => {
  return listTraceScans();
});

export const scanForFingerprint = createServerFn({ method: "POST" })
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
    if (buffer.length === 0) throw new Error("Uploaded file is empty.");
    if (buffer.length > 100 * 1024 * 1024) {
      throw new Error("File too large (100MB limit for this workflow).");
    }

    const detection = await detectFingerprintInAudio(buffer, ext);

    const id = crypto.randomUUID();
    const storagePath = saveFile("scans", id, ext, buffer);

    const matched = detection.fingerprintHex ? getProtectedFileByFingerprint(detection.fingerprintHex) : undefined;

    const scan: TraceScanRow = {
      id,
      suspect_filename: data.filename,
      storage_path: storagePath,
      detected: detection.detected ? 1 : 0,
      crc_valid: detection.crcValid ? 1 : 0,
      confidence: detection.confidence,
      decoded_fingerprint: detection.fingerprintHex,
      matched_protected_file_id: matched?.id ?? null,
      created_at: new Date().toISOString(),
    };
    insertTraceScan(scan);

    return {
      scan,
      detection,
      matched: matched ?? null,
    };
  });
