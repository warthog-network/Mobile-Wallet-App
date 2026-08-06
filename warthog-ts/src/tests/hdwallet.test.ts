import { test, expect } from "bun:test";
import { HDWallet } from "../types/HDWallet";
import { Account } from "../types/Account";

test("HDWallet.fromMnemonic return valid Account", () => {
  const mnemonic =
    "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
  const wallet = HDWallet.fromMnemonic(mnemonic);

  expect(wallet).not.toBeNull();
  const account = wallet.deriveAccountAtIndex(0);

  expect(account.address.hex.length).toBe(48);
  expect(account.privateKeyHex.length).toBe(64);
});

test("HDWallet.deriveAccountAtIndex(0) != deriveAccount(1)", () => {
  const mnemonic =
    "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
  const wallet = HDWallet.fromMnemonic(mnemonic);

  const account0 = wallet.deriveAccountAtIndex(0);
  const account1 = wallet.deriveAccountAtIndex(1);

  expect(account0.address.hex).not.toBe(account1.address.hex);
});

test("HDWallet full path derivation matches index method", () => {
  const mnemonic =
    "abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about";
  const wallet = HDWallet.fromMnemonic(mnemonic);

  const accountFromIndex = wallet.deriveAccountAtIndex(0);
  const accountFromPath = wallet.deriveAccountFromPath("0/0");

  expect(accountFromIndex.address.hex).toBe(accountFromPath.address.hex);
});
