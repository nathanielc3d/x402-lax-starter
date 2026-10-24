// Pure rules: price conversion, USDC addresses, base64 JSON. No I/O.
import type { Network } from "./types.js";

export const USDC: Record<Network, string> = {
  base: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
  "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
};

/** EIP-712 domain of USDC on each network (needed by clients to sign EIP-3009). */
export const USDC_DOMAIN: Record<Network, { name: string; version: string; chainId: number }> = {
  base: { name: "USD Coin", version: "2", chainId: 8453 },
  "base-sepolia": { name: "USDC", version: "2", chainId: 84532 },
};

export const NETWORKS: Network[] = ["base", "base-sepolia"];

/** "0.01" -> "10000". Throws on anything that is not a positive decimal with at most 6 decimals. */
export function toAtomic(price: string): string {
  if (typeof price !== "string" || !/^\d+(\.\d{1,6})?$/.test(price.trim())) {
    throw new Error(`price must be a decimal USDC string with at most 6 decimals, got ${JSON.stringify(price)}`);
  }
  const [whole, frac = ""] = price.trim().split(".");
  const atomic = (BigInt(whole) * 1000000n + BigInt((frac + "000000").slice(0, 6))).toString();
  if (atomic === "0") throw new Error("price must be greater than 0");
  return atomic;
}

export function isAddress(a: unknown): a is string {
  return typeof a === "string" && /^0x[0-9a-fA-F]{40}$/.test(a);
}

export function encodeB64Json(value: unknown): string {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export function decodeB64Json(value: string): unknown {
  const bin = atob(value.trim());
  const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
  return JSON.parse(new TextDecoder().decode(bytes));
}

/** Canonical JSON: keys sorted at every depth, no spaces (used by LAX signatures). */
export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map(canonicalJson).join(",") + "]";
  const o = value as Record<string, unknown>;
  return "{" + Object.keys(o).filter((k) => o[k] !== undefined).sort().map((k) => JSON.stringify(k) + ":" + canonicalJson(o[k])).join(",") + "}";
}
