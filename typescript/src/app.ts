// createApp: one paid route (GET /paid) priced in USDC over x402, plus a free GET /health.
// Web standard fetch handler, so it runs on Node, Hono, Bun, Deno or a Cloudflare Worker.
import { httpFacilitator } from "./facilitator.js";
import { USDC, USDC_DOMAIN, decodeB64Json, encodeB64Json, isAddress, toAtomic } from "./rules.js";
import type { AppConfig, PaymentRequired, PaymentRequirements, SettleResult, VerifyResult } from "./types.js";

const EXPOSE = "X-PAYMENT-RESPONSE, PAYMENT-RESPONSE, PAYMENT-REQUIRED";

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "access-control-allow-origin": "*",
      "access-control-expose-headers": EXPOSE,
      ...headers,
    },
  });
}

export function buildRequirements(cfg: AppConfig, resource: string): PaymentRequirements {
  const d = USDC_DOMAIN[cfg.network];
  return {
    scheme: "exact",
    network: cfg.network,
    maxAmountRequired: toAtomic(cfg.price),
    resource,
    description: cfg.description || "One paid call",
    mimeType: "application/json",
    payTo: cfg.payTo,
    maxTimeoutSeconds: cfg.maxTimeoutSeconds ?? 120,
    asset: USDC[cfg.network],
    extra: { name: d.name, version: d.version },
  };
}

/** x402 version 2 view of the same terms (sent in the PAYMENT-REQUIRED header). */
function requirementsV2(req: PaymentRequirements) {
  return {
    scheme: "exact",
    network: `eip155:${USDC_DOMAIN[req.network].chainId}`,
    amount: req.maxAmountRequired,
    asset: req.asset,
    payTo: req.payTo,
    maxTimeoutSeconds: req.maxTimeoutSeconds,
    extra: req.extra,
  };
}

export function createApp(cfg: AppConfig): { fetch(request: Request): Promise<Response> } {
  if (cfg.network !== "base" && cfg.network !== "base-sepolia") throw new Error("network must be base or base-sepolia");
  if (!isAddress(cfg.payTo)) throw new Error("payTo must be a 0x EVM address");
  toAtomic(cfg.price); // throws early on a bad price
  const facilitator = cfg.facilitator ?? httpFacilitator();
  const work = cfg.work ?? (() => ({ message: "Thanks for paying. This is the paid result.", served_at: new Date().toISOString() }));

  function paymentRequired(resource: string, error: string, extra: Record<string, string> = {}): Response {
    const req = buildRequirements(cfg, resource);
    const body: PaymentRequired = { x402Version: 1, error, accepts: [req] };
    const v2 = { x402Version: 2, error, resource: { url: resource, description: req.description, mimeType: req.mimeType }, accepts: [requirementsV2(req)] };
    return json(body, 402, { "PAYMENT-REQUIRED": encodeB64Json(v2), ...extra });
  }

  return {
    async fetch(request: Request): Promise<Response> {
      const url = new URL(request.url);
      const path = url.pathname.replace(/\/+$/, "") || "/";
      if (request.method === "OPTIONS") {
        return json(null, 204, { "access-control-allow-headers": "X-PAYMENT, PAYMENT-SIGNATURE, content-type", "access-control-allow-methods": "GET, OPTIONS" });
      }
      if (path === "/health") return json({ ok: true });
      if (path === "/") {
        return json({ name: "x402 paid agent starter", paid: `${url.origin}/paid`, price_usdc: cfg.price, network: cfg.network, payTo: cfg.payTo, x402Version: 1 });
      }
      if (path !== "/paid") return json({ error: "not_found" }, 404);
      if (request.method !== "GET" && request.method !== "HEAD") return json({ error: "method_not_allowed" }, 405, { allow: "GET" });

      const resource = `${url.origin}/paid`;
      const header = request.headers.get("X-PAYMENT") || request.headers.get("PAYMENT-SIGNATURE");
      if (!header) return paymentRequired(resource, "X-PAYMENT header is required");

      let payload: Record<string, unknown>;
      try {
        payload = decodeB64Json(header) as Record<string, unknown>;
        if (!payload || typeof payload !== "object") throw new Error("not an object");
      } catch {
        return paymentRequired(resource, "X-PAYMENT is not base64 encoded JSON");
      }
      // Cheap checks before calling the facilitator. Version 2 payloads carry their choice in `accepted`.
      const accepted = (payload.accepted as Record<string, unknown> | undefined) ?? payload;
      const net = accepted.network;
      const wanted = [cfg.network, `eip155:${USDC_DOMAIN[cfg.network].chainId}`];
      if (accepted.scheme !== undefined && accepted.scheme !== "exact") return paymentRequired(resource, "unsupported scheme, expected exact");
      if (net !== undefined && !wanted.includes(String(net))) return paymentRequired(resource, `wrong network, expected ${cfg.network}`);

      const req = buildRequirements(cfg, resource);
      const verified: VerifyResult = await facilitator.verify(payload, req).catch((e): VerifyResult => ({ isValid: false, invalidReason: String(e) }));
      if (!verified.isValid) return paymentRequired(resource, verified.invalidReason || "payment did not verify");

      const settled: SettleResult = await facilitator.settle(payload, req).catch((e): SettleResult => ({ success: false, transaction: "", network: cfg.network, errorReason: String(e) }));
      if (!settled.success) {
        const failure = { success: false, transaction: settled.transaction || "", network: settled.network || cfg.network, errorReason: settled.errorReason || "settlement failed" };
        return paymentRequired(resource, failure.errorReason, { "X-PAYMENT-RESPONSE": encodeB64Json(failure) });
      }

      const settlement = { success: true, transaction: settled.transaction, network: settled.network || cfg.network, payer: settled.payer || verified.payer };
      const result = await work(request);
      const encoded = encodeB64Json(settlement);
      return json({ result, payment: settlement }, 200, { "X-PAYMENT-RESPONSE": encoded, "PAYMENT-RESPONSE": encoded });
    },
  };
}

export { buildRequirements as requirements };
