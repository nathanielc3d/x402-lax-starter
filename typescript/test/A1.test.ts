import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { decodeB64Json, toAtomic } from "../src/rules.js";
import { PAY_TO, fakeFacilitator } from "./helpers.js";

test("A1 unpaid call answers 402 with valid x402 requirements (base-sepolia)", async () => {
  const { f, calls } = fakeFacilitator();
  const app = createApp({ price: "0.01", payTo: PAY_TO, network: "base-sepolia", facilitator: f, description: "demo" });
  const res = await app.fetch(new Request("https://agent.example/paid"));
  assert.equal(res.status, 402);
  const body = await res.json();
  assert.equal(body.x402Version, 1);
  assert.equal(typeof body.error, "string");
  assert.equal(body.accepts.length, 1);
  const r = body.accepts[0];
  assert.equal(r.scheme, "exact");
  assert.equal(r.network, "base-sepolia");
  assert.equal(r.maxAmountRequired, "10000");
  assert.equal(r.resource, "https://agent.example/paid");
  assert.equal(r.description, "demo");
  assert.equal(r.mimeType, "application/json");
  assert.equal(r.payTo, PAY_TO);
  assert.ok(r.maxTimeoutSeconds > 0);
  assert.equal(r.asset, "0x036CbD53842c5426634e7929541eC2318f3dCF7e");
  assert.deepEqual(r.extra, { name: "USDC", version: "2" });
  assert.equal(calls.length, 0, "no facilitator call without payment");
  const v2 = decodeB64Json(res.headers.get("PAYMENT-REQUIRED")!) as any;
  assert.equal(v2.x402Version, 2);
  assert.equal(v2.accepts[0].network, "eip155:84532");
  assert.equal(v2.accepts[0].amount, "10000");
});

test("A1 unpaid call on base mainnet uses the Base USDC contract and the configured price", async () => {
  const app = createApp({ price: "1.5", payTo: PAY_TO, network: "base", facilitator: fakeFacilitator().f });
  const body = await (await app.fetch(new Request("https://agent.example/paid"))).json();
  assert.equal(body.accepts[0].network, "base");
  assert.equal(body.accepts[0].maxAmountRequired, "1500000");
  assert.equal(body.accepts[0].asset, "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913");
  assert.deepEqual(body.accepts[0].extra, { name: "USD Coin", version: "2" });
});

test("A1 price conversion and config validation", () => {
  assert.equal(toAtomic("0.01"), "10000");
  assert.equal(toAtomic("0.000001"), "1");
  assert.equal(toAtomic("12"), "12000000");
  for (const bad of ["0", "-1", "0.0000001", "abc", "1e3", ""]) assert.throws(() => toAtomic(bad));
  assert.throws(() => createApp({ price: "0.01", payTo: "nope", network: "base" }));
  assert.throws(() => createApp({ price: "0.01", payTo: PAY_TO, network: "ethereum" as any }));
});

test("A1 /health is free and other paths are 404", async () => {
  const { f, calls } = fakeFacilitator();
  const app = createApp({ price: "0.01", payTo: PAY_TO, network: "base", facilitator: f });
  const h = await app.fetch(new Request("https://agent.example/health"));
  assert.equal(h.status, 200);
  assert.deepEqual(await h.json(), { ok: true });
  assert.equal((await app.fetch(new Request("https://agent.example/nope"))).status, 404);
  assert.equal(calls.length, 0);
});
