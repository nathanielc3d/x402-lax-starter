"""x402 paid agent starter (Python, Flask): GET /paid priced in USDC over x402, GET /health free.

Run:  PAY_TO=0x... NETWORK=base-sepolia PRICE=0.01 python app.py
The facilitator URL comes from FACILITATOR_URL (default https://x402.org/facilitator).
"""
import os
from datetime import datetime, timezone

import requests
from flask import Flask, jsonify, request

from x402_rules import USDC, USDC_DOMAIN, b64_json, is_address, to_atomic, unb64_json

DEFAULT_FACILITATOR_URL = "https://x402.org/facilitator"


class HttpFacilitator:
    """verify and settle over HTTP (x402 version 1 bodies)."""

    def __init__(self, url=None, timeout=30):
        self.url = (url or os.environ.get("FACILITATOR_URL") or DEFAULT_FACILITATOR_URL).rstrip("/")
        self.timeout = timeout

    def _call(self, op, payload, req):
        version = 2 if isinstance(payload, dict) and payload.get("x402Version") == 2 else 1
        try:
            r = requests.post(f"{self.url}/{op}", json={"x402Version": version, "paymentPayload": payload, "paymentRequirements": req}, timeout=self.timeout)
            try:
                return r.json()
            except ValueError:
                return {"error": f"facilitator {op} answered HTTP {r.status_code}"}
        except requests.RequestException as e:
            return {"error": f"facilitator {op} unreachable: {str(e)[:120]}"}

    def verify(self, payload, req):
        d = self._call("verify", payload, req)
        return {"isValid": d.get("isValid") is True, "invalidReason": d.get("invalidReason") or d.get("error"), "payer": d.get("payer")}

    def settle(self, payload, req):
        d = self._call("settle", payload, req)
        return {"success": d.get("success") is True, "transaction": d.get("transaction") or "", "network": d.get("network") or req["network"],
                "errorReason": d.get("errorReason") or d.get("error"), "payer": d.get("payer")}


def build_requirements(price, pay_to, network, resource, description=None, max_timeout_seconds=120):
    d = USDC_DOMAIN[network]
    return {
        "scheme": "exact", "network": network, "maxAmountRequired": to_atomic(price), "resource": resource,
        "description": description or "One paid call", "mimeType": "application/json", "payTo": pay_to,
        "maxTimeoutSeconds": max_timeout_seconds, "asset": USDC[network], "extra": {"name": d["name"], "version": d["version"]},
    }


def create_app(price, pay_to, network, facilitator=None, description=None, work=None):
    if network not in USDC:
        raise ValueError("network must be base or base-sepolia")
    if not is_address(pay_to):
        raise ValueError("pay_to must be a 0x EVM address")
    to_atomic(price)
    facilitator = facilitator or HttpFacilitator()
    work = work or (lambda: {"message": "Thanks for paying. This is the paid result.", "served_at": datetime.now(timezone.utc).isoformat()})
    chain_id = USDC_DOMAIN[network]["chainId"]
    app = Flask(__name__)

    def payment_required(resource, error, extra_headers=None):
        req = build_requirements(price, pay_to, network, resource, description)
        v2 = {"x402Version": 2, "error": error, "resource": {"url": resource}, "accepts": [{"scheme": "exact", "network": f"eip155:{chain_id}", "amount": req["maxAmountRequired"], "asset": req["asset"], "payTo": pay_to, "maxTimeoutSeconds": req["maxTimeoutSeconds"], "extra": req["extra"]}]}
        resp = jsonify({"x402Version": 1, "error": error, "accepts": [req]})
        resp.status_code = 402
        resp.headers["PAYMENT-REQUIRED"] = b64_json(v2)
        for k, v in (extra_headers or {}).items():
            resp.headers[k] = v
        return resp

    @app.after_request
    def cors(resp):
        resp.headers["Access-Control-Allow-Origin"] = "*"
        resp.headers["Access-Control-Expose-Headers"] = "X-PAYMENT-RESPONSE, PAYMENT-RESPONSE, PAYMENT-REQUIRED"
        return resp

    @app.get("/health")
    def health():
        return jsonify({"ok": True})

    @app.get("/paid")
    def paid():
        resource = request.host_url.rstrip("/") + "/paid"
        header = request.headers.get("X-PAYMENT") or request.headers.get("PAYMENT-SIGNATURE")
        if not header:
            return payment_required(resource, "X-PAYMENT header is required")
        try:
            payload = unb64_json(header)
            if not isinstance(payload, dict):
                raise ValueError("not an object")
        except Exception:
            return payment_required(resource, "X-PAYMENT is not base64 encoded JSON")
        accepted = payload.get("accepted") if isinstance(payload.get("accepted"), dict) else payload
        if accepted.get("scheme") not in (None, "exact"):
            return payment_required(resource, "unsupported scheme, expected exact")
        if accepted.get("network") not in (None, network, f"eip155:{chain_id}"):
            return payment_required(resource, f"wrong network, expected {network}")
        req = build_requirements(price, pay_to, network, resource, description)
        try:
            v = facilitator.verify(payload, req)
        except Exception as e:
            v = {"isValid": False, "invalidReason": str(e)}
        if not v.get("isValid"):
            return payment_required(resource, v.get("invalidReason") or "payment did not verify")
        try:
            s = facilitator.settle(payload, req)
        except Exception as e:
            s = {"success": False, "transaction": "", "network": network, "errorReason": str(e)}
        if not s.get("success"):
            failure = {"success": False, "transaction": s.get("transaction") or "", "network": s.get("network") or network, "errorReason": s.get("errorReason") or "settlement failed"}
            return payment_required(resource, failure["errorReason"], {"X-PAYMENT-RESPONSE": b64_json(failure)})
        settlement = {"success": True, "transaction": s["transaction"], "network": s.get("network") or network, "payer": s.get("payer") or v.get("payer")}
        resp = jsonify({"result": work(), "payment": settlement})
        resp.headers["X-PAYMENT-RESPONSE"] = b64_json(settlement)
        resp.headers["PAYMENT-RESPONSE"] = resp.headers["X-PAYMENT-RESPONSE"]
        return resp

    return app


if __name__ == "__main__":
    application = create_app(os.environ.get("PRICE", "0.01"), os.environ.get("PAY_TO", "0x40f100ccCF51EEA928a3f314fB6ab63Bf8fa51F3"), os.environ.get("NETWORK", "base-sepolia"))
    application.run(port=int(os.environ.get("PORT", "8000")))
