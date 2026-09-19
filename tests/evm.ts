/**
 * Harnais EVM en mémoire sur @ethereumjs/vm — remplace Foundry/anvil pour les tests.
 * Chain ID 10143 et hardfork Prague : même domaine EIP-712 et mêmes opcodes que sur Monad.
 */
import { createBlock } from "@ethereumjs/block";
import { createCustomCommon, Hardfork, Mainnet, type Common } from "@ethereumjs/common";
import { createFeeMarket1559Tx } from "@ethereumjs/tx";
import { bytesToHex, createAccount, createAddressFromString, hexToBytes } from "@ethereumjs/util";
import { createVM, runTx, type VM } from "@ethereumjs/vm";
import {
  decodeErrorResult,
  decodeFunctionResult,
  encodeDeployData,
  encodeFunctionData,
  parseEventLogs,
  type Abi,
  type Address,
  type Hex,
  type Log,
} from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { MONAD_TESTNET_ID } from "@/shared/chain";

export interface TxOutcome {
  ok: boolean;
  /** Nom de l'erreur custom Solidity si la tx a reverté. */
  error: string | null;
  logs: Log[];
  createdAddress: Address | null;
  gasUsed: bigint;
}

export class Evm {
  private height = 1n;

  private constructor(
    readonly vm: VM,
    readonly common: Common,
    readonly abi: Abi,
  ) {}

  readonly chainId = MONAD_TESTNET_ID;

  static async create(abi: Abi): Promise<Evm> {
    const common = createCustomCommon({ chainId: MONAD_TESTNET_ID }, Mainnet, { hardfork: Hardfork.Prague });
    return new Evm(await createVM({ common }), common, abi);
  }

  private block(timestamp = Math.floor(Date.now() / 1000)) {
    return createBlock(
      { header: { number: this.height++, timestamp: BigInt(timestamp), baseFeePerGas: 1n, gasLimit: 30_000_000n } },
      { common: this.common },
    );
  }

  async fund(address: Address, wei = 10n ** 20n) {
    await this.vm.stateManager.putAccount(createAddressFromString(address), createAccount({ balance: wei }));
  }

  private async send(pk: Hex, to: Address | null, data: Hex): Promise<TxOutcome> {
    const from = createAddressFromString(privateKeyToAccount(pk).address);
    const nonce = (await this.vm.stateManager.getAccount(from))?.nonce ?? 0n;
    const tx = createFeeMarket1559Tx(
      {
        chainId: BigInt(this.chainId),
        nonce,
        maxFeePerGas: 10n,
        maxPriorityFeePerGas: 0n,
        gasLimit: 5_000_000n,
        to: to ?? undefined,
        data: hexToBytes(data),
      },
      { common: this.common },
    ).sign(hexToBytes(pk));

    const res = await runTx(this.vm, { tx, block: this.block(), skipBlockGasLimitValidation: true });
    const logs = res.receipt.logs.map(
      ([address, topics, logData]) =>
        ({ address: bytesToHex(address), topics: topics.map((t) => bytesToHex(t)), data: bytesToHex(logData) }) as Log,
    );
    let error: string | null = null;
    if (res.execResult.exceptionError) {
      const ret = bytesToHex(res.execResult.returnValue) as Hex;
      error = ret === "0x" ? String(res.execResult.exceptionError.error) : decodeErrorResult({ abi: this.abi, data: ret }).errorName;
    }
    return {
      ok: !res.execResult.exceptionError,
      error,
      logs,
      createdAddress: res.createdAddress ? (res.createdAddress.toString() as Address) : null,
      gasUsed: res.totalGasSpent,
    };
  }

  async deploy(pk: Hex, bytecode: Hex, args: readonly unknown[]): Promise<Address> {
    const out = await this.send(pk, null, encodeDeployData({ abi: this.abi, bytecode, args }));
    if (!out.ok || !out.createdAddress) throw new Error(`déploiement échoué : ${out.error}`);
    return out.createdAddress;
  }

  async write(pk: Hex, to: Address, functionName: string, args: readonly unknown[] = []): Promise<TxOutcome> {
    return this.send(pk, to, encodeFunctionData({ abi: this.abi, functionName, args }));
  }

  async read<T = unknown>(to: Address, functionName: string, args: readonly unknown[] = []): Promise<T> {
    const data = encodeFunctionData({ abi: this.abi, functionName, args });
    await this.vm.stateManager.checkpoint();
    try {
      const res = await this.vm.evm.runCall({
        to: createAddressFromString(to),
        data: hexToBytes(data),
        gasLimit: 10_000_000n,
        block: this.block(),
      });
      if (res.execResult.exceptionError) throw new Error(`lecture ${functionName} a reverté`);
      return decodeFunctionResult({
        abi: this.abi,
        functionName,
        data: bytesToHex(res.execResult.returnValue) as Hex,
      }) as T;
    } finally {
      await this.vm.stateManager.revert();
    }
  }

  events(out: TxOutcome, eventName: string) {
    return parseEventLogs({ abi: this.abi, logs: out.logs, eventName });
  }
}
