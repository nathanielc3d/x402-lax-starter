import { test } from "node:test";
import assert from "node:assert/strict";
import { listOffer } from "../src/list.js";
import { encodeB64Json } from "../src/rules.js";

const offer = { name: "Test agent", description: "A test agent that answers paid calls.", endpoint: "https://agent.example/paid", capabilities: [{ skill_id: "x", description: "x", pricing: { model: "per_call", amount: "0.01", currency: "USDC", rail: "x402" } }], constitutional_constraints: ["Solidarity Oath", "Renewal Mandate", "Treasury Equilibrium", "Harm Shield", "Transparency Covenant"] } as any;
const terms = { x402Version: 1, error: "pay", accepts: [{ scheme: "exact", network: "base", maxAmountRequired: "10000", payTo: "0xF62fb064F9d9D03B8013E5b6023e3501805BA973", asset: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913" }] };

function fakeRegistry(firstStatus = 402, v2Only = false) {
  const seen: { url: string; headers: Record<string, string>; body: any }[] = [];
  const f = (async (url: string, init: RequestInit) => {
    const headers = Object.fromEntries(new Headers(init.headers).entries());
    seen.push({ url, headers, body: JSON.parse(String(init.body)) });
    if (seen.length === 1) {
      if (firstStatus === 402) {
        const h = new Headers({ "content-type": "application/json" });
        if (v2Only) h.set("PAYMENT-REQUIRED", encodeB64Json({ x402Version: 2, accepts: [{ scheme: "exact", network: "eip155:8453", amount: "10000" }] }));
        return new Response(JSON.stringify(v2Only ? { error: "payment required" } : terms), { status: 402, headers: h });
      }
      return new Response(JSON.stringify({ error: "invalid offer", errors: ["name too short"] }), { status: firstStatus });
    }
    return new Response(JSON.stringify({ ok: true, id: "lax_123", transaction: "0xfeed" }), { status: 201 });
  }) as unknown as typeof fetch;
  return { f, seen };
}

test("A4 listOffer answers the registry's 402, pays through pay() and returns the listing id", async () => {
  const { f, seen } = fakeRegistry();
  let paidWith: any = null;
  const logs: string[] = [];
  const orig = console.log;
  console.log = (...a: unknown[]) => { logs.push(a.join(" ")); };
  try {
    const out = await listOffer({ offer, registryUrl: "https://reg.example/registry/", fetch: f, pay: (t) => { paidWith = t; return "c2lnbmVk"; } });
    assert.deepEqual(out, { id: "lax_123", transaction: "0xfeed" });
  } finally { console.log = orig; }
  assert.equal(seen.length, 2);
  assert.equal(seen[0].url, "https://reg.example/registry/offers");
  assert.deepEqual(seen[0].body, offer);
  assert.equal(seen[1].headers["x-payment"], "c2lnbmVk");
  assert.deepEqual(paidWith, terms);
  assert.equal(logs.length, 0, "nothing logged, so no key can leak");
});

test("A4 version 2 terms from the PAYMENT-REQUIRED header are paid with PAYMENT-SIGNATURE", async () => {
  const { f, seen } = fakeRegistry(402, true);
  const out = await listOffer({ offer, fetch: f, pay: (t) => { assert.equal(t.x402Version, 2); return "djI="; } });
  assert.equal(out.id, "lax_123");
  assert.equal(seen[0].url, "https://lax.kognai.ai/registry/offers");
  assert.equal(seen[1].headers["payment-signature"], "djI=");
});

test("A4 a refused offer throws with the registry reason and never calls pay()", async () => {
  const { f } = fakeRegistry(400);
  let called = false;
  await assert.rejects(listOffer({ offer, fetch: f, pay: () => { called = true; return "x"; } }), /name too short/);
  assert.equal(called, false);
});
