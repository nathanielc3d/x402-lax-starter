"""Pure rules shared by the Python starter: prices, USDC contracts, base64 JSON, the Five Laws."""
import base64
import json
import re
from decimal import Decimal, InvalidOperation

USDC = {
    "base": "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    "base-sepolia": "0x036CbD53842c5426634e7929541eC2318f3dCF7e",
}
USDC_DOMAIN = {
    "base": {"name": "USD Coin", "version": "2", "chainId": 8453},
    "base-sepolia": {"name": "USDC", "version": "2", "chainId": 84532},
}
FIVE_LAWS = ["Solidarity Oath", "Renewal Mandate", "Treasury Equilibrium", "Harm Shield", "Transparency Covenant"]


def to_atomic(price: str) -> str:
    """'0.01' -> '10000'. Raises ValueError unless a positive decimal with at most 6 decimals."""
    if not isinstance(price, str) or not re.fullmatch(r"\d+(\.\d{1,6})?", price.strip()):
        raise ValueError(f"price must be a decimal USDC string with at most 6 decimals, got {price!r}")
    try:
        atomic = int(Decimal(price.strip()) * 1_000_000)
    except InvalidOperation as e:
        raise ValueError(str(e))
    if atomic <= 0:
        raise ValueError("price must be greater than 0")
    return str(atomic)


def is_address(a) -> bool:
    return isinstance(a, str) and re.fullmatch(r"0x[0-9a-fA-F]{40}", a) is not None


def b64_json(value) -> str:
    return base64.b64encode(json.dumps(value, separators=(",", ":")).encode()).decode()


def unb64_json(value: str):
    return json.loads(base64.b64decode(value.strip(), validate=True).decode())


def check_offer(offer: dict) -> list:
    """Local mirror of the LAX offer rules; the registry stays the authority."""
    errors = []

    def s(key, lo, hi):
        v = offer.get(key)
        if not isinstance(v, str) or not lo <= len(v) <= hi:
            errors.append(f"{key} must be a string of {lo} to {hi} characters")

    s("name", 3, 80)
    s("description", 20, 600)
    if not offer.get("endpoint") and not offer.get("pact_endpoint"):
        errors.append("endpoint or pact_endpoint is required")
    for key in ("endpoint", "pact_endpoint"):
        v = offer.get(key)
        if v is not None and (not isinstance(v, str) or not v.startswith("https://")):
            errors.append(f"{key} must be an https url")
        elif isinstance(v, str) and re.search(r"(^|\.)kognai\.ai$", v.split("/")[2].split(":")[0]):
            errors.append(f"{key} must be on your own domain, not kognai.ai")
    caps = offer.get("capabilities")
    if not isinstance(caps, list) or not 1 <= len(caps) <= 10:
        errors.append("capabilities must hold 1 to 10 entries")
    else:
        for i, c in enumerate(caps):
            p = (c or {}).get("pricing") or {}
            if not c.get("skill_id"):
                errors.append(f"capabilities[{i}].skill_id is required")
            d = c.get("description")
            if not isinstance(d, str) or not d:
                errors.append(f"capabilities[{i}].description is required")
            elif len(d) > 200:  # enforced live by the registry
                errors.append(f"capabilities[{i}].description must be at most 200 characters")
            if p.get("model") not in ("per_call", "per_minute", "flat", "free"):
                errors.append(f"capabilities[{i}].pricing.model is invalid")
            if not re.fullmatch(r"\d+(\.\d+)?", str(p.get("amount", ""))):
                errors.append(f"capabilities[{i}].pricing.amount must be a decimal string")
            if p.get("currency") != "USDC" or p.get("rail") != "x402":
                errors.append(f"capabilities[{i}].pricing must be USDC over x402")
    laws = offer.get("constitutional_constraints")
    if not isinstance(laws, list):
        errors.append("constitutional_constraints must list the Five Laws")
    else:
        errors += [f"constitutional_constraints is missing {law}" for law in FIVE_LAWS if law not in laws]
    return errors
