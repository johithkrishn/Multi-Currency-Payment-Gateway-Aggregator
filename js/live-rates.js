/**
 * live-rates.js — optional LIVE REFERENCE RATES for USD / INR / EUR.
 *
 * Free, keyless, browser-friendly (CORS) sources, tried in order:
 *   1. European Central Bank reference rates via Frankfurter  (official, updated each ECB business day ~16:00 CET)
 *   2. ExchangeRate-API open endpoint (open.er-api.com)        (updated daily)
 *   3. fawazahmed0 currency-api via jsDelivr                   (updated daily)
 * If every source fails, the app falls back to the cached snapshot (if recent)
 * or the demo table — and says so in the UI.
 *
 * These are REFERENCE rates: real market data published by the source, NOT
 * executable quotes and NOT tick-by-tick prices (that needs a paid, keyed feed).
 * Nothing about payments changes: every payment is still simulated.
 *
 * Output is normalised to "units per 1 USD" base rates so the rest of the app
 * (currency.js → buildRateTable) uses exactly the same convention as demo mode.
 *
 * UMD: parsing/validation is testable in Node; fetching uses window.fetch.
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MCPALive = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const CACHE_KEY = "mcpa_live_rates_v1";
  const MAX_CACHE_AGE_MS = 7 * 24 * 3600 * 1000; // older snapshots are not used at all
  const REFRESH_AFTER_MS = 5 * 60 * 1000; // background re-check interval

  // Sanity bounds (units per 1 USD) — reject obviously broken payloads.
  const BOUNDS = { INR: [20, 400], EUR: [0.3, 3] };

  const SOURCES = [
    {
      id: "ecb",
      name: "European Central Bank (via Frankfurter)",
      short: "ECB",
      url: "https://api.frankfurter.dev/v1/latest?base=USD&symbols=INR,EUR",
      home: "https://frankfurter.dev",
      cadence: "Updated each ECB business day (~16:00 CET)",
      parse: function (j) {
        if (!j || j.base !== "USD" || !j.rates) throw new Error("unexpected payload");
        return { INR: j.rates.INR, EUR: j.rates.EUR, asOf: j.date ? j.date + "T16:00:00+01:00" : null };
      },
    },
    {
      id: "erapi",
      name: "ExchangeRate-API (open access)",
      short: "ExchangeRate-API",
      url: "https://open.er-api.com/v6/latest/USD",
      home: "https://www.exchangerate-api.com",
      cadence: "Updated daily",
      parse: function (j) {
        if (!j || j.result !== "success" || j.base_code !== "USD" || !j.rates) throw new Error("unexpected payload");
        return { INR: j.rates.INR, EUR: j.rates.EUR, asOf: j.time_last_update_unix ? new Date(j.time_last_update_unix * 1000).toISOString() : null };
      },
    },
    {
      id: "fawaz",
      name: "currency-api (fawazahmed0, via jsDelivr)",
      short: "currency-api",
      url: "https://cdn.jsdelivr.net/npm/@fawazahmed0/currency-api@latest/v1/currencies/usd.json",
      home: "https://github.com/fawazahmed0/exchange-api",
      cadence: "Updated daily",
      parse: function (j) {
        if (!j || !j.usd) throw new Error("unexpected payload");
        return { INR: j.usd.inr, EUR: j.usd.eur, asOf: j.date ? j.date + "T00:00:00Z" : null };
      },
    },
  ];

  function sourceById(id) {
    return SOURCES.find(function (s) { return s.id === id; }) || null;
  }

  /** Validate + normalise a parsed payload into a snapshot. Throws on bad data. */
  function normalize(sourceId, json, now) {
    const src = sourceById(sourceId);
    if (!src) throw new Error("unknown source " + sourceId);
    const p = src.parse(json);
    ["INR", "EUR"].forEach(function (c) {
      const v = p[c];
      if (typeof v !== "number" || !isFinite(v) || v <= 0) throw new Error(c + " rate missing or invalid");
      if (v < BOUNDS[c][0] || v > BOUNDS[c][1]) throw new Error(c + " rate " + v + " outside sanity bounds");
    });
    const fetchedAt = (now || new Date()).toISOString();
    return {
      rates: { USD: 1, INR: p.INR, EUR: p.EUR },
      asOf: p.asOf && !isNaN(Date.parse(p.asOf)) ? new Date(p.asOf).toISOString() : fetchedAt,
      fetchedAt: fetchedAt,
      sourceId: src.id,
      sourceName: src.name,
      sourceShort: src.short,
      sourceUrl: src.home,
      cadence: src.cadence,
    };
  }

  /** Turn a snapshot into the same config shape currency.js uses for demo rates. */
  function toFxConfig(snap) {
    const day = snap.asOf.slice(0, 10);
    return {
      base: "USD",
      rates: { USD: 1, INR: snap.rates.INR, EUR: snap.rates.EUR },
      label: "Live reference rate",
      source: snap.sourceName + " · reference rate as of " + day,
      disclaimer: "Reference rate from " + snap.sourceShort + " — real market data, not an executable quote. Payments are still simulated.",
      updatedAt: snap.asOf,
      version: "live-" + day,
      live: true,
      fetchedAt: snap.fetchedAt,
      sourceId: snap.sourceId,
      sourceShort: snap.sourceShort,
      sourceUrl: snap.sourceUrl,
      cadence: snap.cadence,
    };
  }

  function isUsable(snap, now) {
    if (!snap || !snap.rates || !snap.fetchedAt) return false;
    const age = (now || Date.now()) - Date.parse(snap.fetchedAt);
    return age >= 0 && age < MAX_CACHE_AGE_MS;
  }

  function needsRefresh(snap, now) {
    return !snap || (now || Date.now()) - Date.parse(snap.fetchedAt) > REFRESH_AFTER_MS;
  }

  // ------------------------------------------------------------ cache ----
  // Browser: localStorage (survives reloads). React Native / blocked storage:
  // an in-memory copy for the life of the app session.
  let memory = null;

  function storage() {
    try {
      const ls = root().localStorage;
      return ls && typeof ls.getItem === "function" ? ls : null;
    } catch (e) {
      return null;
    }
  }

  function getCached() {
    let snap = null;
    const ls = storage();
    if (ls) {
      try {
        const raw = ls.getItem(CACHE_KEY);
        if (raw) snap = JSON.parse(raw);
      } catch (e) { snap = null; }
    }
    if (!snap) snap = memory;
    return isUsable(snap) ? snap : null;
  }

  function setCached(snap) {
    memory = snap;
    const ls = storage();
    if (ls) {
      try { ls.setItem(CACHE_KEY, JSON.stringify(snap)); } catch (e) { /* storage full/blocked: memory copy still works */ }
    }
  }

  function root() { return typeof window !== "undefined" ? window : globalThis; }

  async function fetchJson(url, timeoutMs) {
    const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
    const timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, timeoutMs || 6000);
    try {
      const res = await fetch(url, { signal: ctrl ? ctrl.signal : undefined, cache: "no-cache", credentials: "omit", referrerPolicy: "no-referrer" });
      if (!res.ok) throw new Error("HTTP " + res.status);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  let inflight = null;
  /**
   * Fetch the latest snapshot, trying each source in order.
   * Resolves { snapshot, errors[] }; rejects only if every source failed.
   */
  function fetchLatest(opts) {
    if (inflight) return inflight;
    const o = opts || {};
    inflight = (async function () {
      const errors = [];
      for (let i = 0; i < SOURCES.length; i++) {
        const s = SOURCES[i];
        try {
          const json = await fetchJson(s.url, o.timeoutMs);
          const snap = normalize(s.id, json);
          setCached(snap);
          return { snapshot: snap, errors: errors };
        } catch (e) {
          errors.push(s.short + ": " + (e && e.name === "AbortError" ? "timed out" : (e && e.message) || "failed"));
        }
      }
      const err = new Error("All live rate sources failed");
      err.details = errors;
      throw err;
    })().finally(function () { inflight = null; });
    return inflight;
  }

  return {
    CACHE_KEY: CACHE_KEY,
    SOURCES: SOURCES,
    BOUNDS: BOUNDS,
    REFRESH_AFTER_MS: REFRESH_AFTER_MS,
    MAX_CACHE_AGE_MS: MAX_CACHE_AGE_MS,
    normalize: normalize,
    toFxConfig: toFxConfig,
    isUsable: isUsable,
    needsRefresh: needsRefresh,
    getCached: getCached,
    fetchLatest: fetchLatest,
  };
});
