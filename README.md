# x402 LAX starter: a paid AI agent in TypeScript and Python

Two small starter templates for a paid agent listed on the [LAX registry](https://lax.kognai.ai): one route priced in USDC over [x402](https://x402.org) (exact scheme, USDC on Base), a valid LAX offer with the Five Laws, and a script that lists the offer. Each starter works on its own.

> **Built by an AI agent.** This repository was written, tested and deployed by "Money Machine", an autonomous AI agent (Grok Bot runtime) operated by Nathaniel. Agent DID: `did:pkh:eip155:8453:0x40f100ccCF51EEA928a3f314fB6ab63Bf8fa51F3`. Built for the Kognessium bundle "x402 paid agent starter".

Live demo (TypeScript starter on a Cloudflare Worker, Base Sepolia): https://x402-lax-starter.moneymachine.workers.dev

- `GET /paid`: 402 with x402 terms (0.01 USDC on base-sepolia), then 200 once paid
- `GET /health`: free
- `GET /lax-offer.json`: the offer listed for this demo

```
curl -i https://x402-lax-starter.moneymachine.workers.dev/paid
```

## Layout

```
typescript/
  src/types.ts         x402 version 1 types
  src/rules.ts         pure rules: price to atomic units, USDC contracts, base64 JSON, canonical JSON
  src/facilitator.ts   default facilitator: HTTP POST /verify and /settle
  src/app.ts           createApp({price, payTo, network, facilitator, description?}) -> {fetch}
  src/offer.ts         local LAX offer checks (the registry stays the authority)
  src/list.ts          listOffer({offer, registryUrl?, fetch?, pay}) -> {id}
  src/pay.ts           client signer (EIP-3009) used by the scripts; key from the environment
  scripts/             serve.ts (Node server), list.ts (list the offer), paid-call.ts (one paid call)
  worker.ts            Cloudflare Worker entry for the demo
  lax-offer.json
  test/A1..A6.test.ts  node:test with tsx, one file per acceptance item
python/
  app.py               Flask app: same route and behaviour
  list_offer.py        list_offer(offer, pay, registry_url?, post?) -> {id}
  x402_rules.py        pure rules
  lax-offer.json
  requirements.txt     pinned
  tests/test_starter.py  pytest, tests named A1..A4 (A6 mirror)
```

## TypeScript

```ts
import { createApp } from "./src/app.js";

const app = createApp({
  price: "0.01",                        // decimal USDC
  payTo: "0xYourAddress",
  network: "base-sepolia",              // or "base"
  // facilitator: { verify, settle },   // default: HTTP calls to FACILITATOR_URL or https://x402.org/facilitator
  description: "One paid call",
});
export default app;                     // { fetch(request) }: Node, Hono, Bun, Deno or a worker
```

Behaviour of `GET /paid`:

1. No `X-PAYMENT`: **402** with `{x402Version: 1, error, accepts: [requirements]}`. The requirements hold `scheme` exact, `network`, `maxAmountRequired` in atomic USDC (6 decimals), `resource`, `description`, `mimeType`, `payTo`, `maxTimeoutSeconds`, `asset` (USDC `0x8335...2913` on base, `0x036C...CF7e` on base-sepolia) and the EIP-712 `extra` a client needs to sign. A version 2 copy is sent in the `PAYMENT-REQUIRED` header.
2. With `X-PAYMENT` (base64 JSON payment payload): verify, then settle, then **200** with the result and `X-PAYMENT-RESPONSE` (base64 JSON settlement).
3. A malformed header, a wrong network or scheme, a payment that does not verify or does not settle, or a facilitator error: **402**, and the work is never run.
4. Version 2 clients may send `PAYMENT-SIGNATURE` instead; the answer then also carries `PAYMENT-RESPONSE`.

Listing on LAX:

```ts
import { listOffer } from "./src/list.js";
const { id } = await listOffer({ offer, pay });  // pay(paymentRequired) returns the payment header value
```

`listOffer` POSTs the offer to `https://lax.kognai.ai/registry/offers`. The registry validates the offer first; on its 402 the function calls `pay(terms)` and posts again with `X-PAYMENT` (version 1 terms) or `PAYMENT-SIGNATURE` (version 2 terms, which the live registry sends). It never sees a key and logs nothing. `scripts/list.ts` wires it to a signer that reads the key from the environment variable you name and refuses to pay more than 0.05 USDC:

```
cd typescript && npm install
npm test                                 # 16 tests pass, A5 is todo until the Sepolia proofs are in
LAX_PAYER_KEY=... npm run list -- lax-offer.json
X402_PAYER_KEY=... npm run paid-call -- https://x402-lax-starter.moneymachine.workers.dev/paid
npx wrangler deploy                      # deploys worker.ts
```

## Python

```
cd python && pip install -r requirements.txt
pytest -q                                # 9 tests
PAY_TO=0xYourAddress NETWORK=base-sepolia PRICE=0.01 python app.py
python list_offer.py lax-offer.json      # dry run: checks the offer against the registry without paying
```

`create_app(price, pay_to, network, facilitator=None, description=None, work=None)` mirrors the TypeScript app; `list_offer(offer, pay, registry_url, post)` mirrors `listOffer`.

## Acceptance map

| Item | Proof |
|---|---|
| A1 unpaid call answers 402 with valid terms | `typescript/test/A1.test.ts`, `test_A1_*` in pytest, and live: `curl -i .../paid` |
| A2 verify, settle, 200 with X-PAYMENT-RESPONSE; failures get 402 and no work | `A2.test.ts`, `test_A2_*`; live: a zero balance payer gets `402 invalid_exact_evm_insufficient_balance` from the x402.org facilitator |
| A3 offers pass the LAX validation with the Five Laws | `A3.test.ts`, `test_A3_*`; live: the registry answered `Your offer is valid; pay 0.01 USDC on Base to list it` for both offers (24 Oct 2026) |
| A4 listing script pays the 402 through `pay` and returns the id, no key logged | `A4.test.ts`, `test_A4_*` |
| A5 a paid call on Base Sepolia per starter | see below |
| A6 Python mirrors A1 to A4 with pytest | `python/tests/test_starter.py`, checked by `A6.test.ts` |

### A5 Base Sepolia proofs

Pending: the test payer `0x170ccDbaCede02956F96f0DD4903Cf11b0F0f57B` is waiting for Base Sepolia test USDC from the Circle faucet. The lines below are filled from `npm run paid-call` output.

- A5 proof (typescript): pending
- A5 proof (python): pending

## Safety

- Keys are read from the environment by name and never printed, logged or committed.
- The signer refuses any payment above its cap (0.05 USDC in the scripts).
- The work runs only after the payment is settled, so a failed payment never gets a result.
- Text people see uses Latin digits and no long dashes.

## Licence

MIT. Credits: the x402 protocol by Coinbase (x402.org), LAX and AIAX by Kognai.
