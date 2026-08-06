const MAX_U32 = 0xFFFFFFFF; // 4294967295

/**
 * Transaction nonce (32-bit unsigned integer).
 * Every transaction requires a unique nonce to prevent replay attacks.
 */
export class NonceId {
    private constructor(public readonly value: number) {}

    /**
     * Validate that a number is a valid 32-bit unsigned integer.
     * @param value - Number to validate
     * @returns true if in range [0, 0xFFFFFFFF]
     */
    public static validate(value: number): boolean {
        return value >= 0 && value <= MAX_U32;
    }

    /**
     * Create a NonceId from a number.
     * @param value - Nonce value (must be 32-bit unsigned integer)
     * @returns NonceId instance if valid, null otherwise
     */
    public static fromNumber(value: number): NonceId | null {
        if (!NonceId.validate(value)) {
            return null;
        }
        return new NonceId(value);
    }

    /**
     * Generate a random nonce.
     * @returns NonceId with random value in valid range
     */
    public static random(): NonceId {
        return new NonceId(Math.floor(Math.random() * MAX_U32));
    }
}
