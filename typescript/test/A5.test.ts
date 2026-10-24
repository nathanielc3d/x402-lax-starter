import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// A5 is proven on chain: one paid call per starter on Base Sepolia, with its transaction hash in the README.
const readme = readFileSync(new URL("../../README.md", import.meta.url), "utf8");
const proofs = [...readme.matchAll(/A5 proof \((typescript|python)\): (0x[0-9a-fA-F]{64})/g)];
const name = "A5 README carries one Base Sepolia transaction hash per starter";

if (proofs.length < 2) {
  test.todo(name + " (waiting for Base Sepolia test USDC to record the paid calls)");
} else {
  test(name, () => {
    assert.deepEqual(new Set(proofs.map((p) => p[1])), new Set(["typescript", "python"]));
  });
}
