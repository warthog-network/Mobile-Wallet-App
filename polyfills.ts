import { Buffer } from 'buffer';
import process from 'process';
import * as ExpoCrypto from 'expo-crypto';
import CryptoJS from 'crypto-js';

// Must run before warthog-ts / crypto-browserify / stream-browserify are imported.
global.Buffer = Buffer;
(global as typeof globalThis & { process: typeof process }).process = process;

const globalCrypto = global as typeof globalThis & { crypto: Crypto };

if (typeof globalCrypto.crypto === 'undefined') {
  globalCrypto.crypto = {
    getRandomValues: ExpoCrypto.getRandomValues,
  } as Crypto;
} else if (typeof globalCrypto.crypto.getRandomValues !== 'function') {
  (globalCrypto.crypto as { getRandomValues: unknown }).getRandomValues =
    ExpoCrypto.getRandomValues;
}

// Hermes ships no WebCrypto. Without this, every `globalThis.crypto?.subtle`
// branch in utils/crypto.ts and utils/passkeyWallet.ts is dead code: wallets
// silently fall back to CryptoJS AES-CBC while the envelope still advertises
// AES-GCM. quick-crypto provides a native implementation. Both call sites
// verify their own encrypt/decrypt round-trip, so an incomplete subtle
// degrades to the CryptoJS path instead of writing an unreadable blob.
if (!globalCrypto.crypto.subtle) {
  try {
    const quickCrypto = require('react-native-quick-crypto');
    const subtle = (quickCrypto?.default ?? quickCrypto)?.subtle;
    if (subtle) {
      Object.defineProperty(globalCrypto.crypto, 'subtle', {
        value: subtle,
        configurable: true,
        enumerable: true,
      });
    }
  } catch {
    /* native module absent (web build) — the CryptoJS fallback stays in charge */
  }
}

CryptoJS.lib.WordArray.random = (nBytes: number) => {
  const bytes = ExpoCrypto.getRandomBytes(nBytes);
  return CryptoJS.lib.WordArray.create(bytes);
};