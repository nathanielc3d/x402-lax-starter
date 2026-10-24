// Default facilitator: HTTP POST /verify and /settle (x402 version 1 body).
import type { Facilitator, PaymentRequirements, SettleResult, VerifyResult } from "./types.js";

export const DEFAULT_FACILITATOR_URL = "https://x402.org/facilitator";

export function facilitatorUrlFromEnv(): string {
  const env = (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env;
  return env?.FACILITATOR_URL || DEFAULT_FACILITATOR_URL;
}

export function httpFacilitator(url: string = facilitatorUrlFromEnv(), fetchImpl: typeof fetch = fetch, timeoutMs = 30000): Facilitator {
  const base = url.replace(/\/+$/, "");
  async function call(op: "verify" | "settle", paymentPayload: unknown, paymentRequirements: PaymentRequirements): Promise<Record<string, unknown>> {
    const version = (paymentPayload as { x402Version?: number })?.x402Version === 2 ? 2 : 1;
    try {
      const res = await fetchImpl(`${base}/${op}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ x402Version: version, paymentPayload, paymentRequirements }),
        signal: AbortSignal.timeout(timeoutMs),
      });
      const text = await res.text();
      let data: Record<string, unknown> = {};
      try { data = JSON.parse(text); } catch { /* not JSON */ }
      if (!res.ok && data.isValid === undefined && data.success === undefined) {
        data.error = `facilitator ${op} answered HTTP ${res.status}`;
      }
      return data;
    } catch (e) {
      return { error: `facilitator ${op} unreachable: ${String(e).slice(0, 120)}` };
    }
  }
  return {
    async verify(p, r): Promise<VerifyResult> {
      const d = await call("verify", p, r);
      return { isValid: d.isValid === true, invalidReason: (d.invalidReason || d.error) as string | undefined, payer: d.payer as string | undefined };
    },
    async settle(p, r): Promise<SettleResult> {
      const d = await call("settle", p, r);
      return {
        success: d.success === true,
        transaction: String(d.transaction || ""),
        network: String(d.network || r.network),
        errorReason: (d.errorReason || d.error) as string | undefined,
        payer: d.payer as string | undefined,
      };
    },
  };
}
