"""List an offer on the LAX registry: POST, answer the 402 by calling pay(terms), return the listing id.

The private key never enters this module: pay() is supplied by the caller, who reads the key from
the environment by name and never logs it.
"""
import json
import sys

import requests

from x402_rules import check_offer, unb64_json

DEFAULT_REGISTRY = "https://lax.kognai.ai/registry"


def list_offer(offer, pay, registry_url=DEFAULT_REGISTRY, post=None):
    post = post or requests.post
    url = registry_url.rstrip("/") + "/offers"
    first = post(url, json=offer, headers={"accept": "application/json"}, timeout=30)
    if 200 <= first.status_code < 300:
        d = first.json()
        if not d.get("id"):
            raise RuntimeError("registry answered without a listing id")
        return {"id": str(d["id"]), "transaction": d.get("transaction")}
    if first.status_code != 402:
        try:
            d = first.json()
        except ValueError:
            d = {"raw": first.text[:300]}
        raise RuntimeError(f"registry refused the offer (HTTP {first.status_code}): {json.dumps({'error': d.get('error'), 'errors': d.get('errors')} if (d.get('error') or d.get('errors')) else d)[:400]}")
    try:
        terms = first.json()
    except ValueError:
        terms = {}
    header = first.headers.get("PAYMENT-REQUIRED")
    if not terms.get("accepts") and header:
        terms = unb64_json(header)
    if not terms.get("accepts"):
        raise RuntimeError("registry answered 402 without payment terms")
    name = "PAYMENT-SIGNATURE" if terms.get("x402Version") == 2 else "X-PAYMENT"
    payment = pay(terms)
    if not isinstance(payment, str) or not payment:
        raise RuntimeError("pay() must return the payment header value")
    second = post(url, json=offer, headers={"accept": "application/json", name: payment}, timeout=30)
    d = second.json()
    if not (200 <= second.status_code < 300) or not d.get("id"):
        raise RuntimeError(f"listing failed after payment (HTTP {second.status_code}): {json.dumps(d.get('error') or d)[:300]}")
    return {"id": str(d["id"]), "transaction": d.get("transaction")}


if __name__ == "__main__":
    offer = json.load(open(sys.argv[1] if len(sys.argv) > 1 else "lax-offer.json"))
    problems = check_offer(offer)
    if problems:
        sys.exit("offer problems:\n- " + "\n- ".join(problems))
    # Dry run: validate against the registry without paying. Plug in your own signer to list for real.
    def refuse(terms):
        print(json.dumps({"registry_validation": "passed", "fee": terms["accepts"][0]}, indent=2))
        raise SystemExit(0)
    list_offer(offer, refuse)
