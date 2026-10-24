// One paid call against a starter: PAYER_KEY_ENV=MY_KEY_VAR npm run paid-call -- https://host/paid
// Refuses to pay more than 0.05 USDC. Prints the result and the settlement transaction, never the key.
import { decodeB64Json } from "../src/rules.js";
import { payWithKey } from "../src/pay.js";

const target = process.argv[2] || "https://x402-lax-starter.moneymachine.workers.dev/paid";
const keyVar = process.env.PAYER_KEY_ENV || "X402_PAYER_KEY";
const key = process.env[keyVar];
if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) { console.error(`set ${keyVar} to the payer key (0x + 64 hex)`); process.exit(2); }
const first = await fetch(target);
if (first.status !== 402) { console.error(`expected 402, got ${first.status}`); process.exit(1); }
const terms = await first.json();
const header = await payWithKey(key as `0x${string}`, { maxAtomic: 50000n })(terms);
const second = await fetch(target, { headers: { "X-PAYMENT": header } });
const body = await second.json();
const pr = second.headers.get("X-PAYMENT-RESPONSE");
console.log(JSON.stringify({ status: second.status, body, settlement: pr ? decodeB64Json(pr) : null }, null, 2));
