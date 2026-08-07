/**
 * Multi-auth wallet envelopes for mobile (WartBunker-compatible shape).
 *
 * Passkey on mobile = device biometrics (Face ID / fingerprint / device PIN)
 * via expo-local-authentication + AES key in SecureStore (mode: 'device').
 *
 * Envelope (JSON stored as warthogWallet_*):
 *  {
 *    v: 1,
 *    kind: 'warthog-wallet-v1',
 *    addressHint, require2fa,
 *    password: string | null,
 *    passkey: { credentialId, rpId, mode:'device', ciphertext, ... } | null
 *  }
 */
import * as ExpoCrypto from 'expo-crypto';
import * as LocalAuthentication from 'expo-local-authentication';
import * as SecureStore from 'expo-secure-store';
import CryptoJS from 'crypto-js';
import type { WalletData } from '../types';

const ENVELOPE_KIND = 'warthog-wallet-v1';
const ENVELOPE_V = 1;
const DEVICE_KEY_PREFIX = 'warthog-passkey-device-';

export type PasskeyBlock = {
  credentialId: string;
  rpId: string;
  mode: 'device' | 'prf';
  prfSalt?: string | null;
  iv?: string;
  ciphertext: string;
  transports?: string[];
  platformPreferred?: boolean;
  /** Mobile uses CryptoJS AES with a SecureStore-held key. */
  mobileCrypto?: 'cryptojs-aes';
};

export type WalletEnvelope = {
  v: number;
  kind: string;
  addressHint: string;
  require2fa: boolean;
  password: string | null;
  passkey: PasskeyBlock | null;
};

export type BlobInspect = {
  hasPassword: boolean;
  hasPasskey: boolean;
  passkeyMode: string | null;
  require2fa: boolean;
  addressHint: string;
  envelope: WalletEnvelope | null;
};

function randomHex(bytes: number): string {
  const arr = ExpoCrypto.getRandomBytes(bytes);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function shortAddressHint(address?: string): string {
  const a = String(address || '').replace(/^0x/i, '');
  if (a.length < 12) return a || '';
  return `${a.slice(0, 6)}…${a.slice(-4)}`;
}

function walletPayload(data: WalletData): WalletData {
  return {
    privateKey: data.privateKey,
    publicKey: data.publicKey,
    address: data.address,
    mnemonic: data.mnemonic,
    wordCount: data.wordCount,
    pathType: data.pathType,
  };
}

export function tryParseEnvelope(raw: string | null | undefined): WalletEnvelope | null {
  if (raw == null || raw === '') return null;
  const s = String(raw).trim();
  if (!s.startsWith('{')) return null;
  try {
    const obj = JSON.parse(s) as WalletEnvelope;
    if (obj && obj.kind === ENVELOPE_KIND && Number(obj.v) === ENVELOPE_V) return obj;
    return null;
  } catch {
    return null;
  }
}

export function serializeEnvelope(env: WalletEnvelope): string {
  return JSON.stringify(env);
}

export function getPasswordCipherFromBlob(raw: string | null | undefined): string | null {
  const env = tryParseEnvelope(raw);
  if (env) return env.password || null;
  return raw == null || raw === '' ? null : String(raw);
}

export function inspectWalletBlob(raw: string | null | undefined): BlobInspect {
  const env = tryParseEnvelope(raw);
  if (!env) {
    return {
      hasPassword: Boolean(raw),
      hasPasskey: false,
      passkeyMode: null,
      require2fa: false,
      addressHint: '',
      envelope: null,
    };
  }
  const hasPassword = Boolean(env.password);
  const hasPasskey = Boolean(env.passkey?.credentialId && env.passkey?.ciphertext);
  return {
    hasPassword,
    hasPasskey,
    passkeyMode: env.passkey?.mode || null,
    require2fa: Boolean(env.require2fa) && hasPassword && hasPasskey,
    addressHint: env.addressHint || '',
    envelope: env,
  };
}

export function authBadgeForBlob(raw: string | null | undefined): string {
  const info = inspectWalletBlob(raw);
  if (info.require2fa) return 'Password + biometrics (2FA)';
  if (info.hasPasskey && info.hasPassword) return 'Biometrics or password';
  if (info.hasPasskey) return 'Biometrics (this device)';
  if (info.hasPassword) return 'Password';
  return 'Saved';
}

export async function isBiometricsAvailable(): Promise<boolean> {
  try {
    const hasHardware = await LocalAuthentication.hasHardwareAsync();
    const enrolled = await LocalAuthentication.isEnrolledAsync();
    return hasHardware && enrolled;
  } catch {
    return false;
  }
}

export async function biometricsLabel(): Promise<string> {
  try {
    const types = await LocalAuthentication.supportedAuthenticationTypesAsync();
    if (types.includes(LocalAuthentication.AuthenticationType.FACIAL_RECOGNITION)) {
      return 'Face ID';
    }
    if (types.includes(LocalAuthentication.AuthenticationType.FINGERPRINT)) {
      return 'Fingerprint';
    }
    if (types.includes(LocalAuthentication.AuthenticationType.IRIS)) {
      return 'Iris';
    }
  } catch {
    /* ignore */
  }
  return 'Biometrics';
}

async function assertBiometrics(promptMessage: string): Promise<void> {
  const available = await isBiometricsAvailable();
  if (!available) {
    throw new Error(
      'Biometrics are not available — enable Face ID / fingerprint / device lock in system settings',
    );
  }
  const result = await LocalAuthentication.authenticateAsync({
    promptMessage,
    cancelLabel: 'Cancel',
    disableDeviceFallback: false,
    fallbackLabel: 'Use device PIN',
  });
  if (!result.success) {
    throw new Error(
      result.error === 'user_cancel' || result.error === 'system_cancel'
        ? 'Biometric unlock cancelled'
        : result.error || 'Biometric unlock failed',
    );
  }
}

function deviceKeyStoreId(credentialId: string): string {
  // SecureStore keys must be alphanumeric + . - _
  const safe = credentialId.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 80);
  return `${DEVICE_KEY_PREFIX}${safe}`;
}

/**
 * Encrypt wallet under a new biometric-gated device key.
 */
export async function encryptWithNewBiometrics(
  walletData: WalletData,
  { displayName }: { displayName?: string } = {},
): Promise<{ passkey: PasskeyBlock }> {
  if (!walletData?.privateKey || !walletData?.address) {
    throw new Error('Invalid wallet data for biometric encryption');
  }

  await assertBiometrics(
    displayName
      ? `Enable biometric unlock for “${displayName}”`
      : 'Enable biometric unlock for this wallet',
  );

  const credentialId = randomHex(16);
  const deviceKey = randomHex(32);
  const payload = walletPayload(walletData);
  const ciphertext = CryptoJS.AES.encrypt(
    JSON.stringify(payload),
    deviceKey,
  ).toString();

  await SecureStore.setItemAsync(deviceKeyStoreId(credentialId), deviceKey);

  return {
    passkey: {
      credentialId,
      rpId: 'mobile',
      mode: 'device',
      ciphertext,
      transports: ['internal'],
      platformPreferred: true,
      mobileCrypto: 'cryptojs-aes',
    },
  };
}

export async function decryptWithBiometrics(
  passkeyBlock: PasskeyBlock,
): Promise<WalletData> {
  if (!passkeyBlock?.credentialId || !passkeyBlock?.ciphertext) {
    throw new Error('This wallet has no biometric unlock');
  }

  await assertBiometrics('Unlock wallet with biometrics');

  const deviceKey = await SecureStore.getItemAsync(
    deviceKeyStoreId(passkeyBlock.credentialId),
  );
  if (!deviceKey) {
    throw new Error(
      'Device key missing (app data cleared or different device). Unlock with password or seed, then re-enable biometrics.',
    );
  }

  try {
    const bytes = CryptoJS.AES.decrypt(passkeyBlock.ciphertext, deviceKey);
    const decrypted = bytes.toString(CryptoJS.enc.Utf8);
    if (!decrypted) throw new Error('decrypt failed');
    const data = JSON.parse(decrypted) as WalletData;
    if (!data?.privateKey || !data?.address) {
      throw new Error('Decrypted wallet data is invalid');
    }
    return data;
  } catch {
    throw new Error(
      'Biometric unlock failed — wrong device key or corrupted wallet data',
    );
  }
}

export async function buildEnvelopeWithBiometrics(
  walletData: WalletData,
  {
    displayName,
    existingPasswordCipher = null,
    previousEnvelope = null,
    require2fa = false,
  }: {
    displayName?: string;
    existingPasswordCipher?: string | null;
    previousEnvelope?: WalletEnvelope | null;
    require2fa?: boolean;
  } = {},
): Promise<{ envelope: WalletEnvelope }> {
  const { passkey } = await encryptWithNewBiometrics(walletData, { displayName });
  const prev =
    previousEnvelope && previousEnvelope.kind === ENVELOPE_KIND
      ? previousEnvelope
      : null;

  if (prev?.passkey?.credentialId && prev.passkey.credentialId !== passkey.credentialId) {
    await cleanupDeviceKey(prev.passkey.credentialId);
  }

  const password =
    existingPasswordCipher != null
      ? existingPasswordCipher
      : prev?.password != null
        ? prev.password
        : null;

  const want2fa = Boolean(require2fa);
  if (want2fa && !password) {
    throw new Error(
      '2FA needs a password as well — set a password, then enable password + biometrics',
    );
  }

  return {
    envelope: {
      v: ENVELOPE_V,
      kind: ENVELOPE_KIND,
      addressHint: shortAddressHint(walletData.address),
      require2fa: want2fa && Boolean(password),
      password,
      passkey,
    },
  };
}

export function envelopeWithPassword(
  walletData: WalletData,
  passwordCipher: string,
  previous: WalletEnvelope | null = null,
  { require2fa }: { require2fa?: boolean } = {},
): WalletEnvelope {
  const base: WalletEnvelope =
    previous && previous.kind === ENVELOPE_KIND
      ? { ...previous }
      : {
          v: ENVELOPE_V,
          kind: ENVELOPE_KIND,
          addressHint: shortAddressHint(walletData?.address),
          require2fa: false,
          password: null,
          passkey: null,
        };
  base.addressHint =
    shortAddressHint(walletData?.address) || base.addressHint;
  base.password = passwordCipher;
  if (typeof require2fa === 'boolean') {
    base.require2fa =
      require2fa && Boolean(passwordCipher) && Boolean(base.passkey);
  } else if (base.require2fa && !passwordCipher) {
    base.require2fa = false;
  }
  return base;
}

export async function unlockEnvelopeWith2fa(
  envelope: WalletEnvelope,
  password: string,
  decryptPasswordFn: (cipher: string, password: string) => WalletData,
): Promise<WalletData> {
  if (!envelope?.password || !envelope?.passkey) {
    throw new Error('2FA unlock needs both password and biometrics on this wallet');
  }
  if (!password) throw new Error('Password is required for 2FA unlock');

  let fromPassword: WalletData;
  try {
    fromPassword = decryptPasswordFn(envelope.password, password);
  } catch {
    throw new Error('Invalid password');
  }

  const fromBio = await decryptWithBiometrics(envelope.passkey);
  const a = String(fromPassword?.address || '')
    .replace(/^0x/i, '')
    .toLowerCase();
  const b = String(fromBio?.address || '')
    .replace(/^0x/i, '')
    .toLowerCase();
  if (!a || !b || a !== b) {
    throw new Error(
      'Password and biometrics unlocked different keys — re-enable unlock methods',
    );
  }

  return {
    ...fromPassword,
    ...fromBio,
    privateKey: fromBio.privateKey || fromPassword.privateKey,
    publicKey: fromBio.publicKey || fromPassword.publicKey,
    address: fromBio.address || fromPassword.address,
  };
}

async function cleanupDeviceKey(credentialId: string): Promise<void> {
  try {
    await SecureStore.deleteItemAsync(deviceKeyStoreId(credentialId));
  } catch {
    /* ignore */
  }
}

export async function cleanupPasskeyStorage(
  raw: string | null | undefined,
): Promise<void> {
  const env = tryParseEnvelope(raw);
  if (env?.passkey?.credentialId) {
    await cleanupDeviceKey(env.passkey.credentialId);
  }
}
