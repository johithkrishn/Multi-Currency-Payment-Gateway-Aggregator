# Conversion & simulation test cases

Machine-readable source of truth: [`conversion-cases.json`](conversion-cases.json).
Run everything with `npm test` (Node's built-in runner + optional Python cross-check).

## Convention

```
fxRates[source][target] = target units received for ONE source unit
convertedAmount         = amount × fxRates[source][target]
feeAmount               = convertedAmount × feePercent / 100 + feeFixed(USD) × fxRates[USD][target]
estimatedTotal          = round(convertedAmount) + round(feeAmount)       ← all in the TARGET currency
```

Demo base rates (PRD v1.0 sample values, **illustrative only**): 1 USD = 83.0 INR = 0.92 EUR.
Cross rates are derived (`fxRates[s][t] = base[t] / base[s]`), so the table is always internally consistent.
Rounding: half-up to 2 decimals, applied only at the display step.

## Conversion cases

| ID | Amount | Pair | Provider | Rate shown | Converted | Fee | Total |
|----|-------:|------|----------|-----------:|----------:|----:|------:|
| C01 | 100 | USD → INR | Stripe-like (2.9%) | 83.0000 | ₹8,300.00 | ₹240.70 | ₹8,540.70 |
| C02 | 100 | USD → INR | Razorpay-like (2%) | 83.0000 | ₹8,300.00 | ₹166.00 | ₹8,466.00 |
| C03 | 100 | USD → USD | Stripe-like | 1.0000 | $100.00 | $2.90 | $102.90 |
| C04 | 2,500 | EUR → USD | Razorpay-like | 1.0870 | $2,717.39 | $54.35 | $2,771.74 |
| C05 | 2,500 | EUR → USD | Stripe-like | 1.0870 | $2,717.39 | $78.80 | $2,796.19 |
| C06 | 15,000 | INR → EUR | Stripe-like | 0.011084 | €166.27 | €4.82 | €171.09 |
| C07 | 1,000 | INR → USD | Razorpay-like | 0.012048 | $12.05 | $0.24 | $12.29 |
| C08 | 0.01 | EUR → INR | Stripe-like | 90.2174 | ₹0.90 | ₹0.03 | ₹0.93 |
| C09 | 1,000,000 | USD → EUR | Razorpay-like | 0.920000 | €920,000.00 | €18,400.00 | €938,400.00 |
| C10 | 499.99 | USD → INR | Stripe-like | 83.0000 | ₹41,499.17 | ₹1,203.48 | ₹42,702.65 |
| C11 | 820 | EUR → INR | Razorpay-like | 90.2174 | ₹73,978.26 | ₹1,479.57 | ₹75,457.83 |
| C12 | 1,250.50 | INR → INR | Razorpay-like | 1.0000 | ₹1,250.50 | ₹25.01 | ₹1,275.51 |

## Validation cases

| Input | Result | Message |
|-------|--------|---------|
| *(empty)* / spaces | ✗ EMPTY | Enter an amount greater than zero. |
| `0`, `0.00` | ✗ ZERO | Enter an amount greater than zero. |
| `-5` | ✗ NEGATIVE | Amount cannot be negative… |
| `abc`, `1e5`, `1.2.3`, `12,34`, `99,5`, `1,0,00` | ✗ MALFORMED | Enter a valid number, for example 100 or 99.50. |
| `1.234` | ✗ DECIMALS | Use at most 2 decimal places. |
| `1000000.01` | ✗ TOO_LARGE | Amount exceeds the demo limit of 1,000,000. |
| `100`, ` 99.50 `, `.5`, `1,250.50`, `1,00,000`, `1,000,000` | ✓ | — |

> A comma is accepted only as a Western (`1,000,000`) or Indian (`10,00,000`) digit-group separator.
> `12,34` is rejected instead of being silently read as 1234 (protects users whose keypad shows a decimal comma).

## Simulated outcome cases (rule-based mode unless stated)

| ID | Input | Expected |
|----|-------|----------|
| O01 | 100 USD | SUCCESS |
| O02 | 100.13 USD | FAILED · SIM_ISSUER_DECLINED (R1: cents = .13) |
| O03 | 64.13 EUR | FAILED · SIM_ISSUER_DECLINED |
| O04 | 25,000 USD | SUCCESS (limit is *above* 25,000) |
| O05 | 25,000.01 USD | FAILED · SIM_RISK_LIMIT (R2) |
| O06 | 30,000 EUR (≈ 32,609 USD) | FAILED · SIM_RISK_LIMIT |
| O07 | 1,000,000 INR (≈ 12,048 USD) | SUCCESS |
| O08 | provider disabled | FAILED · SIM_PROVIDER_UNAVAILABLE (R3) |
| O09 | 100.13 USD, mode = success | SUCCESS (demo control overrides rules) |
| O10 | mode = failure, reason = SIM_AUTH_FAILED | FAILED · SIM_AUTH_FAILED |

## Critical-path checklist (PRD §17.2) — automated coverage

| Check | How it is verified |
|-------|--------------------|
| Valid amounts accepted; empty/negative/zero/malformed/large handled | `amount validation` tests |
| Same-currency rate = 1; source→target direction correct | `rate table follows … convention` |
| Converted values correct | C01–C12 |
| Both simulated outcomes demonstrable | O01–O10 |
| Every attempt has a unique reference | 3,000 generated references, no duplicates |
| Changing rates does not modify historical snapshots | `records snapshot the rate & fee` |
| Web and mobile produce matching results | byte-identical core + identical quotes test |
| History persistence, filters, storage errors, responsive layout, mobile sheet | manual — see README testing notes |
