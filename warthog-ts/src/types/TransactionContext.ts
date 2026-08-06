import { Account } from './Account';
import { Address } from './Address';
import { NonceId } from './NonceId';
import { Price } from './Price';
import { Funds, Liquidity, RoundedFee, TokenDecimals, Wart } from './Funds';

const UINT32_BE_BYTES = 4;
const UINT64_BE_BYTES = 8;

export interface ChainPin {
    pinHash: string;
    pinHeight: number;
}

/**
 * JSON representation of a signed transaction for submission to Warthog nodes.
 */
export interface TransactionJson extends Record<string, unknown> {
    type: string;
}

/**
 * Transaction builder for creating and signing Warthog transactions.
 * Obtained via WarthogApi.createTransactionContext().
 *
 * All properties (chainPin, fee, nonceId) can be modified. When reusing this
 * context for multiple transactions, you MUST change the nonceId for each new
 * transaction to prevent nonce collisions. The chainPin should typically remain
 * unchanged unless you need to refresh it from the network.
 */
export class TransactionContext {
    /**
     * Create a new transaction context.
     * @param chainPin - Chain pin data from the network (can be refreshed)
     * @param fee - Transaction fee (can be modified for priority transactions)
     * @param nonceId - Unique nonce (must be changed for each new transaction)
     */
    constructor(
        public chainPin: ChainPin,
        public fee: RoundedFee,
        public nonceId: NonceId
    ) {}

    /**
     * Create a WART native token transfer transaction.
     * @param account - Account signing the transaction
     * @param toAddr - Recipient address
     * @param wart - Amount in WART (E8)
     * @returns Signed transaction JSON
     */
    transferWart(account: Account, toAddr: Address, wart: Wart): TransactionJson {
        const binary = Buffer.concat([
            hashToBytes(this.chainPin.pinHash),
            uint32BE(this.chainPin.pinHeight),
            uint32BE(this.nonceId.value),
            Buffer.alloc(3),
            uint64BE(this.fee.E8),
            addressToBytes(toAddr.hex),
            uint64BE(wart.E8),
        ]);
        const sig = account.signBytes(binary);

        // Mainnet accepts amountE8 (legacy / typed); DeFi accepts wartE8.
        // Send both so the same payload works on either node generation.
        return {
            type: 'wartTransfer',
            pinHeight: this.chainPin.pinHeight,
            nonceId: this.nonceId.value,
            feeE8: this.fee.E8,
            toAddr: toAddr.hex,
            wartE8: wart.E8,
            amountE8: wart.E8,
            signature65: sig.signature,
        };
    }

    /**
     * Create an asset transfer transaction.
     * @param account - Account signing the transaction
     * @param assetHash - Asset hash as hex string
     * @param toAddr - Recipient address
     * @param amount - Amount in token units
     * @returns Signed transaction JSON
     */
    transferAsset(
        account: Account,
        assetHash: string,
        toAddr: Address,
        amount: Funds
    ): TransactionJson {
        return this.tokenTransferInternal(account, assetHash, false, toAddr, amount.amount);
    }

    /**
     * Create a liquidity transfer transaction.
     * @param account - Account signing the transaction
     * @param assetHash - Asset hash as hex string
     * @param toAddr - Recipient address
     * @param units - Liquidity units to transfer
     * @returns Signed transaction JSON
     */
    transferLiquidity(
        account: Account,
        assetHash: string,
        toAddr: Address,
        units: Liquidity
    ): TransactionJson {
        return this.tokenTransferInternal(account, assetHash, true, toAddr, units.E8);
    }

    /**
     * Internal token transfer implementation.
     * @param account - Account signing the transaction
     * @param assetHash - Asset hash as hex string
     * @param isLiquidity - Whether this transfer is for an asset's liquidity or the asset itself
     * @param toAddr - Recipient address
     * @param amountE8 - Amount in E8
     * @returns Signed transaction JSON
     */
    private tokenTransferInternal(
        account: Account,
        assetHash: string,
        isLiquidity: boolean,
        toAddr: Address,
        amountE8: bigint
    ): TransactionJson {
        const binary = Buffer.concat([
            hashToBytes(this.chainPin.pinHash),
            uint32BE(this.chainPin.pinHeight),
            uint32BE(this.nonceId.value),
            Buffer.alloc(3),
            uint64BE(this.fee.E8),
            hashToBytes(assetHash),
            Buffer.from([isLiquidity ? 1 : 0]),
            addressToBytes(toAddr.hex),
            uint64BE(amountE8),
        ]);
        const sig = account.signBytes(binary);

        return {
            type: 'tokenTransfer',
            pinHeight: this.chainPin.pinHeight,
            nonceId: this.nonceId.value,
            feeE8: this.fee.E8,
            assetHash,
            isLiquidity,
            toAddr: toAddr.hex,
            amountU64: amountE8,
            signature65: sig.signature,
        };
    }

    /**
     * Create a limit buy transaction (buy token with WART).
     * @param account - Account signing the transaction
     * @param assetHash - Asset hash as hex string
     * @param wartAmount - WART amount to spend
     * @param limit - Limit price as Price object
     * @returns Signed transaction JSON
     */
    buy(account: Account, assetHash: string, wartAmount: Wart, limit: Price): TransactionJson {
        return this.limitSwapInternal(account, assetHash, true, wartAmount.E8, limit);
    }

    /**
     * Create a limit sell transaction (sell token for WART).
     * @param account - Account signing the transaction
     * @param assetHash - Asset hash as hex string
     * @param tokenAmount - Token amount to sell
     * @param limit - Limit price as Price object
     * @returns Signed transaction JSON
     */
    sell(account: Account, assetHash: string, tokenAmount: Funds, limit: Price): TransactionJson {
        return this.limitSwapInternal(account, assetHash, false, tokenAmount.amount, limit);
    }

    /**
     * Internal limit swap implementation.
     * @param account - Account signing the transaction
     * @param assetHash - Asset hash as hex string
     * @param isBuy - True to buy token with WART, false to sell token for WART
     * @param amountE8 - Amount in E8 (token units for sell, WART E8 for buy)
     * @param limit - Limit price as Price object
     * @returns Signed transaction JSON
     */
    private limitSwapInternal(
        account: Account,
        assetHash: string,
        isBuy: boolean,
        amountE8: bigint,
        limit: Price
    ): TransactionJson {
        const binary = Buffer.concat([
            hashToBytes(this.chainPin.pinHash),
            uint32BE(this.chainPin.pinHeight),
            uint32BE(this.nonceId.value),
            Buffer.alloc(3),
            uint64BE(this.fee.E8),
            hashToBytes(assetHash),
            Buffer.from([isBuy ? 1 : 0]),
            uint64BE(amountE8),
            Buffer.from(limit.toHex(), 'hex'),
        ]);
        const sig = account.signBytes(binary);

        return {
            type: 'limitSwap',
            pinHeight: this.chainPin.pinHeight,
            nonceId: this.nonceId.value,
            feeE8: this.fee.E8,
            assetHash,
            isBuy,
            amountU64: amountE8,
            limit: limit.toHex(),
            signature65: sig.signature,
        };
    }

    /**
     * Create a liquidity deposit transaction (add tokens + WART to liquidity pool).
     * @param account - Account signing the transaction
     * @param assetHash - Asset hash as hex string
     * @param tokenAmount - Token amount to deposit
     * @param wart - WART amount to deposit
     * @returns Signed transaction JSON
     */
    depositLiquidity(
        account: Account,
        assetHash: string,
        tokenAmount: Funds,
        wart: Wart
    ): TransactionJson {
        const binary = Buffer.concat([
            hashToBytes(this.chainPin.pinHash),
            uint32BE(this.chainPin.pinHeight),
            uint32BE(this.nonceId.value),
            Buffer.alloc(3),
            uint64BE(this.fee.E8),
            hashToBytes(assetHash),
            uint64BE(tokenAmount.amount),
            uint64BE(wart.E8),
        ]);
        const sig = account.signBytes(binary);

        return {
            type: 'liquidityDeposit',
            pinHeight: this.chainPin.pinHeight,
            nonceId: this.nonceId.value,
            feeE8: this.fee.E8,
            assetHash,
            amountU64: tokenAmount.amount,
            wartE8: wart.E8,
            signature65: sig.signature,
        };
    }

    /**
     * Create a liquidity withdrawal transaction (remove tokens + WART from liquidity pool).
     * @param account - Account signing the transaction
     * @param assetHash - Asset hash as hex string
     * @param units - Liquidity units to withdraw
     * @returns Signed transaction JSON
     */
    withdrawLiquidity(
        account: Account,
        assetHash: string,
        units: Liquidity
    ): TransactionJson {
        const binary = Buffer.concat([
            hashToBytes(this.chainPin.pinHash),
            uint32BE(this.chainPin.pinHeight),
            uint32BE(this.nonceId.value),
            Buffer.alloc(3),
            uint64BE(this.fee.E8),
            hashToBytes(assetHash),
            uint64BE(units.E8),
        ]);
        const sig = account.signBytes(binary);

        return {
            type: 'liquidityWithdrawal',
            pinHeight: this.chainPin.pinHeight,
            nonceId: this.nonceId.value,
            feeE8: this.fee.E8,
            assetHash,
            amountE8: units.E8,
            signature65: sig.signature,
        };
    }

    /**
     * Create a cancelTransaction transaction (cancel a pending limit order).
     * @param account - Account signing the transaction
     * @param cancelHeight - Block height at which the order was placed
     * @param cancelNonceId - NonceId of the order to cancel
     * @returns Signed transaction JSON
     */
    cancelTransaction(
        account: Account,
        cancelHeight: number,
        cancelNonceId: NonceId
    ): TransactionJson {
        const binary = Buffer.concat([
            hashToBytes(this.chainPin.pinHash),
            uint32BE(this.chainPin.pinHeight),
            uint32BE(this.nonceId.value),
            Buffer.alloc(3),
            uint64BE(this.fee.E8),
            uint32BE(cancelHeight),
            uint32BE(cancelNonceId.value),
        ]);
        const sig = account.signBytes(binary);

        return {
            type: 'cancelation',
            pinHeight: this.chainPin.pinHeight,
            nonceId: this.nonceId.value,
            feeE8: this.fee.E8,
            cancelHeight,
            cancelNonceId: cancelNonceId.value,
            signature65: sig.signature,
        };
    }

    /**
     * Create an asset creation transaction (create a new token).
     * @param account - Account signing the transaction
     * @param totalSupply - Total supply in token units
     * @param decimals - Token decimal places (0-18)
     * @param name - Token name (max 5 ASCII characters)
     * @returns Signed transaction JSON
     */
    createAssets(
        account: Account,
        totalSupply: Funds,
        decimals: TokenDecimals,
        name: string
    ): TransactionJson {
        const nameBuffer = Buffer.alloc(5);
        nameBuffer.write(name, 'ascii');
        const binary = Buffer.concat([
            hashToBytes(this.chainPin.pinHash),
            uint32BE(this.chainPin.pinHeight),
            uint32BE(this.nonceId.value),
            Buffer.alloc(3),
            uint64BE(this.fee.E8),
            uint64BE(totalSupply.amount),
            Buffer.from([decimals.decimals]),
            nameBuffer,
        ]);
        const sig = account.signBytes(binary);

        return {
            type: 'assetCreation',
            pinHeight: this.chainPin.pinHeight,
            nonceId: this.nonceId.value,
            feeE8: this.fee.E8,
            supplyU64: totalSupply.amount,
            decimals: decimals.decimals,
            name,
            signature65: sig.signature,
        };
    }
}

function uint32BE(value: number): Buffer {
    const buf = Buffer.alloc(UINT32_BE_BYTES);
    buf.writeUInt32BE(value, 0);
    return buf;
}

function uint64BE(value: bigint): Buffer {
    const buf = Buffer.alloc(UINT64_BE_BYTES);
    buf.writeBigUInt64BE(value, 0);
    return buf;
}

function addressToBytes(address: string): Buffer {
    return Buffer.from(address.slice(0, 40), 'hex');
}

function hashToBytes(hash: string): Buffer {
    return Buffer.from(hash, 'hex');
}
