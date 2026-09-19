/**
 * Codec du replay : Int16Array ↔ base64, et lecture interpolée.
 * Utilisable côté serveur (Buffer) comme côté navigateur (atob/btoa).
 */
import type { ReplayData } from "./types";

export function int16ToBase64(samples: Int16Array): string {
  const bytes = new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let bin = "";
  for (let i = 0; i < bytes.length; i += 0x8000) {
    bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  }
  return btoa(bin);
}

export function base64ToInt16(b64: string): Int16Array {
  let bytes: Uint8Array;
  if (typeof Buffer !== "undefined") {
    bytes = new Uint8Array(Buffer.from(b64, "base64"));
  } else {
    const bin = atob(b64);
    bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  }
  // Copie alignée : un Int16Array exige un offset pair.
  return new Int16Array(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
}

/** Lecteur : décode une fois, puis échantillonne à n'importe quel instant avec interpolation linéaire. */
export class ReplayReader {
  readonly samples: Int16Array;

  constructor(readonly replay: ReplayData) {
    this.samples = base64ToInt16(replay.data);
    const expected = replay.frames * replay.racers * replay.channels;
    if (this.samples.length !== expected) {
      throw new Error(`replay corrompu : ${this.samples.length} échantillons, ${expected} attendus`);
    }
  }

  get durationMs(): number {
    return ((this.replay.frames - 1) / this.replay.hz) * 1000;
  }

  /** Valeur réelle d'un canal pour un racer à l'instant tMs (borné à la durée du replay). */
  value(racer: number, channel: number, tMs: number): number {
    const { hz, frames, racers, channels, scale } = this.replay;
    const f = Math.min(Math.max((tMs / 1000) * hz, 0), frames - 1);
    const f0 = Math.floor(f);
    const f1 = Math.min(f0 + 1, frames - 1);
    const k = f - f0;
    const a = this.samples[(f0 * racers + racer) * channels + channel];
    const b = this.samples[(f1 * racers + racer) * channels + channel];
    return (a + (b - a) * k) / scale;
  }
}
