import type { Facilitator, PaymentRequirements } from "../src/types.js";
import { encodeB64Json } from "../src/rules.js";

export const PAY_TO = "0x40f100ccCF51EEA928a3f314fB6ab63Bf8fa51F3";

export function fakeFacilitator(opts: { valid?: boolean; settles?: boolean; throws?: boolean } = {}) {
  const calls: { op: string; payload: unknown; req: PaymentRequirements }[] = [];
  const f: Facilitator = {
    async verify(payload, req) {
      calls.push({ op: "verify", payload, req });
      if (opts.throws) throw new Error("facilitator down");
      return opts.valid === false ? { isValid: false, invalidReason: "invalid_exact_evm_payload_signature" } : { isValid: true, payer: "0x1111111111111111111111111111111111111111" };
    },
    async settle(payload, req) {
      calls.push({ op: "settle", payload, req });
      return opts.settles === false
        ? { success: false, transaction: "", network: req.network, errorReason: "insufficient_funds" }
        : { success: true, transaction: "0x" + "ab".repeat(32), network: req.network, payer: "0x1111111111111111111111111111111111111111" };
    },
  };
  return { f, calls };
}

export function paymentHeader(network = "base-sepolia", extra: Record<string, unknown> = {}) {
  return encodeB64Json({ x402Version: 1, scheme: "exact", network, payload: { signature: "0xsig", authorization: { from: "0x1111111111111111111111111111111111111111", to: PAY_TO, value: "10000", validAfter: "0", validBefore: "9999999999", nonce: "0x" + "00".repeat(32) } }, ...extra });
}
