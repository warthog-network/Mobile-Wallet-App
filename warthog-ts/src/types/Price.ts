const MIN_MANTISSA = 0x8000; // 0x8000 - minimum normalized mantissa (high bit set)
const MAX_MANTISSA = 0xFFFF; // 0xFFFF - maximum mantissa (16 bits)

import { frexp } from '../util/frexp';
import { TokenDecimals } from './Funds';
export { TokenDecimals };

/**
 * Represents a swap price in normalized mantissa/exponent format.
 * - Mantissa: 16 bits, must be in range [0x8000, 0xFFFF] (high bit set for normalization)
 * - Exponent: 8 bits, stored with offset +63 internally to map to range [0, 127]
 * The price is interpreted as a qutient of the base and quote amount *integers*, i.e. when
 * creating or printing this price representation, one must account for the number of 
 * decimals of the involved base asset traded. 
 * 
 * Used in limit swap transactions.
 */
export class Price {
    private constructor(
        public readonly mantissa: number,  // 16 bits
        public readonly exponent: number    // 8 bits
    ) {}

    /**
     * Check if a mantissa is valid (normalized, high bit set).
     * @param m - Mantissa value to check
     * @returns true if in range [0x8000, 0xFFFF]
     */
    private static isMantissa(m: number): boolean {
        // Must have high bit set (normalized): 0x8000 <= m <= 0xFFFF
        return m >= MIN_MANTISSA && m <= MAX_MANTISSA;
    }

    /**
     * Check if a internal exponent representation is valid.
     * @param e - Exponent value to check
     * @returns true if in range [0, 127]
     */
    private static isExponent(e: number): boolean {
        return e >= 0 && e < 128;
    }

    /**
     * Get the maximum possible price.
     * @returns Price with maximum mantissa (0xFFFF) and exponent (127)
     */
    public static max(): Price {
        // Returns 0xFFFF mantissa with 0x7F exponent
        return new Price(0xFFFF, 127);
    }

    /**
     * Convert stored internal exponent to base-2 exponent.
     * @returns Base-2 exponent (exponent - 63)
     */
    private exponentBase2(): number {
        return this.exponent - 63;
    }

    /**
     * Get the base-2 exponent if mantissa is not considered as 
     * a fraction but as an integer.
     * @returns Base-2 exponent for mantissa
     */
    public mantissaExponent2(): number {
        return this.exponentBase2() - 16;
    }

    /**
     * Convert price to raw double (without decimals adjustment).
     * @returns Price as double (mantissa * 2^exponent2)
     */
    public toDoubleRaw(): number {
        // Equivalent to std::ldexp(m, e2) = m * 2^e2
        return this.mantissa * Math.pow(2, this.mantissaExponent2());
    }

    /**
     * Convert price to double corrected for asset decimals. In Warthog, every
     * market is with respect to WART as quote asset, which always has 8 decimals
     * so we only need to pass the base, i.e. asset decimals.
     * @param dec - Number decimal places of the traded asset
     * @returns Price as double with decimal places adjustment applied
     */
    public toDoubleAdjusted(dec: TokenDecimals): number {
        // Compute double price respecting the asset decimals
        const b10e = this.base10_decimals_exponent(dec);
        return this.toDoubleRaw() * Math.pow(10, -b10e);
    }

    /**
     * Calculate base-10 exponent for decimals adjustment.
     * @param dec - Number of decimals of the traded asset
     * @returns Difference between WART decimals (8) and asset decimals
     */
    private base10_decimals_exponent(dec: TokenDecimals): number {
        return TokenDecimals.WART.decimals - dec.decimals;
    }

    /**
     * Create Price from raw mantissa and exponent values.
     * @param mantissa - 16-bit mantissa (must be normalized: 0x8000-0xFFFF)
     * @param exponent - Raw exponent before +63 adjustment (0-127)
     * @returns Price instance if valid, null otherwise
     */
    public static fromMantissaExponent(mantissa: number, exponent: number): Price | null {
        exponent += 63;
        if (!Price.isExponent(exponent) || !Price.isMantissa(mantissa)) {
            return null;
        }
        return new Price(mantissa, exponent);
    }

    /**
     * Create Price from a number and given decimals of the base asset.
     * This is the recommended factory method for users.
     * @param d - Price as decimal number
     * @param baseDecimals - Number of decimals of the traded asset
     * @param ceil - If true, round up; otherwise round down
     * @returns Price instance if valid, null otherwise
     */
    public static fromNumberDecimals(d: number, baseDecimals: TokenDecimals, ceil: boolean = false): Price | null {
        const adjusted = d * Math.pow(10, 8 - baseDecimals.decimals);
        return Price.fromDoubleInternal(adjusted, ceil);
    }

    // This factory method should not be used by library users as it may be easily misused.
    // Warthog needs to specify the price in normalized form and this normalization depends
    // on the intended price AND the decimals of the asset that is traded. 
    // Warthog prices are with respect to the ratio of the raw 64 bit unsinged amounts of
    // WART and the traded token. Therefore, to normalize the price properly, users should
    // call the `fromNumberDecimals` method.
    public static fromDoubleInternal(d: number, ceil: boolean = false): Price | null {
        if (d <= 0 || !Number.isFinite(d)) {
            return null;
        }
        
        const [mantissa, exponent] = frexp(d);
        let mantissa32 = Math.floor(mantissa * 65536);
        let exp = exponent;
        
        const exact = (mantissa * 65536) === mantissa32;
        
        if (ceil && !exact) {
            mantissa32 += 1;
            if (mantissa32 >= 65536) { // carry
                mantissa32 >>= 1;
                exp += 1;
            }
        }
        return Price.fromMantissaExponent(mantissa32, exp);
    }

    /**
     * Convert price to 6-character hex string for transaction.
     * @returns Hex string (4 chars mantissa + 2 chars exponent)
     */
    public toHex(): string {
        const mantissaHex = this.mantissa.toString(16).padStart(4, '0');
        const exponentHex = this.exponent.toString(16).padStart(2, '0');
        return mantissaHex + exponentHex;
    }

    /**
     * Parse price from 6-character hex string.
     * @param hex - 6-character hex string (4 chars mantissa + 2 chars exponent)
     * @returns Price instance if valid, null otherwise
     */
    public static fromHex(hex: string): Price | null {
        if (hex.length !== 6) {
            return null;
        }

        const parsed = parseInt(hex, 16);
        if (isNaN(parsed)) {
            return null;
        }

        const mantissa = parsed >> 8;
        const exponent = parsed & 0xFF;

        if (!Price.isExponent(exponent) || !Price.isMantissa(mantissa)) {
            return null;
        }

        return new Price(mantissa, exponent);
    }
}
