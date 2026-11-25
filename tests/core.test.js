/**
 * Unit tests for the shared calculation core — run with:  node --test tests/
 * Uses only Node's built-in test runner (no dependencies).
 *
 * Every fixture in conversion-cases.json is checked against:
 *   1. web/js            (the web app's modules)
 *   2. mobile/src/core   (the React Native copies — must match byte-for-byte below the header)
 *   3. tools/fx_helper.py (optional Python helper, when python3 is available)
 */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const ROOT = path.join(__dirname, "..");
const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, "conversion-cases.json"), "utf8"));

const impls = {
  web: { C: require(path.join(ROOT, "web/js/currency.js")), S: require(path.join(ROOT, "web/js/payment-simulator.js")) },
};
const mobileCore = path.join(ROOT, "mobile/src/core/currency.js");
if (fs.existsSync(mobileCore)) {
  impls.mobile = { C: require(mobileCore), S: require(path.join(ROOT, "mobile/src/core/payment-simulator.js")) };
}

function provider(C, id, enabled) {
  const p = Object.assign({}, C.DEFAULT_PROVIDERS.find((x) => x.id === id), fixtures.providers[id]);
  if (enabled === false) p.enabled = false;
  return p;
}

for (const [name, { C, S }] of Object.entries(impls)) {
  const table = C.buildRateTable({ rates: fixtures.fxRates.rates });

  test(`[${name}] rate table follows fxRates[source][target] convention`, () => {
    assert.equal(table.USD.INR, 83);
    assert.equal(table.USD.EUR, 0.92);
    assert.equal(table.INR.USD, 1 / 83);
    assert.equal(table.EUR.INR, 83 / 0.92);
    for (const c of C.SUPPORTED_CURRENCIES) assert.equal(C.getRate(table, c, c), 1, `same-currency ${c}`);
    // Round trip: A→B→A returns the original within float tolerance.
    for (const a of C.SUPPORTED_CURRENCIES) for (const b of C.SUPPORTED_CURRENCIES) {
      assert.ok(Math.abs(table[a][b] * table[b][a] - 1) < 1e-12, `${a}↔${b} round trip`);
    }
    assert.equal(C.getRate(table, "USD", "GBP"), null, "unsupported currency");
    assert.equal(C.getRate({ USD: { INR: NaN } }, "USD", "INR"), null, "invalid configured rate");
  });

  for (const c of fixtures.conversions) {
    test(`[${name}] ${c.id} ${c.amount} ${c.source}→${c.target} via ${c.provider}`, () => {
      const q = C.quote({ amount: c.amount, source: c.source, target: c.target, provider: provider(C, c.provider), table });
      assert.ok(q.ok, q.error);
      assert.equal(C.formatRate(q.exchangeRate), c.rate, "rate display");
      assert.equal(q.convertedDisplay, c.converted, "converted");
      assert.equal(q.feeDisplay, c.fee, "fee");
      assert.equal(q.totalDisplay, c.total, "total");
      assert.equal(q.feeCurrency, c.target, "fee is charged in the target currency");
    });
  }

  test(`[${name}] amount validation`, () => {
    for (const v of fixtures.validation) {
      const r = C.validateAmount(v.input);
      assert.equal(r.ok, v.ok, `input ${JSON.stringify(v.input)}`);
      if (v.ok) assert.equal(r.value, v.value, `value for ${JSON.stringify(v.input)}`);
      else {
        assert.equal(r.code, v.code, `code for ${JSON.stringify(v.input)}`);
        assert.ok(r.error && r.error.length > 5, "has a human message");
      }
    }
    assert.equal(C.validateAmount("0").error, "Enter an amount greater than zero.");
  });

  test(`[${name}] rounding is half-up at the currency minor unit`, () => {
    assert.equal(C.roundTo(1.005, 2), 1.01);
    assert.equal(C.roundTo(2.675, 2), 2.68);
    assert.equal(C.roundTo(-1.005, 2), -1.01);
    assert.equal(C.roundForCurrency(8300.004, "INR"), 8300);
  });

  test(`[${name}] formatting`, () => {
    assert.equal(C.formatMoney(8300, "INR"), "₹8,300.00");
    assert.equal(C.formatMoney(830000, "INR"), "₹8,30,000.00", "Indian digit grouping");
    assert.equal(C.formatMoney(100, "USD"), "$100.00");
    assert.match(C.formatMoney(92, "EUR"), /€92\.00/);
    assert.equal(C.formatRate(83), "83.0000");
    assert.equal(C.formatRate(1 / 83), "0.012048");
    assert.equal(C.formatRate(NaN), "—");
  });

  test(`[${name}] fixed fee is converted from USD into the target currency`, () => {
    const p = { id: "x", feePercent: 1, feeFixed: 0.3, enabled: true };
    const q = C.quote({ amount: "100", source: "USD", target: "INR", provider: p, table });
    // 1% of 8300 = 83, + 0.30 USD × 83 = 24.90 → fee 107.90
    assert.equal(q.feeDisplay, 107.9);
    assert.equal(q.totalDisplay, 8407.9);
  });

  test(`[${name}] quote rejects invalid input instead of guessing`, () => {
    assert.equal(C.quote({ amount: "-1", source: "USD", target: "INR", table }).ok, false);
    assert.equal(C.quote({ amount: "10", source: "USD", target: "JPY", table }).ok, false);
    const bad = C.quote({ amount: "10", source: "USD", target: "INR", table: { USD: { INR: 0 } } });
    assert.equal(bad.ok, false);
    assert.equal(bad.code, "RATE");
  });

  for (const o of fixtures.outcomes) {
    test(`[${name}] outcome ${o.id} (${o.mode}, ${o.amount} ${o.source})`, () => {
      const r = S.decideOutcome({
        mode: o.mode, forcedFailure: o.forcedFailure, sourceAmount: o.amount, sourceCurrency: o.source,
        table, provider: provider(C, o.provider, o.providerEnabled),
      });
      assert.equal(r.status, o.status);
      assert.equal(r.failureCode, o.failureCode);
      if (r.status === "FAILED") assert.match(r.failureReason, /^Simulated /, "failure reasons are labelled simulated");
    });
  }

  test(`[${name}] forced issuer decline does not claim the amount ended in .13`, () => {
    const r = S.decideOutcome({
      mode: "failure", forcedFailure: "SIM_ISSUER_DECLINED", sourceAmount: 2.12, sourceCurrency: "USD",
      table, provider: provider(C, "stripe_mock"),
    });
    assert.equal(r.status, "FAILED");
    assert.equal(r.failureCode, "SIM_ISSUER_DECLINED");
    assert.equal(r.rule, "Demo control: always fail");
    assert.equal(r.failureReason, "Simulated issuer decline (forced by demo settings).");
  });

  test(`[${name}] rule-based issuer decline explains its .13 trigger`, () => {
    const r = S.decideOutcome({
      mode: "rule_based", sourceAmount: 2.13, sourceCurrency: "USD", table,
      provider: provider(C, "stripe_mock"),
    });
    assert.equal(r.status, "FAILED");
    assert.equal(r.failureCode, "SIM_ISSUER_DECLINED");
    assert.equal(r.failureReason, "Simulated issuer decline (demo rule: amount ending in .13).");
  });

  test(`[${name}] outcomes are deterministic (same input → same result, 200×)`, () => {
    const input = { mode: "rule_based", sourceAmount: 77.13, sourceCurrency: "USD", table, provider: provider(C, "stripe_mock") };
    const first = JSON.stringify(S.decideOutcome(input));
    for (let i = 0; i < 200; i++) assert.equal(JSON.stringify(S.decideOutcome(input)), first);
  });

  test(`[${name}] transaction references are unique and well-formed`, () => {
    const seen = new Set();
    for (let i = 0; i < 3000; i++) {
      const ref = S.generateReference("RZP", seen, new Date("2026-11-20T10:00:00Z"));
      assert.match(ref, /^SIM-RZP-20261120-[0-9A-Z]{6}$/);
      assert.ok(!seen.has(ref), "duplicate reference");
      seen.add(ref);
    }
  });

  test(`[${name}] records snapshot the rate & fee — later rate changes do not rewrite them`, () => {
    const p = provider(C, "razorpay_mock");
    const q = C.quote({ amount: "100", source: "USD", target: "INR", provider: p, table });
    const txn = S.buildTransaction({ id: "SIM-RZP-TEST", quote: q, provider: p, outcome: { status: "SUCCESS", failureCode: null, failureReason: null, rule: "t" }, mode: "rule_based" });
    const before = JSON.stringify(txn);
    const newTable = C.buildRateTable({ rates: { USD: 1, INR: 90, EUR: 0.95 } });
    assert.equal(newTable.USD.INR, 90);
    assert.equal(JSON.stringify(txn), before);
    assert.equal(txn.exchangeRate, 83);
    assert.equal(txn.mode, "SIMULATED");
    for (const k of ["id", "createdAt", "sourceAmount", "sourceCurrency", "targetCurrency", "exchangeRate", "convertedAmount", "providerId", "feeAmount", "status", "failureReason", "mode"]) {
      assert.ok(k in txn, `PRD §10.3 field ${k}`);
    }
  });

  test(`[${name}] state machine runs CREATED → AUTHORIZING → PROCESSING → outcome`, async () => {
    const seenSteps = [];
    const r = await S.run({ mode: "failure", forcedFailure: "SIM_PROVIDER_TIMEOUT", sourceAmount: 10, sourceCurrency: "USD", table, provider: provider(C, "stripe_mock") },
      { latencyMs: 0, onStep: (s) => seenSteps.push(s) });
    assert.deepEqual(seenSteps, ["CREATED", "AUTHORIZING", "PROCESSING"]);
    assert.deepEqual(r.timeline.map((t) => t.state), ["CREATED", "AUTHORIZING", "PROCESSING", "FAILED"]);
  });
}

test("mobile core files are byte-identical copies of web/js (below the sync header)", { skip: !impls.mobile && "mobile app not present" }, () => {
  for (const f of ["currency.js", "payment-simulator.js", "live-rates.js"]) {
    const web = fs.readFileSync(path.join(ROOT, "web/js", f), "utf8");
    const mob = fs.readFileSync(path.join(ROOT, "mobile/src/core", f), "utf8").split("\n").slice(6).join("\n");
    assert.equal(mob, web, `${f} drifted — re-copy web/js/${f} into mobile/src/core`);
  }
});

test("web and mobile produce identical quotes for every fixture", { skip: !impls.mobile && "mobile app not present" }, () => {
  for (const c of fixtures.conversions) {
    const out = ["web", "mobile"].map((k) => {
      const { C } = impls[k];
      return JSON.stringify(C.quote({ amount: c.amount, source: c.source, target: c.target, provider: provider(C, c.provider), table: C.buildRateTable({ rates: fixtures.fxRates.rates }) }));
    });
    assert.equal(out[0], out[1], c.id);
  }
});

let python = null;
try { execFileSync("python3", ["--version"], { stdio: "ignore" }); python = "python3"; } catch (e) { /* optional */ }

test("Python helper agrees with every conversion fixture", { skip: !python && "python3 not installed" }, () => {
  const out = execFileSync(python, ["-I", path.join(ROOT, "tools/fx_helper.py"), "--check", path.join(__dirname, "conversion-cases.json")], { encoding: "utf8" });
  assert.match(out, /ALL \d+ CASES PASS/);
});
