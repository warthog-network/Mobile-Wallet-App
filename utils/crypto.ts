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

export const WALLET_CRYPTO_VERSION = 2;
const PBKDF2_ITERATIONS = 210_000;

function encryptV2(plaintext: string, password: string): string {
  const salt = CryptoJS.lib.WordArray.random(16);
  const iv = CryptoJS.lib.WordArray.random(16);
  const key = CryptoJS.PBKDF2(String(password), salt, {
    keySize: 256 / 32,
    iterations: PBKDF2_ITERATIONS,
    hasher: CryptoJS.algo.SHA256,
  });
  const encrypted = CryptoJS.AES.encrypt(plaintext, key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });
  return JSON.stringify({
    v: WALLET_CRYPTO_VERSION,
    kdf: 'pbkdf2-sha256',
    iter: PBKDF2_ITERATIONS,
    salt: CryptoJS.enc.Base64.stringify(salt),
    iv: CryptoJS.enc.Base64.stringify(iv),
    ct: CryptoJS.enc.Base64.stringify(encrypted.ciphertext),
  });
}

function decryptV2(envelope: { iter?: number; salt: string; iv: string; ct: string }, password: string): WalletData {
  const iterations = Number(envelope.iter) > 0 ? Number(envelope.iter) : PBKDF2_ITERATIONS;
  const salt = CryptoJS.enc.Base64.parse(envelope.salt);
  const iv = CryptoJS.enc.Base64.parse(envelope.iv);
  const ciphertext = CryptoJS.enc.Base64.parse(envelope.ct);
  const key = CryptoJS.PBKDF2(String(password), salt, {
    keySize: 256 / 32,
    iterations,
    hasher: CryptoJS.algo.SHA256,
  });
  const decrypted = CryptoJS.AES.decrypt({ ciphertext } as CryptoJS.lib.CipherParams, key, {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });
  const decryptedStr = decrypted.toString(CryptoJS.enc.Utf8);
  if (!decryptedStr) throw new Error('Wrong password or invalid encrypted data');
  return JSON.parse(decryptedStr);
}

export const encryptWallet = (walletData: WalletData, password: string): string => {
  if (!password) throw new Error('Password is required');
  return encryptV2(JSON.stringify(walletData), password);
};

export const decryptWallet = (encrypted: string, password: string): WalletData => {
  try {
    if (!password) throw new Error('Wrong password or invalid encrypted data');
    const cipher = getPasswordCipherFromBlob(encrypted);
    if (!cipher) {
      throw new Error(
        'This wallet has no password unlock — use biometrics, or re-save with a password',
      );
    }
    const inner = String(cipher).trim();
    if (inner.startsWith('{')) {
      try {
        const envelope = JSON.parse(inner);
        if (envelope && Number(envelope.v) === 2 && envelope.ct && envelope.salt && envelope.iv) {
          return decryptV2(envelope, password);
        }
      } catch (err: any) {
        if (err?.message && /Wrong password|Invalid password/i.test(err.message)) throw err;
        if (!(err instanceof SyntaxError)) throw err;
      }
    }
    const bytes = CryptoJS.AES.decrypt(inner, password);
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