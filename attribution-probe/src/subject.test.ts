import { test, expect } from "bun:test";
import { alpha, beta, delta, gamma } from "./subject.js";

test("PROBE_ALPHA adds one", () => {
  expect(alpha(1)).toBe(2);
});

test("PROBE_BETA uppercases", () => {
  expect(beta("ab")).toBe("AB");
});

// Covers delta but CANNOT kill its `*`->`/` mutant: 0*2 === 0/2 === 0.
test("PROBE_DELTA_BLIND covers delta but discriminates nothing", () => {
  expect(delta(0)).toBe(0);
});

// Covers delta and DOES kill its `*`->`/` mutant: 3*2 === 6, 3/2 === 1.5.
test("PROBE_DELTA_SHARP doubles three", () => {
  expect(delta(3)).toBe(6);
});

test("PROBE_GAMMA returns small for a small input", () => {
  expect(gamma(1)).toBe("small");
});
