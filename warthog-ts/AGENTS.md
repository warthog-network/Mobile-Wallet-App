# AGENTS.md - Warthog TypeScript Library

## Overview

Warthog is a cryptocurrency. This library provides type-safe primitives for building and submitting transactions on the Warthog network.

## Important Constants

- **MAX_U64** = `0xffffffffffffffffn` (18,446,744,073,709,551,615) - Maximum 64-bit unsigned integer
- **MAX_U32** = `0xFFFFFFFF` (4,294,967,295) - Maximum 32-bit unsigned integer
- **WART decimals** = 8 decimal places (1 WART = 100,000,000 E8)

## Core Types

### Address
**File:** `src/types/Address.ts`

Warthog uses 20-byte addresses with SHA-256 checksums (48-character hex string).

```typescript
import { Address } from 'warthog-ts';

// Create from 48-char hex string (with checksum)
Address.fromHex('0000000000000000000000000000000000000000de47c9b2')

// Create from 40-char raw hex (20 bytes, no checksum)
Address.fromRaw('0000000000000000000000000000000000000000')

// Validate any address string
Address.validate('0000000000000000000000000000000000000000de47c9b2')
```

### NonceId
**File:** `src/types/NonceId.ts`

Every transaction needs a unique nonce (32-bit unsigned integer: 0 to 4,294,967,295).

```typescript
import { NonceId } from 'warthog-ts';

// Create from number (validates 32-bit range)
NonceId.fromNumber(12345)

// Generate random nonce
NonceId.random()

// Validate any number
NonceId.validate(12345)
```

### TokenDecimals
**File:** `src/types/Funds.ts`

Represents token decimal decimals (0-18). WART has 8 decimal places.

```typescript
import { TokenDecimals } from 'warthog-ts';

// WART decimals (8 decimals)
TokenDecimals.WART

// Custom number of decimals
new TokenDecimals(4)
```

### ParsedFunds
**File:** `src/types/Funds.ts`

Parses a decimal string into integer and decimals components.

```typescript
import { ParsedFunds } from 'warthog-ts';

const parsed = ParsedFunds.parse('123.45');
// Result: { val: 12345n, decimalPlaces: 2 }
```

### Funds
**File:** `src/types/Funds.ts`

Represents token amounts with specific number of decimals.

```typescript
import { Funds, TokenDecimals } from 'warthog-ts';

Funds.parse('123.45', new TokenDecimals(4))  // Returns Funds with amount 123450000n
```

### Wart
**File:** `src/types/Funds.ts`

Warthog's native token with 8 decimal places.

```typescript
import { Wart } from 'warthog-ts';

// Parse from string ("1.5" WART = 150000000 E8)
Wart.parse('1.5')

// Create directly from E8 (validated against MAX_U64)
Wart.fromE8(150000000n)

// Convert to rounded fee
wart.roundedFee(ceil: boolean)
```

### Liquidity
**File:** `src/types/Funds.ts`

Liquidity pool tokens with 8 decimal places. Used for liquidity deposit/withdrawal transactions.

```typescript
import { Liquidity } from 'warthog-ts';

// Parse from string ("1.5" = 150000000 E8)
Liquidity.parse('1.5')

// Create directly from E8 (validated against MAX_U64)
Liquidity.fromE8(150000000n)
```

### RoundedFee
**File:** `src/types/Funds.ts`

Transaction fees in rounded WART format (on 64-bit WART scale).

This is NOT the 16-bit compact representation. It is the result of:
1. Converting WART to 16-bit compact format (CompactFee)
2. Converting back to WART scale

This is a lossy operation - the original WART value cannot be restored.
Warthog nodes require rounded values on the 64-bit WART scale in API calls.

```typescript
import { RoundedFee, Wart } from 'warthog-ts';

// Minimum fee (0.00000001 WART)
RoundedFee.min()

// Create from E8 value
RoundedFee.fromE8(1000n, false)  // false = floor, true = ceil

// Round from Wart
RoundedFee.fromWart(wart, false)

// Convert back to Wart
fee.toWart()
```

### CompactFee
**File:** `src/types/Funds.ts`

Warthog's internal 16-bit compact fee representation.
Used for compact storage and transmission within the protocol.
Note: This is NOT used in transaction submission API - use RoundedFee instead.

```typescript
import { CompactFee, Wart } from 'warthog-ts';

// Create from Wart
CompactFee.fromWart(wart, ceil: boolean)

// Convert back to Wart
compactFee.toWart()
```

### Price
**File:** `src/types/Price.ts`

Represents swap prices with normalized mantissa/exponent format.

- **Mantissa:** 16 bits, must be in range [0x8000, 0xFFFF] (high bit set for normalization)
- **Exponent:** 8 bits, range [0, 127] (stored as raw + 63)

```typescript
import { Price, TokenDecimals } from 'warthog-ts';

// Maximum price
Price.max()

// Create from mantissa/exponent (supply raw values before +63 adjustment)
Price.fromMantissaExponent(mantissa, exponent)

// Parse from 6-char hex
Price.fromHex('c0e74d')

// Create from double with specified number of base asset decimals 
// quote asset, i.e. WART decimals is always 8 so it is not passed as a parameter
Price.fromNumberDecimals(1.5, TokenDecimals.WART, false)

// Convert to hex for transaction generation
price.toHex()

// Convert to double (raw, without decimals adjustment)
price.toDoubleRaw()

// Convert to double (with decimals adjustment)
price.toDoubleAdjusted(TokenDecimals.WART)
```

## Account & Wallets

### Account
**File:** `src/types/Account.ts`

Wallet account for signing transactions.

```typescript
import { Account } from 'warthog-ts';

// Generate new random account (contains private key)
Account.fromRandom()

// Load from private key hex
Account.fromPrivateKeyHex('private-key-hex')

// Public fields (no getters)
account.address           // Address
account.privateKeyHex     // 64-char hex
account.publicKeyHex      // 66-char compressed pubkey hex

// Sign arbitrary bytes (UTF-8 string or Uint8Array).
// Internally SHA-256's the message — same hashing scheme as transactions.
const sig = account.signBytes('hello world')
// sig: { r: string; s: string; recid: number; signature: string }
// sig.signature is the 130-char hex (r || s || recid) wire format.

// Recover the public key that produced a signature.
const pubkeyHex = Account.recoverPublicKey('hello world', sig)

// Recover the Warthog address that produced a signature.
const addr = Account.recoverAddress('hello world', sig)
// addr.hex matches the signer

// Both recovery methods accept either a Signature65 object or the
// 130-char hex `signature` string.
```

### HDWallet
**File:** `src/types/HDWallet.ts`

BIP-44 hierarchical deterministic wallet.

```typescript
import { HDWallet } from 'warthog-ts';

// Create from mnemonic
HDWallet.fromMnemonic('word1 word2 ...')

// Derive account at index
wallet.deriveAccountAtIndex(index)
```

## Transaction Building

### TransactionContext
**File:** `src/types/TransactionContext.ts`

Creates signed transactions. Obtain via `WarthogApi.createTransactionContext()`.

```typescript
import { TransactionContext } from 'warthog-ts';

// WART transfer
context.transferWart(
    account: Account,
    recipient: Address,
    amount: Wart
)

// Asset transfer (transfer regular tokens)
context.transferAsset(
    account: Account,
    asset: string,      // Asset hash hex
    recipient: Address,
    amount: Funds       // Token amount, internally an integer with respect to the assets number of decimals
)

// Liquidity transfer (transfer liquidity pool tokens)
context.transferLiquidity(
    account: Account,
    asset: string,      // Asset hash hex
    recipient: Address,
    units: Liquidity    // Liquidity units, internally an integer with 8 decimal places
)

// Buy (spend WART to buy tokens)
context.buy(
    account: Account,
    asset: string,     // Asset hash hex
    wartAmount: Wart,  // WART amount to spend
    limit: Price       // Limit price, internally a floating point representation with respect to the assets number of decimals
)

// Sell (sell tokens for WART)
context.sell(
    account: Account,
    asset: string,      // Asset hash hex
    tokenAmount: Funds, // Token amount to sell
    limit: Price        // Limit price, internally a floating point representation with respect to the assets number of decimals
)

// Deposit liquidity into pool
context.depositLiquidity(
    account: Account,
    asset: string,     // Asset hash hex
    tokenAmount: Funds,
    wartAmount: Wart
)

// Withdraw liquidity from pool
context.withdrawLiquidity(
    account: Account,
    asset: string,    // Asset hash hex
    units: Liquidity
)

// Cancel transaction
context.cancelTransaction(
    account: Account,
    cancelHeight: number,
    cancelNonceId: NonceId
)

// Create assets
context.createAssets(
    account: Account,
    totalSupply: Funds,
    decimals: TokenDecimals,
    name: string
)
```

## API Communication

### WarthogApi
**File:** `src/types/Api.ts`

Connects to Warthog node.

```typescript
import { WarthogApi } from 'warthog-ts';

// Connect to node
const api = new WarthogApi('https://api.warthog.example');

// Create transaction context (fetches chain pin)
await api.createTransactionContext(fee, nonce)

// Submit transaction
await api.submitTransaction(tx)

// Get account balance
await api.getBalance(address)

// Get token balance
await api.getTokenBalance(address, asset)

// Get chain height
await api.getHeight()
```

## Common Patterns

### Full Transaction Flow

```typescript
import {
    Account,
    Address,
    RoundedFee,
    Wart,
    NonceId,
    WarthogApi
} from 'warthog-ts';

// 1. Load account
const account = Account.fromPrivateKeyHex('private-key');

// 2. Prepare recipient
const recipient = Address.fromHex('address-hex')!;

// 3. Connect to API
const api = new WarthogApi('https://api.warthog.example');

// 4. Create transaction context
const context = await api.createTransactionContext(
    RoundedFee.min(),
    NonceId.random()
);

// 5. Build and sign transaction
const tx = context.wartTransfer(account, recipient, Wart.fromE8(100000000n)!);

// 6. Submit
const result = await api.submitTransaction(tx);
```

## Testing

Run tests:
```bash
bun test
```

Run examples:
```bash
bun run examples/transactions.ts
```

## Building

Build the library:
```bash
bun run build
```
