import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { checkOffer, FIVE_LAWS } from "../src/offer.js";

const ts = JSON.parse(readFileSync(new URL("../lax-offer.json", import.meta.url), "utf8"));
const py = JSON.parse(readFileSync(new URL("../../python/lax-offer.json", import.meta.url), "utf8"));

test("A3 both starter offers pass the LAX offer checks with the Five Laws", () => {
  for (const offer of [ts, py]) {
    assert.deepEqual(checkOffer(offer), []);
    for (const law of FIVE_LAWS) assert.ok(offer.constitutional_constraints.includes(law));
    assert.ok(offer.endpoint.startsWith("https://"));
    assert.ok(!/kognai\.ai/.test(new URL(offer.endpoint).hostname));
    const cap = offer.capabilities[0];
    assert.deepEqual(cap.pricing, { model: "per_call", amount: "0.01", currency: "USDC", rail: "x402" });
    assert.ok(cap.input_schema && cap.output_schema);
  }
});

test("A3 the checks catch a missing law, a bad price and a kognai.ai endpoint", () => {
  const broken = structuredClone(ts);
  broken.constitutional_constraints = FIVE_LAWS.slice(0, 4);
  broken.capabilities[0].pricing.amount = "free";
  broken.endpoint = "https://lax.kognai.ai/paid";
  const errs = checkOffer(broken);
  assert.ok(errs.some((e) => e.includes("Transparency Covenant")));
  assert.ok(errs.some((e) => e.includes("pricing.amount")));
  assert.ok(errs.some((e) => e.includes("own domain")));
  assert.ok(checkOffer({ ...ts, endpoint: "http://insecure.example" }).some((e) => e.includes("https")));
  const long = structuredClone(ts);
  long.capabilities[0].description = "x".repeat(201);
  assert.ok(checkOffer(long).some((e) => e.includes("at most 200")));
});
