import json
from pathlib import Path

import pytest

from app import create_app
from list_offer import list_offer
from x402_rules import FIVE_LAWS, b64_json, check_offer, to_atomic, unb64_json

PAY_TO = "0x40f100ccCF51EEA928a3f314fB6ab63Bf8fa51F3"
HERE = Path(__file__).resolve().parents[1]


class FakeFacilitator:
    def __init__(self, valid=True, settles=True):
        self.valid, self.settles, self.calls = valid, settles, []

    def verify(self, payload, req):
        self.calls.append(("verify", payload, req))
        return {"isValid": True, "payer": "0x" + "11" * 20} if self.valid else {"isValid": False, "invalidReason": "invalid_signature"}

    def settle(self, payload, req):
        self.calls.append(("settle", payload, req))
        if not self.settles:
            return {"success": False, "transaction": "", "network": req["network"], "errorReason": "insufficient_funds"}
        return {"success": True, "transaction": "0x" + "ab" * 32, "network": req["network"]}


def make(valid=True, settles=True, network="base-sepolia", price="0.01"):
    f = FakeFacilitator(valid, settles)
    worked = []
    app = create_app(price, PAY_TO, network, facilitator=f, description="demo", work=lambda: worked.append(1) or {"answer": 42})
    return app.test_client(), f, worked


def pay_header(network="base-sepolia"):
    return b64_json({"x402Version": 1, "scheme": "exact", "network": network, "payload": {"signature": "0x", "authorization": {}}})


def test_A1_unpaid_call_answers_402_with_requirements():
    c, f, _ = make()
    r = c.get("/paid")
    assert r.status_code == 402
    body = r.get_json()
    assert body["x402Version"] == 1 and isinstance(body["error"], str)
    req = body["accepts"][0]
    assert req["scheme"] == "exact" and req["network"] == "base-sepolia"
    assert req["maxAmountRequired"] == "10000" and req["payTo"] == PAY_TO
    assert req["asset"] == "0x036CbD53842c5426634e7929541eC2318f3dCF7e"
    assert req["resource"].endswith("/paid") and req["mimeType"] == "application/json" and req["maxTimeoutSeconds"] > 0
    assert unb64_json(r.headers["PAYMENT-REQUIRED"])["accepts"][0]["network"] == "eip155:84532"
    assert f.calls == []
    assert c.get("/health").get_json() == {"ok": True}


def test_A1_base_mainnet_and_price_rules():
    c, _, _ = make(network="base", price="1.5")
    req = c.get("/paid").get_json()["accepts"][0]
    assert req["maxAmountRequired"] == "1500000" and req["asset"] == "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"
    assert to_atomic("0.000001") == "1"
    for bad in ["0", "-1", "0.0000001", "abc", ""]:
        with pytest.raises(ValueError):
            to_atomic(bad)


def test_A2_paid_call_verified_settled_then_200():
    c, f, worked = make()
    r = c.get("/paid", headers={"X-PAYMENT": pay_header()})
    assert r.status_code == 200
    assert [x[0] for x in f.calls] == ["verify", "settle"]
    assert r.get_json()["result"] == {"answer": 42} and worked == [1]
    s = unb64_json(r.headers["X-PAYMENT-RESPONSE"])
    assert s["success"] is True and s["transaction"] == "0x" + "ab" * 32


@pytest.mark.parametrize("valid,settles,ops", [(False, True, ["verify"]), (True, False, ["verify", "settle"])])
def test_A2_failed_payment_gets_402_and_no_work(valid, settles, ops):
    c, f, worked = make(valid, settles)
    r = c.get("/paid", headers={"X-PAYMENT": pay_header()})
    assert r.status_code == 402
    assert [x[0] for x in f.calls] == ops and worked == []


def test_A2_malformed_or_wrong_network_never_reaches_facilitator():
    c, f, worked = make()
    for h in ["%%%", b64_json("str"), pay_header("base")]:
        assert c.get("/paid", headers={"X-PAYMENT": h}).status_code == 402
    assert f.calls == [] and worked == []


def test_A3_offer_passes_checks_with_five_laws():
    offer = json.loads((HERE / "lax-offer.json").read_text())
    assert check_offer(offer) == []
    assert all(law in offer["constitutional_constraints"] for law in FIVE_LAWS)
    broken = dict(offer, constitutional_constraints=FIVE_LAWS[:4], endpoint="https://lax.kognai.ai/x")
    errs = check_offer(broken)
    assert any("Transparency Covenant" in e for e in errs) and any("own domain" in e for e in errs)


class Resp:
    def __init__(self, status, body, headers=None):
        self.status_code, self._body, self.headers, self.text = status, body, headers or {}, json.dumps(body)

    def json(self):
        return self._body


def test_A4_list_offer_pays_the_402_and_returns_id(capsys):
    terms = {"x402Version": 1, "accepts": [{"scheme": "exact", "network": "base", "maxAmountRequired": "10000"}]}
    seen = []

    def post(url, json=None, headers=None, timeout=None):
        seen.append((url, json, headers))
        return Resp(402, terms) if len(seen) == 1 else Resp(201, {"ok": True, "id": "lax_9", "transaction": "0xfeed"})

    got = []
    out = list_offer({"name": "x"}, lambda t: got.append(t) or "c2ln", registry_url="https://reg.example/registry/", post=post)
    assert out == {"id": "lax_9", "transaction": "0xfeed"}
    assert seen[0][0] == "https://reg.example/registry/offers" and seen[1][2]["X-PAYMENT"] == "c2ln" and got == [terms]
    assert capsys.readouterr().out == ""


def test_A4_refused_offer_raises_without_paying():
    called = []
    with pytest.raises(RuntimeError, match="name too short"):
        list_offer({"name": "x"}, lambda t: called.append(1) or "x", post=lambda *a, **k: Resp(400, {"error": "name too short"}))
    assert called == []
