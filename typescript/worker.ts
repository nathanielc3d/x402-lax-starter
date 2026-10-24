// Cloudflare Worker entry for the public demo (Base Sepolia, x402.org facilitator).
import { createApp } from "./src/app.js";
import { httpFacilitator } from "./src/facilitator.js";
import offer from "./lax-offer.json" with { type: "json" };

interface Env { PRICE?: string; PAY_TO?: string; NETWORK?: "base" | "base-sepolia"; FACILITATOR_URL?: string }

let cached: { key: string; app: ReturnType<typeof createApp> } | null = null;

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const cfg = {
      price: env.PRICE || "0.01",
      payTo: env.PAY_TO || "0x40f100ccCF51EEA928a3f314fB6ab63Bf8fa51F3",
      network: env.NETWORK || "base-sepolia",
      facilitator: httpFacilitator(env.FACILITATOR_URL || "https://x402.org/facilitator"),
      description: "x402 LAX starter demo: one paid call",
    } as const;
    const key = `${cfg.price}|${cfg.payTo}|${cfg.network}`;
    if (!cached || cached.key !== key) cached = { key, app: createApp(cfg) };
    const url = new URL(request.url);
    if (url.pathname === "/lax-offer.json") {
      return new Response(JSON.stringify(offer, null, 2), { headers: { "content-type": "application/json", "access-control-allow-origin": "*" } });
    }
    return cached.app.fetch(request);
  },
};
