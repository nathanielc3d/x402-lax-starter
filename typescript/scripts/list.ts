// List the offer on LAX: PRIVATE_KEY_ENV=MY_KEY_VAR npm run list -- lax-offer.json
// The key is read from the environment variable you name (default LAX_PAYER_KEY) and never printed.
import { readFileSync } from "node:fs";
import { listOffer } from "../src/list.js";
import { checkOffer } from "../src/offer.js";
import { payWithKey } from "../src/pay.js";

const file = process.argv[2] || "lax-offer.json";
const offer = JSON.parse(readFileSync(file, "utf8"));
const problems = checkOffer(offer);
if (problems.length) { console.error("offer problems:\n- " + problems.join("\n- ")); process.exit(1); }
const keyVar = process.env.PRIVATE_KEY_ENV || "LAX_PAYER_KEY";
const key = process.env[keyVar];
if (!key || !/^0x[0-9a-fA-F]{64}$/.test(key)) { console.error(`set ${keyVar} to the payer key (0x + 64 hex)`); process.exit(2); }
const out = await listOffer({ offer, pay: payWithKey(key as `0x${string}`, { maxAtomic: 50000n }) });
console.log(JSON.stringify(out));
