import { Account } from '../src/types/Account';
import { Address } from '../src/types/Address';
import { WarthogApi } from '../src/types/Api';
import { TransactionContext, TransactionJson } from '../src/types/TransactionContext';
import { NonceId } from '../src/types/NonceId';
import { Price } from '../src/types/Price';
import { Funds, Liquidity, RoundedFee, TokenDecimals, Wart } from '../src/types/Funds';

const account = Account.fromRandom();

console.log('Private Key:', account.privateKeyHex);
console.log('Public Key:', account.publicKeyHex);
console.log('Address:', account.address.hex);

const existingAccount = Account.fromPrivateKeyHex(
    '966a71a98bb5d13e9116c0dffa3f1a7877e45c6f563897b96cfd5c59bf0803e0'
);

console.log('Loaded Address:', existingAccount.address.hex);

const api = new WarthogApi('http://127.0.0.1:3100');

async function submit(txJson: TransactionJson) {
    const label = txJson.type;
    const result = await api.submitTransaction(txJson);
    if (result.success) {
        console.log(`${label} submitted successfully!`);
        console.log('Transaction hash:', result.data.txHash);
    } else {
        console.error(`${label} failed:`, result.error);
    }
}

async function runExamples() {
    // Create a single context and reuse it for all transactions
    const context = await api.createTransactionContext(RoundedFee.min(), NonceId.fromNumber(0)!);

    // WART transfer
    context.nonceId = NonceId.fromNumber(1)!;
    await submit(
        context.transferWart(
            existingAccount,
            Address.fromHex('0000000000000000000000000000000000000000de47c9b2')!,
            Wart.fromE8(100000000n)!
        )
    );

    // Asset transfer (transfer regular tokens)
    context.nonceId = NonceId.fromNumber(2)!;
    await submit(
        context.transferAsset(
            existingAccount,
            'f45b113119c7f7c000234f1090d5d181ab60b8b24526f1edd2f563aa1ca329f2',
            Address.fromHex('0000000000000000000000000000000000000000de47c9b2')!,
            Funds.parse('1000', TokenDecimals.WART)!
        )
    );

    // Liquidity transfer (transfer liquidity pool tokens)
    context.nonceId = NonceId.fromNumber(3)!;
    await submit(
        context.transferLiquidity(
            existingAccount,
            'f45b113119c7f7c000234f1090d5d181ab60b8b24526f1edd2f563aa1ca329f2',
            Address.fromHex('0000000000000000000000000000000000000000de47c9b2')!,
            Liquidity.fromE8(100n)!
        )
    );

    // Limit buy (spend WART to buy tokens)
    context.nonceId = NonceId.fromNumber(5)!;
    // Note: The number of decimals (4) must be obtained from the API's token information
    // for the asset being traded. Different tokens have different number of decimals.
    const dec4 = new TokenDecimals(4);
    const price = Price.fromNumberDecimals(1.0, dec4, false)!;
    console.log('Price hex:', price.toHex());
    await submit(
        context.buy(
            existingAccount,
            'f45b113119c7f7c000234f1090d5d181ab60b8b24526f1edd2f563aa1ca329f2',
            Wart.fromE8(100000000n)!,
            price
        )
    );

    // Limit sell (sell tokens for WART)
    context.nonceId = NonceId.fromNumber(6)!;
    await submit(
        context.sell(
            existingAccount,
            'f45b113119c7f7c000234f1090d5d181ab60b8b24526f1edd2f563aa1ca329f2',
            Funds.parse('1000', dec4)!,
            price
        )
    );

    // Liquidity deposit into pool
    context.nonceId = NonceId.fromNumber(7)!;
    await submit(
        context.depositLiquidity(
            existingAccount,
            'f45b113119c7f7c000234f1090d5d181ab60b8b24526f1edd2f563aa1ca329f2',
            Funds.parse('1000', dec4)!,
            Wart.fromE8(100000000n)!
        )
    );

    // Liquidity withdrawal from pool
    context.nonceId = NonceId.fromNumber(8)!;
    await submit(
        context.withdrawLiquidity(
            existingAccount,
            'f45b113119c7f7c000234f1090d5d181ab60b8b24526f1edd2f563aa1ca329f2',
            Liquidity.fromE8(100n)!
        )
    );

    // Cancelation
    context.nonceId = NonceId.fromNumber(9)!;
    await submit(
        context.cancelTransaction(existingAccount, 0, NonceId.fromNumber(1)!)
    );

    // Asset creation
    context.nonceId = NonceId.fromNumber(10)!;
    const dec5 = new TokenDecimals(5); // new asset with 5 decimal digits
    await submit(
        context.createAssets(existingAccount, Funds.parse('10000', dec5)!, dec5, 'TOK2')
    );
}

runExamples();
