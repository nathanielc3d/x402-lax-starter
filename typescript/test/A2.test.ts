import { test } from "node:test";
import assert from "node:assert/strict";
import { createApp } from "../src/app.js";
import { decodeB64Json, encodeB64Json } from "../src/rules.js";
import { PAY_TO, fakeFacilitator, paymentHeader } from "./helpers.js";

function setup(opts = {}) {
  const { f, calls } = fakeFacilitator(opts);
  let worked = 0;
  const app = createApp({ price: "0.01", payTo: PAY_TO, network: "base-sepolia", facilitator: f, work: () => { worked++; return { answer: 42 }; } });
  return { app, calls, worked: () => worked };
}

test("A2 paid call is verified, then settled, then answered 200 with X-PAYMENT-RESPONSE", async () => {
  const { app, calls, worked } = setup();
  const res = await app.fetch(new Request("https://agent.example/paid", { headers: { "X-PAYMENT": paymentHeader() } }));
  assert.equal(res.status, 200);
  assert.deepEqual(calls.map((c) => c.op), ["verify", "settle"]);
  assert.equal(calls[0].req.maxAmountRequired, "10000");
  assert.equal(calls[0].req.payTo, PAY_TO);
  assert.equal((calls[0].payload as any).scheme, "exact");
  const body = await res.json();
  assert.deepEqual(body.result, { answer: 42 });
  assert.equal(worked(), 1);
  const s = decodeB64Json(res.headers.get("X-PAYMENT-RESPONSE")!) as any;
  assert.equal(s.success, true);
  assert.equal(s.transaction, "0x" + "ab".repeat(32));
  assert.equal(s.network, "base-sepolia");
});

test("A2 a payment that fails verification gets 402 and no work, no settle", async () => {
  const { app, calls, worked } = setup({ valid: false });
  const res = await app.fetch(new Request("https://agent.example/paid", { headers: { "X-PAYMENT": paymentHeader() } }));
  assert.equal(res.status, 402);
  assert.match((await res.json()).error, /invalid/);
  assert.deepEqual(calls.map((c) => c.op), ["verify"]);
  assert.equal(worked(), 0);
});

test("A2 a payment that fails settlement gets 402 and no work", async () => {
  const { app, calls, worked } = setup({ settles: false });
  const res = await app.fetch(new Request("https://agent.example/paid", { headers: { "X-PAYMENT": paymentHeader() } }));
  assert.equal(res.status, 402);
  assert.deepEqual(calls.map((c) => c.op), ["verify", "settle"]);
  assert.equal(worked(), 0);
  const s = decodeB64Json(res.headers.get("X-PAYMENT-RESPONSE")!) as any;
  assert.equal(s.success, false);
});

test("A2 a facilitator that throws gets 402 and no work", async () => {
  const { app, worked } = setup({ throws: true });
  const res = await app.fetch(new Request("https://agent.example/paid", { headers: { "X-PAYMENT": paymentHeader() } }));
  assert.equal(res.status, 402);
  assert.equal(worked(), 0);
});

test("A2 malformed X-PAYMENT and wrong network get 402 without calling the facilitator", async () => {
  const { app, calls, worked } = setup();
  for (const h of ["%%%not-base64", encodeB64Json("just a string"), paymentHeader("base"), paymentHeader("base-sepolia", { scheme: "upto" })]) {
    const res = await app.fetch(new Request("https://agent.example/paid", { headers: { "X-PAYMENT": h } }));
    assert.equal(res.status, 402, h);
  }
  assert.equal(calls.length, 0);
  assert.equal(worked(), 0);
});

test("A2 version 2 PAYMENT-SIGNATURE header is accepted too", async () => {
  const { app, calls } = setup();
  const v2 = encodeB64Json({ x402Version: 2, accepted: { scheme: "exact", network: "eip155:84532" }, payload: { signature: "0x", authorization: {} } });
  const res = await app.fetch(new Request("https://agent.example/paid", { headers: { "PAYMENT-SIGNATURE": v2 } }));
  assert.equal(res.status, 200);
  assert.ok(res.headers.get("PAYMENT-RESPONSE"));
  assert.equal(calls.length, 2);
});
