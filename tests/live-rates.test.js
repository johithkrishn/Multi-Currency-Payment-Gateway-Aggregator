/**
 * Offline tests for web/js/live-rates.js — no network needed.
 * Payload shapes mirror the real responses of each source.
 */
"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const Live = require(path.join(__dirname, "../web/js/live-rates.js"));
const C = require(path.join(__dirname, "../web/js/currency.js"));

const NOW = new Date("2026-11-20T10:00:00Z");

const payloads = {
  ecb: { amount: 1.0, base: "USD", date: "2026-11-19", rates: { EUR: 0.90975, INR: 93.3 } },
  erapi: { result: "success", base_code: "USD", time_last_update_unix: 1795046551, rates: { USD: 1, INR: 93.513568, EUR: 0.911253 } },
  fawaz: { date: "2026-11-19", usd: { inr: 93.31832517, eur: 0.91179755, gbp: 0.79 } },
};

test("sources are tried in a fixed order: ECB first, then fallbacks", () => {
  assert.deepEqual(Live.SOURCES.map((s) => s.id), ["ecb", "erapi", "fawaz"]);
  for (const s of Live.SOURCES) assert.match(s.url, /^https:\/\//, "HTTPS only");
});

for (const [id, json] of Object.entries(payloads)) {
  test(`normalize(${id}) → units per 1 USD + metadata`, () => {
    const snap = Live.normalize(id, json, NOW);
    assert.equal(snap.rates.USD, 1);
    assert.ok(snap.rates.INR > 90 && snap.rates.INR < 95);
    assert.ok(snap.rates.EUR > 0.9 && snap.rates.EUR < 0.92);
    assert.equal(snap.sourceId, id);
    assert.ok(!isNaN(Date.parse(snap.asOf)), "asOf is a valid date");
    assert.equal(snap.fetchedAt, NOW.toISOString());
  });
}

test("ECB snapshot keeps the publication date", () => {
  const snap = Live.normalize("ecb", payloads.ecb, NOW);
  assert.equal(snap.asOf.slice(0, 10), "2026-11-19");
});

test("bad payloads are rejected instead of producing wrong prices", () => {
  assert.throws(() => Live.normalize("ecb", { base: "EUR", rates: { INR: 90, EUR: 1 } }), /unexpected/);
  assert.throws(() => Live.normalize("ecb", { base: "USD", rates: { INR: 93.3 } }), /EUR/);
  assert.throws(() => Live.normalize("ecb", { base: "USD", rates: { INR: -5, EUR: 0.9 } }), /INR/);
  assert.throws(() => Live.normalize("ecb", { base: "USD", rates: { INR: 9330, EUR: 0.9 } }), /sanity/, "100× off is caught");
  assert.throws(() => Live.normalize("erapi", { result: "error", "error-type": "quota-reached" }), /unexpected/);
  assert.throws(() => Live.normalize("nope", {}), /unknown source/);
});

test("live config plugs into the same rate convention as demo mode", () => {
  const cfg = Live.toFxConfig(Live.normalize("ecb", payloads.ecb, NOW));
  assert.equal(C.validateFxConfig(cfg).ok, true);
  assert.equal(cfg.live, true);
  assert.equal(cfg.label, "Live reference rate");
  assert.equal(cfg.version, "live-2026-11-19");
  assert.match(cfg.disclaimer, /not an executable quote/);
  const table = C.buildRateTable(cfg);
  assert.equal(table.USD.INR, 93.3);
  assert.equal(table.INR.USD, 1 / 93.3);
  assert.equal(table.EUR.INR, 93.3 / 0.90975);
  const q = C.quote({ amount: "100", source: "USD", target: "INR", provider: { id: "x", feePercent: 2, feeFixed: 0 }, table });
  assert.equal(q.convertedDisplay, 9330);
  assert.equal(q.feeDisplay, 186.6);
  assert.equal(q.totalDisplay, 9516.6);
});

test("cache freshness rules", () => {
  const snap = Live.normalize("ecb", payloads.ecb, NOW);
  const t = NOW.getTime();
  assert.equal(Live.isUsable(snap, t + 60 * 1000), true);
  assert.equal(Live.isUsable(snap, t + 8 * 24 * 3600 * 1000), false, "older than 7 days is discarded");
  assert.equal(Live.needsRefresh(snap, t + 60 * 1000), false);
  assert.equal(Live.needsRefresh(snap, t + 6 * 60 * 1000), true, "re-checked after 5 minutes");
  assert.equal(Live.needsRefresh(null), true);
});
