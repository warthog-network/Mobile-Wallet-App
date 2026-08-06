# warthog-ts

A TypeScript library for the Warthog cryptocurrency.

## Get Started

This guide covers all the core types and how they work together.

### Account

Create or load accounts to sign transactions.

```typescript
import { Account } from 'warthog-ts';

// Generate a new random account (contains private key)
const account = Account.fromRandom();
console.log('New address:', account.getAddress().hex);
console.log('Private key:', account.getPrivateKeyHex());

// Load an existing account from a private key
const existing = Account.fromPrivateKeyHex('your-private-key-hex');
console.log('Loaded address:', existing.getAddress().hex);
```

### Address

Warthog uses 20-byte addresses with SHA-256 checksums. The Address class handles validation and creation.

```typescript
import { Address } from 'warthog-ts';

// Create from 48-character hex string (with checksum)
const addr1 = Address.fromHex('0000000000000000000000000000000000000000de47c9b2');
// Returns null if invalid
if (addr1 === null) {
    console.error('Invalid address');
}

// Create from 40-character raw hex (20 bytes, no checksum)
const addr2 = Address.fromRaw('0000000000000000000000000000000000000000de47c9b2');

// Validate any address string
const isValid = Address.validate('0000000000000000000000000000000000000000de47c9b2');
console.log('Valid:', isValid);  // true
```

### ParsedFunds and TokenDecimals

Parse currency strings into structured data.

```typescript
import { ParsedFunds, TokenDecimals, Funds } from 'warthog-ts';

// Parse a decimal string into its components
const pf = ParsedFunds.parse('123.45');
// Result: { val: 12345n, decimalPlaces: 2 }

// Convert to a specific token decimals (e.g., WART has 8 decimals)
const decimals = new TokenDecimals(8);  // Validates range 0-18
const funds = Funds.fromParsedFunds(pf!, decimals);
console.log('Funds:', funds?.amount);  // 12345000000n
```

### Wart

WART is Warthog's native token with 8 decimal places. Use Wart for amounts.

```typescript
import { Wart } from 'warthog-ts';

// Parse from string (e.g., "1.5" WART = 150000000 E8)
const wart = Wart.parse('1.5');

// Create directly from E8 (validated against MAX_U64)
const wart2 = Wart.fromE8(150000000n);

// Parse invalid string (e.g., too many decimals)
const invalid = Wart.parse('1.123456789');  // Too many decimal places
console.log('Invalid:', invalid);  // null
```

### RoundedFee

Transaction fees must be in a specific format (compact 16-bit representation). Use RoundedFee to create valid fees.

```typescript
import { RoundedFee, Wart } from 'warthog-ts';

// Minimum possible fee (0.00000001 WART = 1 E8)
const minFee = RoundedFee.min();

// Create fee from E8 value
// Second parameter determines rounding: true = ceil, false = floor
const fee = RoundedFee.fromE8(1000n, false);

// Round a Wart amount to a valid fee
const wart = Wart.parse('1.00000005')!;
const roundedFee = RoundedFee.fromWart(wart, false);

// Convert fee back to Wart if needed
const asWart = fee.toWart();
```

### NonceId

Every transaction needs a unique nonce (32-bit unsigned integer).

```typescript
import { NonceId } from 'warthog-ts';

// Create from a number (validates 32-bit range)
const nonce = NonceId.fromNumber(12345);
// Returns null if out of range

// Generate a random nonce
const randomNonce = NonceId.random();

// Validate any number
const isValid = NonceId.validate(12345);
console.log('Valid:', isValid);  // true
```

### Full Transaction Flow

Putting it all together - create and submit a transaction:

```typescript
import {
    Account,
    Address,
    RoundedFee,
    Wart,
    NonceId,
    WarthogApi
} from 'warthog-ts';

// 1. Load your account
const account = Account.fromPrivateKeyHex('your-private-key');

// 2. Prepare the recipient address
const recipient = Address.fromHex('0000000000000000000000000000000000000000de47c9b2')!;

// 3. Connect to the API
const api = new WarthogApi('https://api.warthog.example');

// 4. Create a transaction context (fetches chain pin automatically)
const context = await api.createTransactionContext(
    RoundedFee.min(),    // Use minimum fee 0.00000001 WART
    NonceId.random()     // Generate random nonce
);

// 5. Build the transaction
const tx = context.wartTransfer(
    account,         // Signing account
    recipient,       // Recipient address
    Wart.fromE8(100000000n)!  // 1 WART in E8
);

// 6. Submit to the network
const result = await api.submitTransaction(tx);
if (result.success) {
    console.log('Transaction hash:', result.data.txHash);
} else {
    console.error('Error:', result.error);
}
```

### Other Transaction Types

```typescript
// Asset Transfer
context.transferAsset(
    account,
    'asset-hash-hex',                                 // Asset hash
    recipient,
    Funds.parse('1000', new TokenDecimals(4))!       // Asset units
);

// Liquidity Transfer (transfer liquidity pool tokens)
context.transferLiquidity(
    account,
    'asset-hash-hex',                                 // Asset hash
    recipient,
    Liquidity.fromE8(100n)!                           // Liquidity units
);

// Buy (spend WART to buy tokens)
context.buy(
    account,
    'asset-hash-hex',
    Wart.fromE8(100000000n)!,                         // WART amount
    price  // Price object
);

// Sell (sell tokens for WART)
context.sell(
    account,
    'asset-hash-hex',
    Funds.parse('1000', new TokenDecimals(4))!,      // Asset amount
    price                                             // Price object
);

// Deposit Liquidity
context.depositLiquidity(
    account,
    'asset-hash-hex',
    Funds.parse('1000', new TokenDecimals(4))!,      // Asset amount
    Wart.fromE8(100000000n)!                          // WART amount
);

// Withdraw Liquidity
context.withdrawLiquidity(
    account,
    'asset-hash-hex',
    Liquidity.fromE8(100n)!                           // Liquidity units
);

// Cancel Transaction
context.cancelTransaction(account, cancelHeight, cancelNonceId);

// Create Assets
context.createAssets(
    account,
    Funds.parse('1000000', new TokenDecimals(10))!,  // Total supply
    TokenDecimals.WART,                              // Decimals
    'MYTOKEN'                                        // Asset name
);
```

## Platform Support

This library works in:
- ✅ Node.js (no additional setup)
- ✅ React Native (requires Buffer polyfill)
- ✅ Browsers (requires Buffer polyfill)

## Installation

```bash
npm install warthog-ts ethers
```

## React Native Setup

For React Native, you need to polyfill Buffer:

```typescript
import { Buffer } from 'buffer';

// In your app initialization
global.Buffer = Buffer;
```

## Dependencies

This library requires:
- `ethers` ^6.0.0 (peer dependency)
- `elliptic` ^6.6.1 (bundled)

## Development

To install dependencies:

```bash
bun install
```

To run tests:

```bash
bun test
```

To build:

```bash
bun run build
```

## Examples

Run examples with bun:

```bash
bun run examples/transactions.ts
```

### Available Examples

- `examples/transactions.ts` - Generate wallet and send all transaction types:
  - WART Transfer
  - Token Transfer
  - Limit Swap
  - Liquidity Deposit
  - Liquidity Withdrawal
  - Cancelation
  - Asset Creation

This project was created using `bun init` in bun v1.3.9. [Bun](https://bun.com) is a fast all-in-one JavaScript runtime.
