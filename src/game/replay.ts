import { ReplayReader } from "@/shared/replay";
import { FINISH_Y } from "@/sim/track";

export function position(reader: ReplayReader, index: number, ms: number): [number, number] {
  return reader.replay.channels === 2
    ? [reader.value(index, 0, ms), reader.value(index, 1, ms)]
    : [((index * 17) % reader.replay.racers) / Math.max(1, reader.replay.racers - 1) * 18 - 9, reader.value(index, 0, ms) * FINISH_Y];
}

export function physicalSeconds(reader: ReplayReader, ms: number): number {
  const time = Math.max(0, ms) / 1000;
  const c = reader.replay.clock;
  const launch = c?.launchWindow ?? 0;
  const first = c?.firstReplay ?? 60;
  return !c || time <= launch ? time : time <= first ? launch + (time - launch) / c.headScale : c.firstPhysical + (time - first) / c.tailScale;
}

export function finishTimes(reader: ReplayReader): number[] {
  if (reader.replay.finishTimes) return reader.replay.finishTimes;
  const { frames, racers, hz, channels, scale } = reader.replay;
  return Array.from({ length: racers }, (_, i) => {
    for (let f = 0; f < frames; f++) {
      if (reader.samples[(f * racers + i) * channels + channels - 1] >= (channels === 2 ? FINISH_Y : 1) * scale - 1) return f / hz * 1000;
    }
    return Infinity;
  });
}

export function standings(reader: ReplayReader, ms: number, finishes: number[]) {
  return Array.from({ length: reader.replay.racers }, (_, index) => ({
    index, y: position(reader, index, ms)[1], finish: finishes[index] <= ms ? finishes[index] : null,
  })).sort((a, b) => a.finish !== null && b.finish !== null ? a.finish - b.finish || a.index - b.index
    : a.finish !== null ? -1 : b.finish !== null ? 1 : b.y - a.y || a.index - b.index);
}
