/** 64318 → "1:04.318" */
export function raceTime(ms: number): string {
  const m = Math.floor(ms / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const milli = Math.floor(ms % 1000);
  return `${m}:${String(s).padStart(2, "0")}.${String(milli).padStart(3, "0")}`;
}

/** 5211 → "+5.211" */
export function gap(ms: number): string {
  return `+${(ms / 1000).toFixed(3)}`;
}

/** Compte à rebours : 32400 → "0:33" (arrondi au-dessus, on ne montre jamais 0:00 trop tôt). */
export function countdown(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** raceId horodaté → code court lisible : "#…4312". */
export function raceCode(raceId: string): string {
  return `#${raceId.slice(-5)}`;
}

export function ordinal(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return `${n}${s[(v - 20) % 10] || s[v] || s[0]}`;
}

export function sameAddress(a?: string | null, b?: string | null): boolean {
  return !!a && !!b && a.toLowerCase() === b.toLowerCase();
}
