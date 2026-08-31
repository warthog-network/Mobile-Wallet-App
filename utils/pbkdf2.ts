// utils/pbkdf2.ts - PBKDF2-SHA256 for wallet password encryption.

import { pbkdf2 as noblePbkdf2 } from '@noble/hashes/pbkdf2';
import { sha256 } from '@noble/hashes/sha2';

/**
 * 210k iterations costs several seconds in interpreted JS on Hermes and tens of
 * milliseconds through OpenSSL, so we prefer the native implementation.
 *
 * Every wallet already on disk was encrypted under a key derived by
 * @noble/hashes. Swapping implementations is only safe if the replacement is
 * byte-for-byte identical, so the native path is proven against noble on a
 * fixed vector before it ever touches real wallet data. A mismatch, a throw, or
 * a missing native module pins us to noble for the rest of the session.
 */

const DK_LEN = 32;
const DIGEST = 'sha256';

type Pbkdf2Sync = (
  password: Uint8Array,
  salt: Uint8Array,
  iterations: number,
  keylen: number,
  digest: string,
) => ArrayBufferView;

let native: Pbkdf2Sync | null | undefined;

function toBytes(view: ArrayBufferView): Uint8Array {
  // Copy — do not alias a pooled native Buffer.
  const src = new Uint8Array(view.buffer, view.byteOffset, view.byteLength);
  const out = new Uint8Array(src.length);
  out.set(src);
  return out;
}

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

function withNoble(
  password: Uint8Array,
  salt: Uint8Array,
  iterations: number,
): Uint8Array {
  return noblePbkdf2(sha256, password, salt, { c: iterations, dkLen: DK_LEN });
}

/** Resolve the native implementation once, and only if it agrees with noble. */
function resolveNative(): Pbkdf2Sync | null {
  if (native !== undefined) return native;
  native = null;
  try {
    const mod = require('react-native-quick-crypto');
    const fn: unknown = (mod?.default ?? mod)?.pbkdf2Sync;
    if (typeof fn !== 'function') return native;

    // Non-ASCII on purpose: the most likely way a native KDF diverges is by
    // encoding the password differently (UTF-8 vs. UTF-16 vs. low-byte).
    const probePw = new TextEncoder().encode('pässwörd-🔑-probe');
    const probeSalt = new Uint8Array(16);
    for (let i = 0; i < probeSalt.length; i++) probeSalt[i] = (i * 7 + 1) & 0xff;

    const candidate = toBytes(
      (fn as Pbkdf2Sync)(probePw, probeSalt, 1000, DK_LEN, DIGEST),
    );
    if (sameBytes(candidate, withNoble(probePw, probeSalt, 1000))) {
      native = fn as Pbkdf2Sync;
    }
  } catch {
    native = null;
  }
  return native;
}

/**
 * Derive a 32-byte AES key. Identical output to the pure-JS path by
 * construction — see the self-test in resolveNative().
 */
export function derivePbkdf2Key(
  password: string,
  salt: Uint8Array,
  iterations: number,
): Uint8Array {
  // Encode up front so both implementations receive the exact same bytes and
  // neither gets to decide how a JS string becomes a byte string.
  const passwordBytes = new TextEncoder().encode(password);
  const fn = resolveNative();
  if (fn) {
    try {
      return toBytes(fn(passwordBytes, salt, iterations, DK_LEN, DIGEST));
    } catch {
      native = null; // stay on noble for the rest of the session
    }
  }
  return withNoble(passwordBytes, salt, iterations);
}

/** True when the fast native KDF passed its self-test and is in use. */
export function isNativeKdfActive(): boolean {
  return resolveNative() !== null;
}
