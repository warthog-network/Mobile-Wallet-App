// utils/crypto.ts - Crypto utilities extracted from Wallet.tsx

import { Buffer } from 'buffer';
import * as ExpoCrypto from 'expo-crypto';
import CryptoJS from 'crypto-js';
import { pbkdf2 } from '@noble/hashes/pbkdf2';
import { sha256 } from '@noble/hashes/sha2';
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

export const WALLET_CRYPTO_VERSION = 3;
const PBKDF2_ITERATIONS = 210_000;

function b64(bytes: Uint8Array): string {
  let bin = '';
  bytes.forEach((b) => {
    bin += String.fromCharCode(b);
  });
  return globalThis.btoa(bin);
}
function unb64(s: string): Uint8Array {
  const bin = globalThis.atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function derivePbkdf2Key(password: string, salt: Uint8Array, iterations: number): Uint8Array {
  return pbkdf2(sha256, password, salt, { c: iterations, dkLen: 32 });
}

function bytesToWordArray(bytes: Uint8Array): CryptoJS.lib.WordArray {
  let hex = '';
  for (let i = 0; i < bytes.length; i++) {
    hex += bytes[i].toString(16).padStart(2, '0');
  }
  return CryptoJS.enc.Hex.parse(hex);
}

async function encryptV3(plaintext: string, password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const keyBytes = derivePbkdf2Key(password, salt, PBKDF2_ITERATIONS);
  const subtle = globalThis.crypto?.subtle;
  if (subtle) {
    try {
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const key = await subtle.importKey(
        'raw',
        keyBytes as BufferSource,
        'AES-GCM',
        false,
        ['encrypt'],
      );
      const ct = new Uint8Array(
        await subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(plaintext)),
      );
      return JSON.stringify({
        v: 3,
        kdf: 'pbkdf2-sha256',
        alg: 'aes-256-gcm',
        iter: PBKDF2_ITERATIONS,
        salt: b64(salt),
        iv: b64(iv),
        ct: b64(ct),
      });
    } catch {
      /* fall through to v2 CBC */
    }
  }
  return encryptV2WithKey(plaintext, keyBytes, salt);
}

async function decryptV3(envelope: { iter?: number; salt: string; iv: string; ct: string }, password: string): Promise<WalletData> {
  const iterations = Number(envelope.iter) > 0 ? Number(envelope.iter) : PBKDF2_ITERATIONS;
  const salt = unb64(envelope.salt);
  const keyBytes = derivePbkdf2Key(password, salt, iterations);
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error('Wrong password or invalid encrypted data');
  const key = await subtle.importKey(
    'raw',
    keyBytes as BufferSource,
    'AES-GCM',
    false,
    ['decrypt'],
  );
  const pt = await subtle.decrypt(
    { name: 'AES-GCM', iv: unb64(envelope.iv) as BufferSource },
    key,
    unb64(envelope.ct) as BufferSource,
  );
  return JSON.parse(new TextDecoder().decode(pt));
}

function encryptV2WithKey(plaintext: string, keyBytes: Uint8Array, salt: Uint8Array): string {
  const iv = CryptoJS.lib.WordArray.random(16);
  const encrypted = CryptoJS.AES.encrypt(plaintext, bytesToWordArray(keyBytes), {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });
  return JSON.stringify({
    v: 2,
    kdf: 'pbkdf2-sha256',
    iter: PBKDF2_ITERATIONS,
    salt: b64(salt),
    iv: CryptoJS.enc.Base64.stringify(iv),
    ct: CryptoJS.enc.Base64.stringify(encrypted.ciphertext),
  });
}

function decryptV2(envelope: { iter?: number; salt: string; iv: string; ct: string }, password: string): WalletData {
  const iterations = Number(envelope.iter) > 0 ? Number(envelope.iter) : PBKDF2_ITERATIONS;
  const salt = unb64(envelope.salt);
  const keyBytes = derivePbkdf2Key(password, salt, iterations);
  const iv = CryptoJS.enc.Base64.parse(envelope.iv);
  const ciphertext = CryptoJS.enc.Base64.parse(envelope.ct);
  const decrypted = CryptoJS.AES.decrypt({ ciphertext } as CryptoJS.lib.CipherParams, bytesToWordArray(keyBytes), {
    iv,
    mode: CryptoJS.mode.CBC,
    padding: CryptoJS.pad.Pkcs7,
  });
  const decryptedStr = decrypted.toString(CryptoJS.enc.Utf8);
  if (!decryptedStr) throw new Error('Wrong password or invalid encrypted data');
  return JSON.parse(decryptedStr);
}

export function normalizeImportedWallet(raw: unknown): WalletData {
  const row = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const mnemonicSrc = row.mnemonic ?? row.seedPhrase ?? row.seed ?? row.phrase;
  const mnemonic = Array.isArray(mnemonicSrc)
    ? mnemonicSrc.filter(Boolean).join(' ')
    : String(mnemonicSrc || '').trim();
  return {
    privateKey: String(row.privateKey || row.privateKeyHex || '')
      .trim()
      .replace(/^0x/i, ''),
    publicKey: String(row.publicKey || row.publicKeyHex || '')
      .trim()
      .replace(/^0x/i, ''),
    address: String(row.address || '')
      .trim()
      .replace(/^0x/i, ''),
    mnemonic: mnemonic || undefined,
    wordCount: typeof row.wordCount === 'number' ? row.wordCount : undefined,
    pathType: row.pathType === 'normal' || row.pathType === 'hardened' ? row.pathType : undefined,
  };
}

export const encryptWallet = async (walletData: WalletData, password: string): Promise<string> => {
  if (!password) throw new Error('Password is required');
  return encryptV3(JSON.stringify(normalizeImportedWallet(walletData)), password);
};

export const decryptWallet = async (encrypted: string, password: string): Promise<WalletData> => {
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
        if (envelope && envelope.ct && envelope.salt && envelope.iv) {
          if (Number(envelope.v) === 3 || envelope.alg === 'aes-256-gcm') {
            return normalizeImportedWallet(await decryptV3(envelope, password));
          }
          if (Number(envelope.v) === 2) {
            return normalizeImportedWallet(decryptV2(envelope, password));
          }
        }
      } catch (err: any) {
        if (err?.message && /Wrong password|Invalid password/i.test(err.message)) throw err;
        if (!(err instanceof SyntaxError)) throw err;
      }
    }
    const bytes = CryptoJS.AES.decrypt(inner, password);
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
    if (!decrypted) throw new Error('Wrong password or invalid encrypted data');
    return normalizeImportedWallet(JSON.parse(decrypted));
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