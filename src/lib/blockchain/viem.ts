/**
 * BlockchainService réel : viem seul sur le wallet injecté (MetaMask), testnet Monad.
 * Pas de wagmi ni RainbowKit : ils imposeraient un project ID WalletConnect.
 *
 * Le jeu n'envoie jamais de tx à la place du joueur : chaque écriture ouvre le wallet.
 */
import {
  createPublicClient,
  createWalletClient,
  custom,
  getAddress,
  numberToHex,
  UserRejectedRequestError,
  type Address,
  type EIP1193Provider,
  type Hash,
  type PublicClient,
  type WalletClient,
} from "viem";
import { spermRaceAbi } from "@/lib/contract/spermRace";
import { monadTestnet, withGasMargin } from "@/shared/chain";
import type { AppConfig, Attestation, PlayerStatus } from "@/shared/types";
import { api } from "../api";
import { UserFacingError, type BlockchainService, type JoinOutcome, type OnStage, type TxTiming } from "./types";

/** Un transfert sans données coûte exactement 21 000 : Monad facture le limit, on ne met aucune marge. */
const PLAIN_TRANSFER_GAS = 21_000n;

// ─── Découverte du wallet (EIP-6963, repli sur window.ethereum) ──────────────

interface Eip6963Detail {
  info: { rdns: string; name: string };
  provider: EIP1193Provider;
}

async function discoverProvider(): Promise<EIP1193Provider | null> {
  if (typeof window === "undefined") return null;
  const found: Eip6963Detail[] = [];
  const onAnnounce = (e: Event) => found.push((e as CustomEvent<Eip6963Detail>).detail);
  window.addEventListener("eip6963:announceProvider", onAnnounce);
  window.dispatchEvent(new Event("eip6963:requestProvider"));
  await new Promise((r) => setTimeout(r, 250));
  window.removeEventListener("eip6963:announceProvider", onAnnounce);
  const metamask = found.find((d) => d.info.rdns === "io.metamask");
  const injected = (window as unknown as { ethereum?: EIP1193Provider }).ethereum ?? null;
  return metamask?.provider ?? found[0]?.provider ?? injected;
}

function friendly(e: unknown): Error {
  if (e instanceof UserFacingError) return e;
  const err = e as { code?: number; shortMessage?: string; message?: string; walk?: (f: (x: unknown) => boolean) => unknown };
  if (err?.code === 4001 || err instanceof UserRejectedRequestError || err?.walk?.((x) => x instanceof UserRejectedRequestError)) {
    return new UserFacingError("Signature cancelled in your wallet.");
  }
  return new UserFacingError(err?.shortMessage ?? err?.message ?? String(e));
}

export class ViemBlockchainService implements BlockchainService {
  readonly mode = "testnet" as const;
  private provider: EIP1193Provider | null = null;
  private wallet: WalletClient | null = null;
  private reader: PublicClient | null = null;
  private account: Address | null = null;
  private readonly chain;

  constructor(private readonly config: AppConfig) {
    this.chain = monadTestnet(config.rpcUrl, config.explorerUrl);
  }

  private get contract(): Address {
    if (!this.config.contract) throw new UserFacingError("The race contract is not deployed yet.");
    return this.config.contract;
  }

  private async init(): Promise<EIP1193Provider> {
    if (this.provider) return this.provider;
    const provider = await discoverProvider();
    if (!provider) throw new UserFacingError("No wallet found. Install MetaMask, then reload this page.");
    this.provider = provider;
    this.wallet = createWalletClient({ chain: this.chain, transport: custom(provider) });
    this.reader = createPublicClient({ chain: this.chain, transport: custom(provider) }) as PublicClient;
    return provider;
  }

  private async ensureChain() {
    const provider = await this.init();
    const hexId = numberToHex(this.config.chainId);
    const current = (await provider.request({ method: "eth_chainId" })) as string;
    if (current?.toLowerCase() === hexId) return;
    try {
      await provider.request({ method: "wallet_switchEthereumChain", params: [{ chainId: hexId }] });
    } catch (e) {
      const code = (e as { code?: number }).code;
      // 4902 : réseau inconnu du wallet. Certains wallets renvoient -32603 dans ce cas.
      if (code !== 4902 && code !== -32603) throw friendly(e);
      await provider.request({
        method: "wallet_addEthereumChain",
        params: [
          {
            chainId: hexId,
            chainName: "Monad Testnet",
            nativeCurrency: { name: "Monad", symbol: "MON", decimals: 18 },
            rpcUrls: [this.config.rpcUrl],
            blockExplorerUrls: [this.config.explorerUrl],
          },
        ],
      });
    }
  }

  async connectWallet(): Promise<Address> {
    const provider = await this.init();
    try {
      const accounts = (await provider.request({ method: "eth_requestAccounts" })) as string[];
      if (!accounts?.length) throw new UserFacingError("Your wallet did not share an account.");
      await this.ensureChain();
      this.account = getAddress(accounts[0]);
      return this.account;
    } catch (e) {
      throw friendly(e);
    }
  }

  async restoreWallet(): Promise<Address | null> {
    try {
      const provider = await this.init();
      const accounts = (await provider.request({ method: "eth_accounts" })) as string[];
      this.account = accounts?.[0] ? getAddress(accounts[0]) : null;
      return this.account;
    } catch {
      return null;
    }
  }

  onAccountChange(cb: (address: Address | null) => void): () => void {
    let provider: EIP1193Provider | null = null;
    const handler = (accounts: string[]) => {
      this.account = accounts?.[0] ? getAddress(accounts[0]) : null;
      cb(this.account);
    };
    void this.init()
      .then((p) => {
        provider = p;
        p.on("accountsChanged", handler as never);
      })
      .catch(() => undefined);
    return () => provider?.removeListener("accountsChanged", handler as never);
  }

  async getTransactionCount(address: Address): Promise<number> {
    return (await this.checkEligibility(address)).nonce;
  }

  /** Lu par le serveur : même RPC que l'attestation, donc même verdict. */
  async checkEligibility(address: Address): Promise<PlayerStatus> {
    return api<PlayerStatus>(`/api/player/${address}`);
  }

  private requireAccount(): Address {
    if (!this.account) throw new UserFacingError("Connect your wallet first.");
    return this.account;
  }

  /** Signature → diffusion → reçu, avec le chrono qui fait le pitch. */
  private async track(send: () => Promise<Hash>, onStage?: OnStage): Promise<TxTiming> {
    onStage?.({ stage: "signing" });
    let hash: Hash;
    try {
      await this.ensureChain();
      hash = await send();
    } catch (e) {
      throw friendly(e);
    }
    const sentAt = performance.now();
    onStage?.({ stage: "pending", hash, sentAt });
    const receipt = await this.reader!.waitForTransactionReceipt({ hash, pollingInterval: 100, timeout: 60_000 });
    const confirmedAt = performance.now();
    if (receipt.status !== "success") throw new UserFacingError("The transaction reverted on-chain.");
    const timing: TxTiming = { hash, sentAt, confirmedAt, ms: Math.round(confirmedAt - sentAt), blockNumber: receipt.blockNumber };
    onStage?.({ stage: "confirmed", timing });
    return timing;
  }

  async sendQualifyingTx(onStage?: OnStage): Promise<TxTiming> {
    const account = this.requireAccount();
    return this.track(
      () =>
        this.wallet!.sendTransaction({ account, chain: this.chain, to: account, value: 0n, gas: PLAIN_TRANSFER_GAS }),
      onStage,
    );
  }

  async claimTicket(onStage?: OnStage): Promise<TxTiming> {
    const account = this.requireAccount();
    const att = await api<Attestation>("/api/proof", { method: "POST", body: { address: account } });
    const args = [BigInt(att.txCount), BigInt(att.deadline), att.signature] as const;
    return this.track(async () => {
      const gas = await this.reader!.estimateContractGas({
        address: this.contract,
        abi: spermRaceAbi,
        functionName: "claimTicket",
        args,
        account,
      });
      return this.wallet!.writeContract({
        account,
        chain: this.chain,
        address: this.contract,
        abi: spermRaceAbi,
        functionName: "claimTicket",
        args,
        gas: withGasMargin(gas),
      });
    }, onStage);
  }

  async joinRace(raceId: string, name: string, onStage?: OnStage): Promise<JoinOutcome> {
    const account = this.requireAccount();
    const args = [BigInt(raceId)] as const;
    const timing = await this.track(async () => {
      const gas = await this.reader!.estimateContractGas({
        address: this.contract,
        abi: spermRaceAbi,
        functionName: "joinRace",
        args,
        account,
      });
      return this.wallet!.writeContract({
        account,
        chain: this.chain,
        address: this.contract,
        abi: spermRaceAbi,
        functionName: "joinRace",
        args,
        gas: withGasMargin(gas),
      });
    }, onStage);

    // Le ticket est brûlé : le serveur relit l'event RaceJoined puis admet le joueur.
    const out = await api<Omit<JoinOutcome, "timing">>("/api/join", {
      method: "POST",
      body: { address: account, txHash: timing.hash, name },
    });
    return { ...out, timing };
  }

  async submitResult(): Promise<never> {
    throw new Error("submitResult is signed by the server's owner key, never from the browser");
  }
}
