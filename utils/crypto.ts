// utils/crypto.ts - Crypto utilities extracted from Wallet.tsx

import { Buffer } from 'buffer';
import * as ExpoCrypto from 'expo-crypto';
import CryptoJS from 'crypto-js';
import { ethers } from 'ethers';
import { Account, Address } from 'warthog-ts';

import { WalletData } from '../types';
import { DERIVATION_PATHS, SATOSHI_MULTIPLIER } from '../constants';
import { getPasswordCipherFromBlob } from './passkeyWallet';

function accountToWalletData(
  account: Account,
  extra: Partial<WalletData> = {}
): WalletData {
  return {
    privateKey: account.privateKeyHex,
    publicKey: account.publicKeyHex,
    address: account.address.hex,
    ...extra,
  };
}

// Initialize global crypto polyfills
export const initCrypto = () => {
  global.Buffer = Buffer;

  // Set CryptoJS random generator first
  CryptoJS.lib.WordArray.random = (nBytes: number) => {
    const bytes = ExpoCrypto.getRandomBytes(nBytes);
    return CryptoJS.lib.WordArray.create(bytes);
  };

  // Only set global.crypto if not already set
  if (typeof global.crypto === 'undefined') {
    (global as any).crypto = {};
    (global as any).crypto.getRandomValues = ExpoCrypto.getRandomValues;
  }
};

// Convert WART to E8 (satoshis)
export const wartToE8 = (wart: string): number | null => {
  try {
    const num = parseFloat(wart);
    if (isNaN(num) || num <= 0) return null;
    return Math.round(num * SATOSHI_MULTIPLIER);
  } catch {
    return null;
  }
};

// Convert E8 to WART
export const e8ToWart = (e8: number): string => {
  return (e8 / SATOSHI_MULTIPLIER).toFixed(8);
};

// Generate new wallet with mnemonic
export const generateWallet = async (
  wordCount: number,
  pathType: 'hardened' | 'normal'
): Promise<WalletData> => {
  const strength = wordCount === 12 ? 16 : 32;

  try {
    const { getRandomBytesAsync } = ExpoCrypto;
    const entropy = await getRandomBytesAsync(strength);
    const mnemonicObj = ethers.Mnemonic.fromEntropy(ethers.hexlify(entropy));
    const path = DERIVATION_PATHS[pathType];
    const hd = ethers.HDNodeWallet.fromPhrase(mnemonicObj.phrase, '', path);

    const account = Account.fromPrivateKeyHex(hd.privateKey.slice(2));

    return accountToWalletData(account, {
      mnemonic: mnemonicObj.phrase,
      wordCount,
      pathType,
    });
  } catch (e: any) {
    throw new Error('Failed to generate secure random entropy: ' + e.message);
  }
};

// Derive wallet from mnemonic
export const deriveWallet = (
  mnemonic: string,
  wordCount: number,
  pathType: 'hardened' | 'normal'
): WalletData => {
  const words = mnemonic.trim().split(/\s+/);
  if (words.length !== wordCount) {
    throw new Error(`Must have exactly ${wordCount} words`);
  }

  const path = DERIVATION_PATHS[pathType];
  const hd = ethers.HDNodeWallet.fromPhrase(mnemonic, '', path);

  const account = Account.fromPrivateKeyHex(hd.privateKey.slice(2));

  return accountToWalletData(account, {
    mnemonic,
    wordCount,
    pathType,
  });
};

// Import wallet from private key
export const importWallet = (privateKey: string): WalletData => {
  if (privateKey.length !== 64) {
    throw new Error('Private key must be exactly 64 hex characters');
  }

  const account = Account.fromPrivateKeyHex(privateKey);
  return accountToWalletData(account);
};

// Encrypt wallet data (password ciphertext; may be embedded in multi-auth envelopes)
export const encryptWallet = (walletData: WalletData, password: string): string => {
  return CryptoJS.AES.encrypt(JSON.stringify(walletData), password).toString();
};

// Decrypt wallet data (raw CryptoJS cipher or multi-auth envelope password field)
export const decryptWallet = (encrypted: string, password: string): WalletData => {
  try {
    const cipher = getPasswordCipherFromBlob(encrypted);
    if (!cipher) {
      throw new Error(
        'This wallet has no password unlock — use biometrics, or re-save with a password',
      );
    }
    const bytes = CryptoJS.AES.decrypt(cipher, password);
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
    if (!decrypted) throw new Error('Wrong password or invalid encrypted data');
    return JSON.parse(decrypted);
  } catch (e: any) {
    if (e?.message && !/JSON|Utf8|Malformed/i.test(e.message)) throw e;
    throw new Error('Wrong password or invalid encrypted data');
  }
};

// Validate Warthog address
export const isValidAddress = (address: string): boolean => {
  const trimmed = address.trim().replace(/^0x/i, '');
  return Address.validate(trimmed);
};

// Abbreviate address/hash
export const abbreviate = (str: string, prefixLen = 6, suffixLen = 4): string => {
  if (!str || str.length <= prefixLen + suffixLen) return str || 'N/A';
  return `${str.slice(0, prefixLen)}...${str.slice(-suffixLen)}`;
};