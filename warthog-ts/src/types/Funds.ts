export const MAX_U64 = 0xffffffffffffffffn;

/**
 * Represents token's number of decimal place).
 * Valid range: 0-18. WART uses 8 decimal places.
 */
export class TokenDecimals {
    /** Pre-configured WART decimals (8 decimals) */
    public static readonly WART = new TokenDecimals(8);
    /** Pre-configured Liquidity decimals (8 decimals) */
    public static readonly LIQUIDITY = new TokenDecimals(8);

    /**
     * Create a TokenDecimals instance.
     * @param decimals - Number of decimal places (0-18)
     * @throws Error if decimals is out of range
     */
    constructor(public readonly decimals: number) {
        if (decimals < 0 || decimals > 18) {
            throw new Error("Invalid decimals");
        }
    }
}

/**
 * Represents a parsed decimal string as a 64-bit integer with decimal place info.
 * Used internally for parsing currency strings.
 */
export class ParsedFunds {
    val: bigint;
    decimalPlaces: number;

    constructor(val: bigint, decimalPlaces: number) {
        this.val = val;
        this.decimalPlaces = decimalPlaces;
    }

    /**
     * Parse a decimal string into a ParsedFunds.
     * @param s - Decimal string (e.g., "123.45")
     * @returns ParsedFunds or null if invalid
     */
    public static parse(s: string): ParsedFunds | null {
        const MAX_DIGITS = 20;

        let str = "";
        let digitsAfterDot = 0;
        let dotFound = false;

        for (const char of s) {
            if (char >= "0" && char <= "9") {
                if (str.length >= MAX_DIGITS) {
                    return null;
                }
                str += char;
                if (dotFound) {
                    digitsAfterDot++;
                }
            } else if (char === ".") {
                if (dotFound) {
                    return null;
                }
                dotFound = true;
            } else {
                return null;
            }
        }

        if (str.length === 0) {
            return null;
        }

        const val = BigInt(str);

        if (val > MAX_U64) {
            return null;
        }

        return new ParsedFunds(val, digitsAfterDot);
    }
}

/**
 * Convert ParsedFunds to a value for the given number of decimal places.
 * @param fd - Parsed funds to convert
 * @param decimals - Target decimal places
 * @returns Value as bigint or null if invalid
 */
function valueFrom(fd: ParsedFunds, decimals: number): bigint | null {
    if (fd.decimalPlaces > decimals) {
        return null;
    }

    const zeros = decimals - fd.decimalPlaces;
    let value = fd.val;

    for (let i = 0; i < zeros; i++) {
        if (MAX_U64 / 10n < value) {
            return null;
        }
        value *= 10n;
    }

    return value;
}

/**
 * Represents token amounts with specific number of decimals.
 */
export class Funds {
    amount: bigint;

    private constructor(amount: bigint) {
        this.amount = amount;
    }

    /**
     * Parse a decimal string to Funds.
     * @param string - Decimal string (e.g., "123.45")
     * @param decimals - Token decimals
     * @returns Funds or null if invalid
     */
    public static parse(string: string, decimals: TokenDecimals): Funds | null {
        const fd = ParsedFunds.parse(string);
        if (fd === null) return null;
        return Funds.fromParsedFunds(fd, decimals);
    }
    
    /**
     * Convert ParsedFunds to Funds with specific number of decimals.
     * @param fd - Parsed funds
     * @param decimals - Token decimals
     * @returns Funds or null if invalid
     */
    public static fromParsedFunds(fd: ParsedFunds, decimals: TokenDecimals): Funds | null {
        const value = valueFrom(fd, decimals.decimals);
        if (value === null) return null;
        return new Funds(value);
    }
}

/**
 * Represents Warthog's native token (WART) with 8 decimal places.
 */
export class Wart {
    /** Amount in E8 (1 WART = 100,000,000 E8) */
    E8: bigint;

    private constructor(E8: bigint) {
        this.E8 = E8;
    }

    /**
     * Parse a decimal string to Wart.
     * @param string - Decimal string (e.g., "1.5")
     * @returns Wart or null if invalid
     */
    public static parse(string: string): Wart | null {
        const fd = ParsedFunds.parse(string);
        if (fd === null) return null;
        return Wart.fromParsedFunds(fd);
    }

    /**
     * Convert ParsedFunds to Wart.
     * @param fd - Parsed funds
     * @returns Wart or null if invalid
     */
    public static fromParsedFunds(fd: ParsedFunds): Wart | null {
        const value = valueFrom(fd, TokenDecimals.WART.decimals);
        if (value === null) return null;
        return new Wart(value);
    }

    /**
     * Create Wart from E8 value.
     * @param E8 - Amount in E8 (1 WART = 100,000,000 E8)
     * @returns Wart or null if invalid (negative or exceeds MAX_U64)
     */
    public static fromE8(E8: bigint): Wart | null {
        if (E8 < 0n || E8 > MAX_U64) {
            return null;
        }
        return new Wart(E8);
    }

    /**
     * Convert to rounded fee.
     * @param ceil - If true, round up; otherwise round down
     * @returns RoundedFee
     */
    public roundedFee(ceil: boolean): RoundedFee {
        return RoundedFee.fromWart(this, ceil);
    }
}

/**
 * Represents liquidity pool tokens with 8 decimal places.
 * Used for liquidity deposit/withdrawal transactions.
 */
export class Liquidity {
    /** Amount in E8 (1 liquidity unit = 100,000,000 E8) */
    E8: bigint;

    private constructor(E8: bigint) {
        this.E8 = E8;
    }

    /**
     * Parse a decimal string to Liquidity.
     * @param string - Decimal string (e.g., "1.5")
     * @returns Liquidity or null if invalid
     */
    public static parse(string: string): Liquidity | null {
        const fd = ParsedFunds.parse(string);
        if (fd === null) return null;
        return Liquidity.fromParsedFunds(fd);
    }

    /**
     * Convert ParsedFunds to Liquidity.
     * @param fd - Parsed funds
     * @returns Liquidity or null if invalid
     */
    public static fromParsedFunds(fd: ParsedFunds): Liquidity | null {
        const value = valueFrom(fd, TokenDecimals.LIQUIDITY.decimals);
        if (value === null) return null;
        return new Liquidity(value);
    }

    /**
     * Create Liquidity from E8 value.
     * @param E8 - Amount in E8 (1 liquidity = 100,000,000 E8)
     * @returns Liquidity or null if invalid (negative or exceeds MAX_U64)
     */
    public static fromE8(E8: bigint): Liquidity | null {
        if (E8 < 0n || E8 > MAX_U64) {
            return null;
        }
        return new Liquidity(E8);
    }
}

/**
 * Transaction fee in rounded WART format.
 * 
 * This is NOT the 16-bit compact representation itself. Instead, it is the result of:
 * 1. Converting WART to 16-bit compact format (CompactFee)
 * 2. Converting back to WART scale
 * 
 * This is a lossy operation - the original WART value cannot be restored from RoundedFee.
 * Warthog nodes require rounded values on the 64-bit WART scale in API calls, not the
 * raw 16-bit compact representation.
 */
export class RoundedFee {
    private constructor(public readonly E8: bigint) {}

    /**
     * Create RoundedFee from Wart.
     * @param wart - Wart amount
     * @param ceil - If true, round up; otherwise round down
     * @returns RoundedFee
     */
    public static fromWart(wart: Wart, ceil: boolean): RoundedFee {
        const compactFee = CompactFee.fromWart(wart, ceil);
        const roundedWart = compactFee.toWart();
        return new RoundedFee(roundedWart.E8);
    }

    /**
     * Create RoundedFee from E8 value.
     * @param E8 - Fee in E8
     * @param ceil - If true, round up; otherwise round down
     * @returns RoundedFee or null if invalid
     */
    public static fromE8(E8: bigint, ceil: boolean): RoundedFee | null {
        const wart = Wart.fromE8(E8);
        if (wart === null) return null;
        return RoundedFee.fromWart(wart, ceil);
    }

    /**
     * Get minimum possible fee (0.00000001 WART = 1 E8).
     * @returns Minimum RoundedFee
     */
    public static min(): RoundedFee {
        return RoundedFee.fromE8(0n, false)!;
    }

    /**
     * Convert to Wart.
     * @returns Wart representation
     */
    public toWart(): Wart {
        return Wart.fromE8(this.E8)!;
    }
}

/**
 * Warthog's internal 16-bit compact fee representation.
 * Used for compact storage and transmission of transaction fees within the protocol.
 * Note: This is NOT used in transaction submission API - use RoundedFee instead.
 */
export class CompactFee {
    private constructor(public exponent: number, public mantissa: number) {}

    /**
     * Create CompactFee from Wart amount.
     * @param wart - Wart amount
     * @param ceil - If true, round up; otherwise round down
     * @returns CompactFee
     */
    public static fromWart(wart: Wart, ceil: boolean): CompactFee {
        if (wart.E8 === 0n){
            // ignore ceil and return smallest fee which corresponds to
            // 0.00000001 WART
            return new CompactFee(0, 0);
        }
        let e = 10;
        const threshold = 0x07FFn;
        let e8 = wart.E8;
        let exact = true;
        while (e8 > threshold) {
            e += 1;
            if (ceil && ((e8 & 1n) !== 0n)) {
                exact = false;
            }
            e8 >>= 1n;
        }
        if (ceil && exact === false) {
            e8 += 1n;
            if (e8 > threshold) {
                e8 >>= 1n;
                e += 1;
                if (e > 53)
                    return new CompactFee(15, 1023);
            }
        }
        while (e8 < 0x0400n) {
            e -= 1;
            e8 <<= 1n;
        }
        return new CompactFee(e, Number(e8 - 0x0400n));
    }

    /**
     * Convert CompactFee to Wart.
     * @returns Wart representation
     */
    public toWart(): Wart {
        if (this.exponent < 10) {
            return Wart.fromE8(BigInt(1024 + this.mantissa) >> BigInt(10 - this.exponent))!;
        } else {
            return Wart.fromE8(BigInt(1024 + this.mantissa) << BigInt(this.exponent - 10))!;
        }
    }
}
