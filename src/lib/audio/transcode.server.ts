// Thin wrapper around the `ffmpeg` / `ffprobe` CLIs for format conversion.
// AudioTrace embeds/detects watermarks on raw PCM, so every supported input
// format (MP3, WAV, FLAC, AIFF) is first normalized to a canonical WAV
// (fixed sample rate, 16-bit PCM) before touching the watermark engine, and
// converted back to the requested output format afterward.
//
// Requires the `ffmpeg` binary on PATH. This module does NOT run in a
// browser or an edge/Workers runtime — it shells out to a real process, so
// it needs a Node-capable server (see README for deployment notes).

import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

export const CANONICAL_SAMPLE_RATE = 44100;

export const SUPPORTED_INPUT_EXTENSIONS = ["wav", "mp3", "flac", "aiff", "aif", "m4a", "ogg"] as const;
export type SupportedExt = (typeof SUPPORTED_INPUT_EXTENSIONS)[number];

function runProcess(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const proc = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => (stdout += d.toString()));
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("error", (err) => {
      reject(
        new Error(
          `Failed to run "${cmd}". Is it installed and on PATH? (${err.message})`,
        ),
      );
    });
    proc.on("close", (code) => {
      if (code === 0) resolve(stdout);
      else reject(new Error(`${cmd} exited with code ${code}: ${stderr.slice(-2000)}`));
    });
  });
}

async function withTempDir<T>(fn: (dir: string) => Promise<T>): Promise<T> {
  const dir = await mkdtemp(path.join(tmpdir(), "audiotrace-"));
  try {
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

export type ProbeResult = {
  durationSeconds: number;
  sampleRate: number;
  channels: number;
  codec: string;
  formatName: string;
};

/** Runs ffprobe against the file to pull duration/sample-rate/channel info. */
export async function probeAudio(inputBuffer: Buffer, ext: string): Promise<ProbeResult> {
  return withTempDir(async (dir) => {
    const inPath = path.join(dir, `in.${ext}`);
    await writeFile(inPath, inputBuffer);
    const out = await runProcess("ffprobe", [
      "-v",
      "error",
      "-select_streams",
      "a:0",
      "-show_entries",
      "stream=sample_rate,channels,codec_name:format=duration,format_name",
      "-of",
      "json",
      inPath,
    ]);
    const parsed = JSON.parse(out);
    const stream = parsed.streams?.[0] ?? {};
    const format = parsed.format ?? {};
    return {
      durationSeconds: parseFloat(format.duration ?? "0") || 0,
      sampleRate: parseInt(stream.sample_rate ?? "0", 10) || CANONICAL_SAMPLE_RATE,
      channels: parseInt(stream.channels ?? "0", 10) || 1,
      codec: stream.codec_name ?? "unknown",
      formatName: format.format_name ?? ext,
    };
  });
}

/** Decodes arbitrary audio bytes to canonical 16-bit PCM WAV at CANONICAL_SAMPLE_RATE. */
export async function decodeToCanonicalWav(inputBuffer: Buffer, ext: string): Promise<Buffer> {
  return withTempDir(async (dir) => {
    const inPath = path.join(dir, `in.${ext}`);
    const outPath = path.join(dir, "out.wav");
    await writeFile(inPath, inputBuffer);
    await runProcess("ffmpeg", [
      "-y",
      "-i",
      inPath,
      "-ar",
      String(CANONICAL_SAMPLE_RATE),
      "-sample_fmt",
      "s16",
      outPath,
    ]);
    return readFile(outPath);
  });
}

/** Encodes a canonical PCM WAV buffer into the requested target format. */
export async function encodeFromCanonicalWav(
  wavBuffer: Buffer,
  targetExt: string,
  opts?: { bitrateKbps?: number },
): Promise<Buffer> {
  return withTempDir(async (dir) => {
    const inPath = path.join(dir, "in.wav");
    const outPath = path.join(dir, `out.${targetExt}`);
    await writeFile(inPath, wavBuffer);
    const args = ["-y", "-i", inPath];
    if (targetExt === "mp3") {
      args.push("-codec:a", "libmp3lame", "-b:a", `${opts?.bitrateKbps ?? 320}k`);
    } else if (targetExt === "flac") {
      args.push("-codec:a", "flac");
    } else if (targetExt === "aiff" || targetExt === "aif") {
      args.push("-codec:a", "pcm_s16be");
    } else if (targetExt === "m4a") {
      args.push("-codec:a", "aac", "-b:a", `${opts?.bitrateKbps ?? 256}k`);
    }
    // wav: default pcm_s16le, no extra args needed
    args.push(outPath);
    await runProcess("ffmpeg", args);
    return readFile(outPath);
  });
}

export function extensionFromFilename(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return ext;
}

export function isSupportedExtension(ext: string): ext is SupportedExt {
  return (SUPPORTED_INPUT_EXTENSIONS as readonly string[]).includes(ext);
}
