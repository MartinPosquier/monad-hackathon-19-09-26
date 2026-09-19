/**
 * Tests du contrat SpermRace sur un EVM en mémoire (@ethereumjs/vm, chain 10143, Prague).
 * Pas de Foundry, pas de réseau.
 *
 * Le test central est la compatibilité de signature : l'attestation produite par
 * `signAttestation()` (le code serveur réel) doit être acceptée par `claimTicket()`.
 * Si ce test casse, plus personne ne peut obtenir de ticket.
 */
import { zeroAddress, type Abi, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { beforeEach, describe, expect, it } from "vitest";
import { signAttestation } from "@/server/attest";
import { compileSpermRace } from "../scripts/compile";
import { Evm } from "./evm";

const THRESHOLD = 5n;
const art = compileSpermRace();

const ownerPk = generatePrivateKey();
const attestorPk = generatePrivateKey();
const playerPk = generatePrivateKey();
const strangerPk = generatePrivateKey();
const owner = privateKeyToAccount(ownerPk);
const attestor = privateKeyToAccount(attestorPk);
const player = privateKeyToAccount(playerPk);
const stranger = privateKeyToAccount(strangerPk);

let evm: Evm;
let contract: Address;

const inTenMinutes = () => BigInt(Math.floor(Date.now() / 1000) + 600);

function attest(p: Address, txCount: bigint, deadline = inTenMinutes(), signer = attestor): Promise<Hex> {
  return signAttestation(signer, evm.chainId, contract, { player: p, txCount, deadline });
}

async function claim(pk: Hex, txCount: bigint) {
  const deadline = inTenMinutes();
  const sig = await attest(privateKeyToAccount(pk).address, txCount, deadline);
  return evm.write(pk, contract, "claimTicket", [txCount, deadline, sig]);
}

async function playerState(a: Address) {
  const [tickets, racesJoined, lastAttestation] = await evm.read<readonly [number, number, bigint]>(
    contract,
    "players",
    [a],
  );
  return { tickets, racesJoined, lastAttestation };
}

beforeEach(async () => {
  evm = await Evm.create(art.abi as Abi);
  for (const a of [owner, player, stranger]) await evm.fund(a.address);
  contract = await evm.deploy(ownerPk, art.bytecode, [attestor.address, THRESHOLD]);
});

describe("déploiement", () => {
  it("fixe owner, attestor et seuil", async () => {
    expect(await evm.read(contract, "owner")).toBe(owner.address);
    expect(await evm.read(contract, "attestor")).toBe(attestor.address);
    expect(await evm.read(contract, "threshold")).toBe(THRESHOLD);
  });

  it("reste très loin de la limite de taille Monad (128 Ko)", () => {
    expect(art.deployedSize).toBeLessThan(24_576); // tient même sous la limite Ethereum
  });

  it("n'expose aucune fonction payable (reserve balance)", () => {
    const payable = art.abi.filter((f: { stateMutability?: string }) => f.stateMutability === "payable");
    expect(payable).toEqual([]);
  });
});

describe("claimTicket", () => {
  it("accepte l'attestation signée par le code serveur et émet TicketClaimed", async () => {
    const out = await claim(playerPk, 7n);
    expect(out.error).toBeNull();
    const [log] = evm.events(out, "TicketClaimed");
    expect(log.args).toEqual({ player: player.address, txCount: 7n });
    expect(await playerState(player.address)).toEqual({ tickets: 1, racesJoined: 0, lastAttestation: 7n });
  });

  it("refuse de rejouer la même signature", async () => {
    const deadline = inTenMinutes();
    const sig = await attest(player.address, 7n, deadline);
    expect((await evm.write(playerPk, contract, "claimTicket", [7n, deadline, sig])).ok).toBe(true);
    const replay = await evm.write(playerPk, contract, "claimTicket", [7n, deadline, sig]);
    expect(replay.error).toBe("StaleAttestation");
    expect((await playerState(player.address)).tickets).toBe(1);
  });

  it("accepte un nouveau claim dès que le compteur a augmenté (1 ticket par claim, répétable)", async () => {
    await claim(playerPk, 7n);
    await claim(playerPk, 8n);
    expect((await playerState(player.address)).tickets).toBe(2);
  });

  it("refuse une attestation expirée", async () => {
    const past = BigInt(Math.floor(Date.now() / 1000) - 10);
    const sig = await attest(player.address, 7n, past);
    expect((await evm.write(playerPk, contract, "claimTicket", [7n, past, sig])).error).toBe("AttestationExpired");
  });

  it("refuse un compteur sous le seuil, même signé", async () => {
    const deadline = inTenMinutes();
    const sig = await attest(player.address, 4n, deadline);
    expect((await evm.write(playerPk, contract, "claimTicket", [4n, deadline, sig])).error).toBe("BelowThreshold");
  });

  it("refuse une signature d'une autre clé que l'attestor", async () => {
    const deadline = inTenMinutes();
    const sig = await attest(player.address, 7n, deadline, stranger);
    expect((await evm.write(playerPk, contract, "claimTicket", [7n, deadline, sig])).error).toBe("BadSignature");
  });

  it("refuse l'attestation d'un autre joueur (liée à msg.sender)", async () => {
    const deadline = inTenMinutes();
    const sig = await attest(player.address, 7n, deadline);
    expect((await evm.write(strangerPk, contract, "claimTicket", [7n, deadline, sig])).error).toBe("BadSignature");
  });

  it("refuse un txCount falsifié après signature", async () => {
    const deadline = inTenMinutes();
    const sig = await attest(player.address, 7n, deadline);
    expect((await evm.write(playerPk, contract, "claimTicket", [900n, deadline, sig])).error).toBe("BadSignature");
  });

  it("refuse une signature malléable (s haut)", async () => {
    const deadline = inTenMinutes();
    const sig = await attest(player.address, 7n, deadline);
    const n = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
    const s = BigInt(`0x${sig.slice(66, 130)}`);
    const v = parseInt(sig.slice(130, 132), 16);
    const flipped = `${sig.slice(0, 66)}${(n - s).toString(16).padStart(64, "0")}${v === 27 ? "1c" : "1b"}` as Hex;
    expect((await evm.write(playerPk, contract, "claimTicket", [7n, deadline, flipped])).error).toBe("BadSignature");
  });

  it("refuse une signature tronquée", async () => {
    const deadline = inTenMinutes();
    const sig = await attest(player.address, 7n, deadline);
    const cut = sig.slice(0, 130) as Hex;
    expect((await evm.write(playerPk, contract, "claimTicket", [7n, deadline, cut])).error).toBe("BadSignature");
  });
});

describe("joinRace", () => {
  it("brûle un ticket et émet RaceJoined avec le raceId", async () => {
    await claim(playerPk, 7n);
    const out = await evm.write(playerPk, contract, "joinRace", [1_726_000_000_000n]);
    const [log] = evm.events(out, "RaceJoined");
    expect(log.args).toEqual({ player: player.address, raceId: 1_726_000_000_000n });
    expect(await playerState(player.address)).toMatchObject({ tickets: 0, racesJoined: 1 });
  });

  it("refuse sans ticket", async () => {
    expect((await evm.write(playerPk, contract, "joinRace", [1n])).error).toBe("NoTicket");
  });

  it("coûte peu de gas (un seul slot Player touché)", async () => {
    await claim(playerPk, 7n);
    const out = await evm.write(playerPk, contract, "joinRace", [1n]);
    expect(out.gasUsed).toBeLessThan(40_000n);
  });
});

describe("submitResult", () => {
  const seed = `0x${"ab".repeat(32)}` as Hex;

  it("publie seed + podium une seule fois, owner seulement", async () => {
    const podium = [player.address, zeroAddress, stranger.address] as const;
    expect((await evm.write(strangerPk, contract, "submitResult", [42n, seed, podium])).error).toBe("NotOwner");

    const out = await evm.write(ownerPk, contract, "submitResult", [42n, seed, podium]);
    const [log] = evm.events(out, "RaceFinished");
    expect(log.args).toEqual({ raceId: 42n, seed, podium });
    expect(await evm.read(contract, "raceSeeds", [42n])).toBe(seed);

    expect((await evm.write(ownerPk, contract, "submitResult", [42n, seed, podium])).error).toBe(
      "ResultAlreadySubmitted",
    );
  });

  it("refuse une seed nulle", async () => {
    const zero = `0x${"00".repeat(32)}` as Hex;
    const out = await evm.write(ownerPk, contract, "submitResult", [1n, zero, [zeroAddress, zeroAddress, zeroAddress]]);
    expect(out.error).toBe("ZeroSeed");
  });
});

describe("administration", () => {
  it("setThreshold passe de 1000 (pitch) à 5 (démo) sans redéploiement", async () => {
    await evm.write(ownerPk, contract, "setThreshold", [1000n]);
    const deadline = inTenMinutes();
    const sig = await attest(player.address, 7n, deadline);
    expect((await evm.write(playerPk, contract, "claimTicket", [7n, deadline, sig])).error).toBe("BelowThreshold");
    await evm.write(ownerPk, contract, "setThreshold", [5n]);
    expect((await evm.write(playerPk, contract, "claimTicket", [7n, deadline, sig])).ok).toBe(true);
  });

  it("réserve setThreshold, setAttestor et transferOwnership à l'owner", async () => {
    expect((await evm.write(strangerPk, contract, "setThreshold", [1n])).error).toBe("NotOwner");
    expect((await evm.write(strangerPk, contract, "setAttestor", [stranger.address])).error).toBe("NotOwner");
    expect((await evm.write(strangerPk, contract, "transferOwnership", [stranger.address])).error).toBe("NotOwner");
    expect((await evm.write(ownerPk, contract, "setAttestor", [zeroAddress])).error).toBe("ZeroAddress");
  });

  it("une rotation de l'attestor invalide les anciennes signatures", async () => {
    const deadline = inTenMinutes();
    const sig = await attest(player.address, 7n, deadline);
    await evm.write(ownerPk, contract, "setAttestor", [stranger.address]);
    expect((await evm.write(playerPk, contract, "claimTicket", [7n, deadline, sig])).error).toBe("BadSignature");
  });
});
