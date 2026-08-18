// High-level orchestration: arbitrary-format audio in -> canonical PCM ->
// watermark engine -> arbitrary-format audio out. This is the module the
// server functions call; it's the only place that needs to know how
// transcode.server.ts, node-wav, and watermark.server.ts fit together.

// @ts-expect-error - node-wav ships no types
import wav from "node-wav";
import { decodeToCanonicalWav, encodeFromCanonicalWav } from "./transcode.server";
import {
  embedChannel,
  detectChannels,
  generateFingerprintId,
  estimateCapacity,
  minSecondsRequired,
  type DetectionResult,
} from "./watermark.server";

export type EmbedResult = {
  fingerprintHex: string;
  outputBuffer: Buffer;
  durationSeconds: number;
  sampleRate: number;
  channels: number;
};

export async function embedFingerprintIntoAudio(
  inputBuffer: Buffer,
  inputExt: string,
  outputExt: string,
): Promise<EmbedResult> {
  const canonicalWav = await decodeToCanonicalWav(inputBuffer, inputExt);
  const decoded = wav.decode(canonicalWav) as { sampleRate: number; channelData: Float32Array[] };
  const sampleRate = decoded.sampleRate;
  const channels = decoded.channelData.length;
  const numSamples = decoded.channelData[0]?.length ?? 0;

  const cap = estimateCapacity(numSamples, sampleRate);
  if (!cap.sufficient) {
    throw new Error(
      `This file is too short to watermark reliably (need at least ~${minSecondsRequired(sampleRate).toFixed(
        1,
      )}s of audio).`,
    );
  }

  const fingerprintHex = generateFingerprintId();

  const watermarkedChannels: Float32Array[] = decoded.channelData.map((ch) => {
    const f64 = Float64Array.from(ch);
    const embedded = embedChannel(f64, sampleRate, fingerprintHex);
    return Float32Array.from(embedded);
  });

  const outWavBuffer: Buffer = wav.encode(watermarkedChannels, {
    sampleRate,
    float: false,
    bitDepth: 16,
  });
  const outputBuffer = await encodeFromCanonicalWav(outWavBuffer, outputExt);

  return {
    fingerprintHex,
    outputBuffer,
    durationSeconds: numSamples / sampleRate,
    sampleRate,
    channels,
  };
}

export async function detectFingerprintInAudio(inputBuffer: Buffer, inputExt: string): Promise<DetectionResult> {
  const canonicalWav = await decodeToCanonicalWav(inputBuffer, inputExt);
  const decoded = wav.decode(canonicalWav) as { sampleRate: number; channelData: Float32Array[] };
  const channels = decoded.channelData.map((ch) => Float64Array.from(ch));
  return detectChannels(channels, decoded.sampleRate);
}
