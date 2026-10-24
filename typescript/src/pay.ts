// Client side: sign an x402 exact payment (EIP-3009 transferWithAuthorization) for USDC on Base.
// Used by the scripts. The key comes from the caller (read from the environment by name) and is never logged.
import { privateKeyToAccount } from "viem/accounts";
import { encodeB64Json, USDC_DOMAIN } from "./rules.js";
import type { Network } from "./types.js";

const V2_NETWORKS: Record<string, Network> = { "eip155:8453": "base", "eip155:84532": "base-sepolia" };

function randomNonce(): `0x${string}` {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return ("0x" + Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("")) as `0x${string}`;
}

/** Returns a pay(paymentRequired) function that produces the X-PAYMENT (v1) or PAYMENT-SIGNATURE (v2) value. */
export function payWithKey(privateKey: `0x${string}`, opts: { maxAtomic?: bigint } = {}) {
  const account = privateKeyToAccount(privateKey);
  return async function pay(paymentRequired: any): Promise<string> {
    const version = paymentRequired?.x402Version === 2 ? 2 : 1;
    const req = (paymentRequired?.accepts || []).find((a: any) => a.scheme === "exact" && (version === 1 ? USDC_DOMAIN[a.network as Network] : V2_NETWORKS[a.network]));
    if (!req) throw new Error("no exact USDC option on base or base-sepolia in the 402 terms");
    const network: Network = version === 1 ? req.network : V2_NETWORKS[req.network];
    const amount = BigInt(version === 1 ? req.maxAmountRequired : req.amount);
    if (opts.maxAtomic !== undefined && amount > opts.maxAtomic) throw new Error(`refused: ${amount} atomic USDC is above the cap ${opts.maxAtomic}`);
    const dom = USDC_DOMAIN[network];
    const now = Math.floor(Date.now() / 1000);
    const authorization = {
      from: account.address,
      to: req.payTo as `0x${string}`,
      value: amount,
      validAfter: BigInt(now - 600),
      validBefore: BigInt(now + (req.maxTimeoutSeconds || 120)),
      nonce: randomNonce(),
    };
    const signature = await account.signTypedData({
      domain: { name: req.extra?.name || dom.name, version: req.extra?.version || dom.version, chainId: dom.chainId, verifyingContract: req.asset },
      types: { TransferWithAuthorization: [
        { name: "from", type: "address" }, { name: "to", type: "address" }, { name: "value", type: "uint256" },
        { name: "validAfter", type: "uint256" }, { name: "validBefore", type: "uint256" }, { name: "nonce", type: "bytes32" },
      ] },
      primaryType: "TransferWithAuthorization",
      message: authorization,
    });
    const auth = { ...authorization, value: authorization.value.toString(), validAfter: authorization.validAfter.toString(), validBefore: authorization.validBefore.toString() };
    const payload = version === 1
      ? { x402Version: 1, scheme: "exact", network, payload: { signature, authorization: auth } }
      : { x402Version: 2, resource: paymentRequired.resource, accepted: req, payload: { signature, authorization: auth } };
    return encodeB64Json(payload);
  };
}
