import { ethers } from "ethers";
import { Account } from "./Account";

/**
 * BIP-44 hierarchical deterministic wallet for Warthog.
 * Uses derivation path m/44'/2070'/0 for Warthog accounts.
 */
export class HDWallet {
  private rootNode: ethers.HDNodeWallet;

  private constructor(rootNode: ethers.HDNodeWallet) {
    this.rootNode = rootNode;
  }

  /**
   * Create an HDWallet from a BIP-39 mnemonic phrase.
   * @param mnemonic - Space-separated list of BIP-39 words (12, 15, 18, 21, or 24 words)
   * @returns HDWallet instance
   */
  public static fromMnemonic(mnemonic: string): HDWallet {
    const rootNode = ethers.HDNodeWallet.fromPhrase(
      mnemonic,
      "",
      "m/44'/2070'/0",
    );
    return new HDWallet(rootNode);
  }

  /**
   * Derive an account at a specific index.
   * Uses path m/44'/2070'/0/{index}.
   * @param index - Account index (non-negative integer)
   * @returns Account derived at the given index
   */
  public deriveAccountAtIndex(index: number): Account {
    return this.deriveAccountFromPath(`0/${index}`);
  }

  /**
   * Derive an account from a custom BIP-44 path.
   * @param path - BIP-44 derivation path (e.g., "0/0", "1/5")
   * @returns Account derived from the path
   */
  public deriveAccountFromPath(path: string): Account {
    const childNode = this.rootNode.derivePath(path);
    const privateKeyHex = childNode.privateKey.slice(2);
    return Account.fromPrivateKeyHex(privateKeyHex);
  }
}
