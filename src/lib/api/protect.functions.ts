import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { embedFingerprintIntoAudio } from "../audio/pipeline.server";
import { saveFile, readFile } from "../storage.server";
import {
  getUpload,
  getRecipient,
  insertProtectedFile,
  listProtectedFiles,
  getProtectedFileWithJoins,
  type ProtectedFileRow,
} from "../db/queries.server";

export const getProtectedFiles = createServerFn({ method: "GET" }).handler(async () => {
  return listProtectedFiles();
});

export const generateProtectedFile = createServerFn({ method: "POST" })
  .validator(
    z.object({
      uploadId: z.string().min(1),
      recipientId: z.string().min(1),
    }),
  )
  .handler(async ({ data }) => {
    const upload = getUpload(data.uploadId);
    if (!upload) throw new Error("Upload not found.");
    const recipient = getRecipient(data.recipientId);
    if (!recipient) throw new Error("Recipient not found.");

    const inputBuffer = readFile(upload.storage_path);
    const result = await embedFingerprintIntoAudio(inputBuffer, upload.ext, upload.ext);

    const id = crypto.randomUUID();
    const storagePath = saveFile("protected", id, upload.ext, result.outputBuffer);

    const row: ProtectedFileRow = {
      id,
      upload_id: upload.id,
      recipient_id: recipient.id,
      fingerprint_hex: result.fingerprintHex,
      ext: upload.ext,
      size_bytes: result.outputBuffer.length,
      storage_path: storagePath,
      created_at: new Date().toISOString(),
    };
    insertProtectedFile(row);

    return getProtectedFileWithJoins(id)!;
  });

export const downloadProtectedFile = createServerFn({ method: "GET" })
  .validator(z.object({ id: z.string().min(1) }))
  .handler(async ({ data }) => {
    const pf = getProtectedFileWithJoins(data.id);
    if (!pf) throw new Error("Protected file not found.");
    const buffer = readFile(pf.storage_path);
    return {
      filename: `${pf.upload_filename.replace(/\.[^.]+$/, "")}_${pf.recipient_name.replace(/\s+/g, "-")}.${pf.ext}`,
      ext: pf.ext,
      base64Data: buffer.toString("base64"),
    };
  });
