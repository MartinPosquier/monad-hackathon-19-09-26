/**
 * PRNG seedé — mulberry32. Toute la course dérive d'un `raceSeed` de 32 octets :
 * même seed + mêmes inscrits = même classement, sur n'importe quelle machine.
 */

export type Rng = () => number;

/** mulberry32 : 32 bits d'état, période 2^32, suffisant pour une course. Renvoie [0, 1). */
export function mulberry32(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Replie un seed hexadécimal de longueur quelconque sur 32 bits (XOR des mots de 4 octets). */
export function seedToU32(seedHex: string): number {
  const hex = seedHex.replace(/^0x/i, "").padStart(8, "0");
  let acc = 0;
  for (let i = 0; i < hex.length; i += 8) {
    acc ^= parseInt(hex.slice(i, i + 8).padEnd(8, "0"), 16);
  }
  return acc >>> 0;
}

/** Sous-générateur indépendant pour un usage nommé : évite qu'ajouter un tirage décale tous les autres. */
export function forkRng(seedHex: string, label: string): Rng {
  let h = seedToU32(seedHex) ^ 0x9e3779b9;
  for (let i = 0; i < label.length; i++) {
    h = Math.imul(h ^ label.charCodeAt(i), 0x01000193) >>> 0;
  }
  return mulberry32(h);
}

/** Loi normale centrée réduite (Box-Muller). */
export function gaussian(rng: Rng): number {
  const u = Math.max(rng(), 1e-12);
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * rng());
}
