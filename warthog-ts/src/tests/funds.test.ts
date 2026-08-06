import { test, expect } from "bun:test";
import { Funds, Liquidity, ParsedFunds, TokenDecimals, Wart, CompactFee } from "../types/Funds";

// Token Decimals tests
test("TokenDecimals rejects invalid decimals", () => {
    expect(() => new TokenDecimals(-1)).toThrow();
    expect(() => new TokenDecimals(19)).toThrow();
});

// ParsedFunds tests
test("ParsedFunds.parse valid input", () => {
    const pf = ParsedFunds.parse("1.123");
    expect(pf).not.toBeNull();
    expect(pf!.val).toBe(1123n);
    expect(pf!.decimalPlaces).toBe(3);
});
test("ParsedFunds.parse 101.123000", () => {
    const pf = ParsedFunds.parse("101.123000");
    expect(pf).not.toBeNull();
    expect(pf!.val).toBe(101123000n);
    expect(pf!.decimalPlaces).toBe(6);
});
test("ParsedFunds.parse 101.1230001111", () => {
    const pf = ParsedFunds.parse("101.1230001111");
    expect(pf).not.toBeNull();
    expect(pf!.val).toBe(1011230001111n);
    expect(pf!.decimalPlaces).toBe(10);
});
test("ParsedFunds.parse 101.00000000000000", () => {
    const pf = ParsedFunds.parse("101.00000000000000");
    expect(pf).not.toBeNull();
    expect(pf!.val).toBe(10100000000000000n);
    expect(pf!.decimalPlaces).toBe(14);
});
test("ParsedFunds.parse 123123101.001", () => {
    const pf = ParsedFunds.parse("123123101.001");
    expect(pf).not.toBeNull();
    expect(pf!.val).toBe(123123101001n);
    expect(pf!.decimalPlaces).toBe(3);
});
test("ParsedFunds.parse invalid inputs", () => {
    expect(ParsedFunds.parse("")).toBeNull();
    expect(ParsedFunds.parse(".")).toBeNull();
    expect(ParsedFunds.parse("abc")).toBeNull();
    expect(ParsedFunds.parse("1.1.1")).toBeNull();
    expect(ParsedFunds.parse("123456789012345678901")).toBeNull();
    expect(ParsedFunds.parse("18446744073709551616")).toBeNull();
});

// Funds tests
test("Funds.parse valid string input", () => {
    const f = Funds.parse("1.123", new TokenDecimals(4));
    expect(f).not.toBeNull();
    expect(f!.amount).toBe(11230n);
});
test("Funds.parse invalid due to decimals", () => {
    const f = Funds.parse("1.123", new TokenDecimals(2));
    expect(f).toBeNull();
});
test("Funds.fromParsedFunds", () => {
    const pf = new ParsedFunds(1123n, 3);
    const f = Funds.fromParsedFunds(pf, new TokenDecimals(4));
    expect(f).not.toBeNull();
    expect(f!.amount).toBe(11230n);
});
test("Funds.fromParsedFunds (uint64 conversion behavior) for parsed 1.123 with 0, 4, 12, 16 decimal places", () => {
    const s = "1.123";
    const pf = ParsedFunds.parse(s);
    expect(pf).not.toBeNull();
    expect(Funds.fromParsedFunds(pf!, new TokenDecimals(0))).toBeNull();
    const f4 = Funds.fromParsedFunds(pf!, new TokenDecimals(4));
    expect(f4).not.toBeNull();
    expect(f4!.amount).toBe(11230n);
    const f12 = Funds.fromParsedFunds(pf!, new TokenDecimals(12));
    expect(f12).not.toBeNull();
    expect(f12!.amount).toBe(1123000000000n);
    const f16 = Funds.fromParsedFunds(pf!, new TokenDecimals(16));
    expect(f16).not.toBeNull();
    expect(f16!.amount).toBe(11230000000000000n);
});
test("Funds.fromParsedFunds for parsed 101.123000 with 0, 4, 12, 16 decimal places", () => {
    const s = "101.123000";
    const pf = ParsedFunds.parse(s);
    expect(pf).not.toBeNull();
    expect(Funds.fromParsedFunds(pf!, new TokenDecimals(0))).toBeNull();
    expect(Funds.fromParsedFunds(pf!, new TokenDecimals(4))).toBeNull();
    const f12 = Funds.fromParsedFunds(pf!, new TokenDecimals(12));
    expect(f12).not.toBeNull();
    expect(f12!.amount).toBe(101123000000000n);
    const f16 = Funds.fromParsedFunds(pf!, new TokenDecimals(16));
    expect(f16).not.toBeNull();
    expect(f16!.amount).toBe(1011230000000000000n);
});
test("Funds.fromParsedFunds for parsed 101.1230001111 for 0, 4, 12, 16 decimal places", () => {
    const s = "101.1230001111";
    const pf = ParsedFunds.parse(s);
    expect(pf).not.toBeNull();
    expect(Funds.fromParsedFunds(pf!, new TokenDecimals(0))).toBeNull();
    expect(Funds.fromParsedFunds(pf!, new TokenDecimals(4))).toBeNull();
    const f12 = Funds.fromParsedFunds(pf!, new TokenDecimals(12));
    expect(f12).not.toBeNull();
    expect(f12!.amount).toBe(101123000111100n);
    const f16 = Funds.fromParsedFunds(pf!, new TokenDecimals(16));
    expect(f16).not.toBeNull();
    expect(f16!.amount).toBe(1011230001111000000n);
});
test("Funds.fromParsedFunds for parsed 101.00000000000000 for 0, 4, 12, 16 decimal places", () => {
    const s = "101.00000000000000";
    const pf = ParsedFunds.parse(s);
    expect(pf).not.toBeNull();
    expect(Funds.fromParsedFunds(pf!, new TokenDecimals(0))).toBeNull();
    expect(Funds.fromParsedFunds(pf!, new TokenDecimals(4))).toBeNull();
    expect(Funds.fromParsedFunds(pf!, new TokenDecimals(12))).toBeNull();
    const f16 = Funds.fromParsedFunds(pf!, new TokenDecimals(16));
    expect(f16).not.toBeNull();
    expect(f16!.amount).toBe(1010000000000000000n);
});
test("Funds.fromParsedFunds for parsed 123123101.001 for 0, 4, 12, 16 decimal places", () => {
    const s = "123123101.001";
    const pf = ParsedFunds.parse(s);
    expect(pf).not.toBeNull();
    expect(Funds.fromParsedFunds(pf!, new TokenDecimals(0))).toBeNull();
    const f4 = Funds.fromParsedFunds(pf!, new TokenDecimals(4));
    expect(f4).not.toBeNull();
    expect(f4!.amount).toBe(1231231010010n);
    expect(Funds.fromParsedFunds(pf!, new TokenDecimals(12))).toBeNull();
    expect(Funds.fromParsedFunds(pf!, new TokenDecimals(16))).toBeNull();
});

// Wart tests
test("Wart.parse valid input", () => {
    const w = Wart.parse("1.123");
    expect(w).not.toBeNull();
    expect(w!.E8).toBe(112300000n);
});
test("Wart.parse invalid due to too many decimals", () => {
    expect(Wart.parse("1.123456789")).toBeNull();
});
test("Wart.fromE8 rejects negative values", () => {
    expect(Wart.fromE8(-1n)).toBeNull();
    expect(Wart.fromE8(-100000000n)).toBeNull();
});
test("Liquidity.fromE8 rejects negative values", () => {
    expect(Liquidity.fromE8(-1n)).toBeNull();
    expect(Liquidity.fromE8(-100n)).toBeNull();
});

test("CompactFee.fromWart amount=0 returns smallest fee", () => {
    const w = Wart.fromE8(0n)!;
    const w1 = Wart.fromE8(1n)!;
    expect(w.roundedFee(false).E8).toBe(1n);
});

test("Fee rounding", () => {
    const check_rounding = (s: string) => {
        const original = Wart.parse(s);
        expect(original).not.toBeNull();

        // round down
        const roundedDown = original!.roundedFee(false);
        expect(roundedDown.E8).toBeLessThanOrEqual(original!.E8);
        expect(roundedDown.E8).toBe(roundedDown.toWart().roundedFee(false).E8);

        // round up
        const roundedUp = original!.roundedFee(true);
        expect(roundedUp.E8).toBeGreaterThanOrEqual(original!.E8);
        expect(roundedUp.E8).toBe(roundedUp.toWart().roundedFee(true).E8);
    }
    check_rounding(".00003112");
    check_rounding(".00013112");
    check_rounding(".00113112");
    check_rounding(".0111283");
    check_rounding(".32");
    check_rounding("5.12354");
    check_rounding("10.02031022");
});

