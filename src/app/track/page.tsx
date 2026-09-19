import { planckEngine } from "@/sim/engine";
import { racerColor, botNames } from "@/server/racers";
import { TrackPreview } from "@/components/TrackPreview";
import type { RacerEntry } from "@/shared/types";

/** Circuit de démonstration isolé : aucune inscription ni transaction réelle. */
export default function TrackPage() {
  const seed = "0xcaca" as const;
  const names = botNames(seed, 40);
  const racers: RacerEntry[] = names.map((name, id) => ({ id, name: id === 0 ? "You" : name, isBot: id !== 0, address: null, color: racerColor(id), joinTx: null }));
  const result = planckEngine.simulate({ seed, racers });
  return <TrackPreview racers={racers} result={result} />;
}
