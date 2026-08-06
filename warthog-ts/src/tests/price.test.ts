import { test, expect } from "bun:test";
import { Price } from "../types/Price";

test("Price fromDoubleInternal rejects invalid input", () => {
    // Zero, negative, infinity, and NaN are invalid
    expect(Price.fromDoubleInternal(0.0)).toBeNull();
    expect(Price.fromDoubleInternal(0)).toBeNull();
    expect(Price.fromDoubleInternal(-1.0)).toBeNull();
    expect(Price.fromDoubleInternal(-0.5)).toBeNull();
    expect(Price.fromDoubleInternal(Infinity)).toBeNull();
    expect(Price.fromDoubleInternal(-Infinity)).toBeNull();
    expect(Price.fromDoubleInternal(NaN)).toBeNull();
});

test("Price roundtrip fromDoubleInternal -> toDoubleRaw", () => {
    const testRoundtrip = (input: number) => {
        const price = Price.fromDoubleInternal(input);
        expect(price).not.toBeNull();

        const output = price!.toDoubleRaw();

        console.log(`Input: ${input}, Output: ${output}, Diff: ${(Math.abs(1 - output / input) * 100).toFixed(4)}%`);
        expect(Math.abs(1 - output / input) * 100).toBeLessThan(0.01);
    };

    testRoundtrip(0.0000001354);
    testRoundtrip(0.000001345);
    testRoundtrip(0.000016574);
    testRoundtrip(0.00012043);
    testRoundtrip(0.0011239);
    testRoundtrip(0.02341);
    testRoundtrip(0.1812);
    testRoundtrip(0.5123);
    testRoundtrip(1.813);
    testRoundtrip(2.5213);
    testRoundtrip(16.430);
    testRoundtrip(194.75);
    testRoundtrip(1834.5678);
    testRoundtrip(12093);
    testRoundtrip(234091);
    testRoundtrip(9582389);
    testRoundtrip(190123900);
    testRoundtrip(9230942914);
});

test("Price.fromHex enforces exponent range", () => {
    // Internal exponent must be in [0, 127]. The high bit of the
    // exponent byte encodes values outside that range, which must be
    // rejected to stay consistent with fromMantissaExponent.
    expect(Price.fromHex("ffff7f")).not.toBeNull();
    expect(Price.fromHex("ffff80")).toBeNull();
    expect(Price.fromHex("ffffff")).toBeNull();
    expect(Price.fromHex("c0e74d")).not.toBeNull();
});
