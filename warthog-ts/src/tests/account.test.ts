import { test, expect } from "bun:test";
import { Account } from "../types/Account";
import { Address } from "../types/Address";

test("Account.fromRandom generates valid address", () => {
    const addr = Account.fromRandom();
    
    expect(addr.privateKeyHex.length).toBe(64);
    expect(addr.publicKeyHex.length).toBe(66);
    expect(addr.address.hex.length).toBe(48);
    
    expect(Address.validate(addr.address.hex)).toBe(true);
});

test("Account.fromPrivateKeyHex generates correct keys from known private key", () => {
    const privateKeyHex = "966a71a98bb5d13e9116c0dffa3f1a7877e45c6f563897b96cfd5c59bf0803e0";
    const addr = Account.fromPrivateKeyHex(privateKeyHex);
    
    expect(addr.privateKeyHex).toBe(privateKeyHex);
    expect(addr.publicKeyHex).toBe("02916a397088159baf27b3ce1271a859e3e6ea27db913a94086423e5867994e705");
    expect(addr.address.hex).toBe("3661579d61abde5837a8686dc4d65348a2fc61b1fe5f4093");
});

test("Address.validate returns false for invalid checksum", () => {
    const privateKeyHex = "966a71a98bb5d13e9116c0dffa3f1a7877e45c6f563897b96cfd5c59bf0803e0";
    const addr = Account.fromPrivateKeyHex(privateKeyHex);
    const address = addr.address.hex;
    const invalidAddress = address.slice(0, -8) + "00000000";
    
    expect(Address.validate(invalidAddress)).toBe(false);
});

test("Address.validate returns false for wrong length", () => {
    expect(Address.validate("abc123")).toBe(false);
    expect(Address.validate("a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9")).toBe(false);
});

test("Address.validate returns false for non-hex string", () => {
    // 48-character string with a non-hex character ('g') at the start.
    // Now correctly exercises the hex-decoding path, not just the length check.
    expect(Address.validate("g1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d20000")).toBe(false);
});

const KNOWN_PRIVATE_KEY =
    "966a71a98bb5d13e9116c0dffa3f1a7877e45c6f563897b96cfd5c59bf0803e0";
const KNOWN_PUBLIC_KEY =
    "02916a397088159baf27b3ce1271a859e3e6ea27db913a94086423e5867994e705";

test("Account.signBytes returns a valid Signature65", () => {
    const account = Account.fromPrivateKeyHex(KNOWN_PRIVATE_KEY);
    const sig = account.signBytes("hello");

    expect(sig.r.length).toBe(64);
    expect(sig.s.length).toBe(64);
    expect(sig.recid).toBeGreaterThanOrEqual(0);
    expect(sig.recid).toBeLessThanOrEqual(3);
    expect(sig.signature.length).toBe(130);
    expect(/^[0-9a-f]+$/.test(sig.signature)).toBe(true);
});

test("Account.signBytes is deterministic for the same input", () => {
    const account = Account.fromPrivateKeyHex(KNOWN_PRIVATE_KEY);
    const sig1 = account.signBytes("hello");
    const sig2 = account.signBytes("hello");

    expect(sig1.signature).toBe(sig2.signature);
});

test("Account.signBytes treats string and Uint8Array equivalently", () => {
    const account = Account.fromPrivateKeyHex(KNOWN_PRIVATE_KEY);
    const sigStr = account.signBytes("hello");
    const sigBuf = account.signBytes(Buffer.from("hello", "utf8"));

    expect(sigBuf.signature).toBe(sigStr.signature);
});

test("Account.signBytes works on empty input", () => {
    const account = Account.fromPrivateKeyHex(KNOWN_PRIVATE_KEY);
    const sig = account.signBytes("");

    expect(sig.r.length).toBe(64);
    expect(sig.s.length).toBe(64);
    expect(sig.recid).toBeGreaterThanOrEqual(0);
    expect(sig.recid).toBeLessThanOrEqual(3);
});

test("Account.recoverAddress round-trips a signBytes signature", () => {
    const account = Account.fromPrivateKeyHex(KNOWN_PRIVATE_KEY);
    const sig = account.signBytes("hello");

    const recovered = Account.recoverAddress("hello", sig);

    expect(recovered.hex).toBe(account.address.hex);
});

test("Account.recoverPublicKey round-trips a signBytes signature", () => {
    const account = Account.fromPrivateKeyHex(KNOWN_PRIVATE_KEY);
    const sig = account.signBytes("hello");

    const recovered = Account.recoverPublicKey("hello", sig);

    expect(recovered).toBe(KNOWN_PUBLIC_KEY);
});

test("Account.recoverPublicKey returns a different key for a tampered message", () => {
    const account = Account.fromPrivateKeyHex(KNOWN_PRIVATE_KEY);
    const sig = account.signBytes("hello");

    const tampered = Account.recoverPublicKey("hellp", sig);

    expect(tampered).not.toBe(account.publicKeyHex);
});

test("Account.recoverPublicKey is sensitive to the recovery id", () => {
    const account = Account.fromPrivateKeyHex(KNOWN_PRIVATE_KEY);
    const sig = account.signBytes("hello");

    const flipped = sig.signature.slice(0, 128) +
        ((sig.recid ^ 1) & 0xff).toString(16).padStart(2, "0");

    const recovered = Account.recoverPublicKey("hello", flipped);

    expect(recovered).not.toBe(account.publicKeyHex);
});

test("Account.recoverPublicKey accepts the 130-char hex signature string", () => {
    const account = Account.fromPrivateKeyHex(KNOWN_PRIVATE_KEY);
    const sig = account.signBytes("hello");

    const recovered = Account.recoverPublicKey("hello", sig.signature);

    expect(recovered).toBe(account.publicKeyHex);
});

test("Account.recoverPublicKey throws on an invalid signature string", () => {
    expect(() => Account.recoverPublicKey("hello", "abcd")).toThrow();
    expect(() =>
        Account.recoverPublicKey(
            "hello",
            "z".repeat(130)
        )
    ).toThrow();
    expect(() =>
        Account.recoverPublicKey(
            "hello",
            "ff".repeat(65)
        )
    ).toThrow();
});
