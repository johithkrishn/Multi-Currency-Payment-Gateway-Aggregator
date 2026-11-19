#!/usr/bin/env python3
"""
fx_helper.py — optional Python 3 self-study extension (PRD §6.4).

A standalone re-implementation of the PayBridge conversion + mock-fee rules,
used to cross-check the JavaScript implementation. Standard library only.

Convention (identical to web/js/currency.js and the mobile app):
    fx_rates[source][target] = target units received for ONE source unit
    converted = amount × fx_rates[source][target]
    fee       = converted × fee_percent / 100 + fee_fixed_usd × fx_rates["USD"][target]
    total     = round(converted) + round(fee)          (all in the TARGET currency)

Rates are ILLUSTRATIVE DEMO VALUES, not live market quotes.

Usage:
    python3 tools/fx_helper.py 100 USD INR --provider stripe_mock
    python3 tools/fx_helper.py --table
    python3 tools/fx_helper.py --check tests/conversion-cases.json
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from decimal import ROUND_HALF_UP, Decimal

SUPPORTED = ("USD", "INR", "EUR")
DEFAULT_BASE_RATES = {"USD": 1.0, "INR": 83.0, "EUR": 0.92}
PROVIDERS = {
    "stripe_mock": {"name": "Stripe-like Mock", "fee_percent": 2.9, "fee_fixed": 0.0},
    "razorpay_mock": {"name": "Razorpay-like Mock", "fee_percent": 2.0, "fee_fixed": 0.0},
}
MAX_AMOUNT = 1_000_000


def build_rate_table(base: dict[str, float]) -> dict[str, dict[str, float]]:
    """fx_rates[s][t] = base[t] / base[s]; same currency is exactly 1."""
    return {s: {t: 1.0 if s == t else base[t] / base[s] for t in SUPPORTED} for s in SUPPORTED}


def round_money(value: float, places: int = 2) -> float:
    """Half-up rounding on the shortest float repr — matches JS Number(x + 'e2') rounding."""
    q = Decimal(1).scaleb(-places)
    return float(Decimal(repr(value)).quantize(q, rounding=ROUND_HALF_UP))


def format_rate(rate: float) -> str:
    decimals = 4 if rate >= 1 else 6
    return f"{rate:,.{decimals}f}"


def validate_amount(raw: str) -> float:
    s = str(raw).strip()
    if not s:
        raise ValueError("Enter an amount greater than zero.")
    if s.startswith("-"):
        raise ValueError("Amount cannot be negative. Enter an amount greater than zero.")
    if "," in s and not re.fullmatch(r"(\d{1,3}(,\d{3})+|\d{1,2}(,\d{2})*,\d{3})(\.\d*)?", s):
        raise ValueError("Enter a valid number, for example 100 or 99.50.")
    s = s.replace(",", "")
    if not re.fullmatch(r"\d+\.?\d*|\.\d+", s):
        raise ValueError("Enter a valid number, for example 100 or 99.50.")
    if "." in s and len(s.split(".")[1]) > 2:
        raise ValueError("Use at most 2 decimal places.")
    value = float(s)
    if value < 0.01:
        raise ValueError("Enter an amount greater than zero.")
    if value > MAX_AMOUNT:
        raise ValueError("Amount exceeds the demo limit of 1,000,000.")
    return value


def quote(amount, source, target, provider=None, base=None, providers=None):
    if source not in SUPPORTED or target not in SUPPORTED:
        raise ValueError("Unsupported currency.")
    table = build_rate_table(base or DEFAULT_BASE_RATES)
    value = validate_amount(amount)
    rate = table[source][target]
    converted = value * rate
    p = (providers or PROVIDERS).get(provider) if provider else None
    fee = 0.0
    if p:
        fee = converted * p["fee_percent"] / 100 + p["fee_fixed"] * table["USD"][target]
    converted_d = round_money(converted)
    fee_d = round_money(fee)
    return {
        "amount": value, "source": source, "target": target, "rate": rate,
        "converted": converted_d, "fee": fee_d, "total": round_money(converted_d + fee_d),
    }


def check(path: str) -> int:
    with open(path, encoding="utf-8") as fh:
        fx = json.load(fh)
    base = fx["fxRates"]["rates"]
    providers = {k: {"fee_percent": v["feePercent"], "fee_fixed": v["feeFixed"]} for k, v in fx["providers"].items()}
    failures = 0
    for c in fx["conversions"]:
        q = quote(c["amount"], c["source"], c["target"], c["provider"], base, providers)
        got = (format_rate(q["rate"]), q["converted"], q["fee"], q["total"])
        want = (c["rate"], c["converted"], c["fee"], c["total"])
        status = "ok " if got == want else "FAIL"
        if got != want:
            failures += 1
        print(f"{status} {c['id']}: {c['amount']} {c['source']}→{c['target']} {got}" + ("" if got == want else f" expected {want}"))
    for v in fx["validation"]:
        try:
            validate_amount(v["input"])
            ok = True
        except ValueError:
            ok = False
        if ok != v["ok"]:
            failures += 1
            print(f"FAIL validation {v['input']!r}: ok={ok}, expected {v['ok']}")
    total = len(fx["conversions"]) + len(fx["validation"])
    print(f"ALL {total} CASES PASS" if not failures else f"{failures} FAILURE(S)")
    return 1 if failures else 0


def main(argv=None) -> int:
    ap = argparse.ArgumentParser(description="PayBridge demo FX helper (illustrative rates only).")
    ap.add_argument("amount", nargs="?")
    ap.add_argument("source", nargs="?", choices=SUPPORTED)
    ap.add_argument("target", nargs="?", choices=SUPPORTED)
    ap.add_argument("--provider", choices=sorted(PROVIDERS))
    ap.add_argument("--table", action="store_true", help="print the demo rate matrix")
    ap.add_argument("--check", metavar="FIXTURES", help="verify a conversion-cases.json file")
    a = ap.parse_args(argv)

    if a.check:
        return check(a.check)
    if a.table:
        t = build_rate_table(DEFAULT_BASE_RATES)
        print("fx_rates[row][col]  (DEMO RATES — not live quotes)")
        print("       " + "".join(f"{c:>14}" for c in SUPPORTED))
        for s in SUPPORTED:
            print(f"{s:>6} " + "".join(f"{format_rate(t[s][c]):>14}" for c in SUPPORTED))
        return 0
    if not (a.amount and a.source and a.target):
        ap.print_help()
        return 2
    try:
        q = quote(a.amount, a.source, a.target, a.provider)
    except ValueError as e:
        print(f"Error: {e}", file=sys.stderr)
        return 1
    print(f"SIMULATION ONLY — illustrative demo rate")
    print(f"1 {q['source']} = {format_rate(q['rate'])} {q['target']}")
    print(f"converted: {q['converted']:,.2f} {q['target']}")
    if a.provider:
        print(f"mock fee ({PROVIDERS[a.provider]['name']}): {q['fee']:,.2f} {q['target']}")
        print(f"estimated total: {q['total']:,.2f} {q['target']}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
