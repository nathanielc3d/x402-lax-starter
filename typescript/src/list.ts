// listOffer: POST the offer to the LAX registry, answer its 402 by paying through `pay`, return the listing id.
// The private key never enters this module: the caller's `pay` function signs the payment.
import { decodeB64Json } from "./rules.js";
import type { LaxOffer } from "./offer.js";

export const DEFAULT_REGISTRY = "https://lax.kognai.ai/registry";

export interface ListOptions {
  offer: LaxOffer;
  registryUrl?: string;
  fetch?: typeof fetch;
  /** gets the 402 terms, returns the value of the payment header (base64 JSON) */
  pay: (paymentRequired: any) => Promise<string> | string;
}

async function readJson(res: Response): Promise<any> {
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { raw: text.slice(0, 300) }; }
}

export async function listOffer({ offer, registryUrl = DEFAULT_REGISTRY, fetch: fetchImpl = fetch, pay }: ListOptions): Promise<{ id: string; transaction?: string | null }> {
  const url = registryUrl.replace(/\/+$/, "") + "/offers";
  const body = JSON.stringify(offer);
  const headers = { "content-type": "application/json", accept: "application/json" };

  const first = await fetchImpl(url, { method: "POST", headers, body });
  if (first.ok) {
    const d = await readJson(first);
    if (!d.id) throw new Error("registry answered without a listing id");
    return { id: String(d.id), transaction: d.transaction ?? null };
  }
  if (first.status !== 402) {
    const d = await readJson(first);
    const detail = d.error || d.errors ? { error: d.error, errors: d.errors } : d;
    throw new Error(`registry refused the offer (HTTP ${first.status}): ${JSON.stringify(detail).slice(0, 400)}`);
  }

  // Pick the terms: a version 1 body with accepts, otherwise the version 2 PAYMENT-REQUIRED header.
  const d = await readJson(first);
  let terms: any = d;
  const h = first.headers.get("PAYMENT-REQUIRED");
  if (!(Array.isArray(d?.accepts) && d.accepts.length) && h) terms = decodeB64Json(h);
  if (!terms || !Array.isArray(terms.accepts) || !terms.accepts.length) throw new Error("registry answered 402 without payment terms");
  const version = terms.x402Version === 2 ? 2 : 1;

  const payment = await pay(terms);
  if (typeof payment !== "string" || !payment) throw new Error("pay() must return the payment header value");
  const second = await fetchImpl(url, { method: "POST", headers: { ...headers, [version === 2 ? "PAYMENT-SIGNATURE" : "X-PAYMENT"]: payment }, body });
  const r = await readJson(second);
  if (!second.ok || !r.id) throw new Error(`listing failed after payment (HTTP ${second.status}): ${JSON.stringify(r.error ?? r).slice(0, 300)}`);
  return { id: String(r.id), transaction: r.transaction ?? null };
}
