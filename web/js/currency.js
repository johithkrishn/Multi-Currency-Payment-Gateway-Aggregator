/**
 * currency.js — pure currency, FX, validation and fee logic.
 *
 * CONVERSION CONVENTION (used everywhere — web, mobile, Python helper, tests):
 *   fxRates[source][target] = number of TARGET units received for ONE SOURCE unit.
 *   convertedAmount = amount × fxRates[source][target]
 *
 * The rate table is derived from a single set of "units per 1 USD" base rates so
 * every cross rate is consistent (no triangular-arbitrage drift):
 *   fxRates[s][t] = base[t] / base[s]
 *
 * All values are ILLUSTRATIVE DEMO RATES — not live market quotes.
 *
 * UMD wrapper: works as a browser global (window.MCPACurrency) and as a
 * CommonJS module (Node tests, React Native / Metro).
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.MCPACurrency = factory();
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  const SUPPORTED_CURRENCIES = ["USD", "INR", "EUR"];

  const CURRENCY_META = {
    USD: { code: "USD", name: "US Dollar", symbol: "$", flag: "🇺🇸", decimals: 2, locale: "en-US" },
    INR: { code: "INR", name: "Indian Rupee", symbol: "₹", flag: "🇮🇳", decimals: 2, locale: "en-IN" },
    EUR: { code: "EUR", name: "Euro", symbol: "€", flag: "🇪🇺", decimals: 2, locale: "en-IE" },
  };

  /** Amount limits for validation (in source-currency units). */
  const LIMITS = { MIN: 0.01, MAX: 1000000, MAX_DECIMALS: 2 };

  /** Default demonstration rate set: units of each currency per 1 USD (PRD §10.1 sample values). */
  const DEFAULT_FX_CONFIG = Object.freeze({
    base: "USD",
    rates: Object.freeze({ USD: 1, INR: 83.0, EUR: 0.92 }),
    label: "Demo exchange rate",
    source: "Illustrative demonstration table (PRD v1.0 sample values)",
    disclaimer: "Illustrative rate only. No live FX quote is provided.",
    updatedAt: "2026-01-01T00:00:00.000Z",
    version: 1,
  });

  /** Default mock providers (PRD §10.2). Names are demo labels, fees are mock assumptions. */
  const DEFAULT_PROVIDERS = Object.freeze([
    Object.freeze({
      id: "stripe_mock",
      name: "Stripe-like Mock",
      shortName: "Stripe-like",
      tag: "STR",
      feePercent: 2.9,
      feeFixed: 0,
      enabled: true,
      description: "Card-first global checkout pattern. Mock only — not connected to Stripe.",
      settlementNote: "Simulated T+2 settlement label (display only)",
    }),
    Object.freeze({
      id: "razorpay_mock",
      name: "Razorpay-like Mock",
      shortName: "Razorpay-like",
      tag: "RZP",
      feePercent: 2.0,
      feeFixed: 0,
      enabled: true,
      description: "UPI/India-first checkout pattern. Mock only — not connected to Razorpay.",
      settlementNote: "Simulated T+1 settlement label (display only)",
    }),
  ]);

  // ---------------------------------------------------------------------------
  // Rate table
  // ---------------------------------------------------------------------------

  function isSupported(code) {
    return SUPPORTED_CURRENCIES.indexOf(code) !== -1;
  }

  function isPositiveFinite(n) {
    return typeof n === "number" && isFinite(n) && n > 0;
  }

  /** Validate a base-rate config. Returns { ok, errors[] }. */
  function validateFxConfig(config) {
    const errors = [];
    if (!config || typeof config !== "object") return { ok: false, errors: ["Rate configuration is missing."] };
    if (!config.rates || typeof config.rates !== "object") errors.push("Rate table is missing.");
    else {
      SUPPORTED_CURRENCIES.forEach(function (c) {
        if (!isPositiveFinite(config.rates[c])) errors.push("Rate for " + c + " must be a positive number.");
      });
      if (config.rates[config.base || "USD"] !== 1) errors.push("Base currency rate must equal 1.");
    }
    return { ok: errors.length === 0, errors: errors };
  }

  /** Build the full source→target matrix from base rates. */
  function buildRateTable(config) {
    const cfg = config || DEFAULT_FX_CONFIG;
    const base = cfg.rates;
    const table = {};
    SUPPORTED_CURRENCIES.forEach(function (s) {
      table[s] = {};
      SUPPORTED_CURRENCIES.forEach(function (t) {
        table[s][t] = s === t ? 1 : base[t] / base[s];
      });
    });
    return table;
  }

  /**
   * Look up fxRates[source][target]. Same-currency is always exactly 1.
   * Returns null when the pair is unsupported or the configured rate is invalid.
   */
  function getRate(table, source, target) {
    if (!isSupported(source) || !isSupported(target)) return null;
    if (source === target) return 1;
    const row = table && table[source];
    const rate = row && row[target];
    return isPositiveFinite(rate) ? rate : null;
  }

  // ---------------------------------------------------------------------------
  // Rounding & formatting
  // ---------------------------------------------------------------------------

  /** Round half-away-from-zero to the currency's minor unit using exponent shifting (avoids 1.005 → 1.00). */
  function roundTo(value, decimals) {
    if (!isFinite(value)) return value;
    const sign = value < 0 ? -1 : 1;
    const shifted = Number(Math.abs(value) + "e" + decimals);
    return sign * Number(Math.round(shifted) + "e-" + decimals);
  }

  function roundForCurrency(value, code) {
    const meta = CURRENCY_META[code];
    return roundTo(value, meta ? meta.decimals : 2);
  }

  const _fmtCache = {};
  /** Locale-aware currency format, e.g. ₹8,300.00 (en-IN grouping), $100.00, €92.00. */
  function formatMoney(value, code, opts) {
    const meta = CURRENCY_META[code] || { decimals: 2, locale: "en-US" };
    const o = opts || {};
    const key = code + "|" + (o.compact ? "c" : "") + (o.noSymbol ? "n" : "");
    if (!_fmtCache[key]) {
      const base = o.noSymbol
        ? { minimumFractionDigits: meta.decimals, maximumFractionDigits: meta.decimals }
        : { style: "currency", currency: code, minimumFractionDigits: meta.decimals, maximumFractionDigits: meta.decimals };
      if (o.compact) {
        base.notation = "compact";
        base.maximumFractionDigits = 1;
        base.minimumFractionDigits = 0;
      }
      _fmtCache[key] = new Intl.NumberFormat(meta.locale, base);
    }
    return _fmtCache[key].format(roundForCurrency(value, code));
  }

  /**
   * Format a rate for display with a fixed number of decimals (internal precision is kept):
   * 4 decimals for rates ≥ 1 (83.0000), 6 below 1 (0.012048). Same-currency is "1.0000".
   */
  function formatRate(rate) {
    if (typeof rate !== "number" || !isFinite(rate)) return "—";
    const decimals = rate >= 1 ? 4 : 6;
    return rate.toLocaleString("en-US", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  }

  // ---------------------------------------------------------------------------
  // Validation
  // ---------------------------------------------------------------------------

  const MESSAGES = {
    EMPTY: "Enter an amount greater than zero.",
    NEGATIVE: "Amount cannot be negative. Enter an amount greater than zero.",
    ZERO: "Enter an amount greater than zero.",
    MALFORMED: "Enter a valid number, for example 100 or 99.50.",
    DECIMALS: "Use at most 2 decimal places.",
    TOO_LARGE: "Amount exceeds the demo limit of 1,000,000.",
  };

  /**
   * Validate a raw amount string (or number). Accepts optional thousands
   * separators ("1,250.50") and surrounding spaces.
   * Returns { ok: true, value } or { ok: false, code, error }.
   */
  function validateAmount(raw) {
    if (raw === null || raw === undefined) return fail("EMPTY");
    let s = String(raw).trim();
    if (s === "") return fail("EMPTY");
    if (/^-/.test(s)) {
      const neg = s.replace(/[,\s]/g, "");
      return /^-\d*\.?\d+$/.test(neg) ? fail("NEGATIVE") : fail("MALFORMED");
    }
    // Commas are allowed only as digit-group separators: Western (1,000,000) or
    // Indian (10,00,000). Anything else — e.g. "12,34", a European decimal comma —
    // is rejected rather than silently read as 1234.
    if (/,/.test(s) && !/^(\d{1,3}(,\d{3})+|\d{1,2}(,\d{2})*,\d{3})(\.\d*)?$/.test(s)) return fail("MALFORMED");
    s = s.replace(/,/g, "");
    if (!/^(\d+\.?\d*|\.\d+)$/.test(s)) return fail("MALFORMED");
    const dec = s.indexOf(".") === -1 ? 0 : s.length - s.indexOf(".") - 1;
    if (dec > LIMITS.MAX_DECIMALS) return fail("DECIMALS");
    const value = Number(s);
    if (!isFinite(value)) return fail("MALFORMED");
    if (value === 0) return fail("ZERO");
    if (value < LIMITS.MIN) return fail("ZERO");
    if (value > LIMITS.MAX) return fail("TOO_LARGE");
    return { ok: true, value: value };

    function fail(code) {
      return { ok: false, code: code, error: MESSAGES[code] };
    }
  }

  // ---------------------------------------------------------------------------
  // Fees & quote
  // ---------------------------------------------------------------------------

  /**
   * FEE FORMULA (mock assumption, calculated in the TARGET currency):
   *   feeAmount = convertedAmount × feePercent / 100 + feeFixedInTarget
   *   feeFixedInTarget = provider.feeFixed (defined in USD) × fxRates[USD][target]
   * Totals never mix currencies: total = round(converted) + round(fee), both in target.
   */
  function calcFee(convertedAmount, provider, table, target) {
    if (!provider) return { feeAmount: 0, feeFixedInTarget: 0 };
    const pct = Number(provider.feePercent) || 0;
    const fixedUsd = Number(provider.feeFixed) || 0;
    const fixedRate = getRate(table, "USD", target) || 0;
    const feeFixedInTarget = fixedUsd * fixedRate;
    return { feeAmount: (convertedAmount * pct) / 100 + feeFixedInTarget, feeFixedInTarget: feeFixedInTarget };
  }

  /**
   * Build a full, display-ready quote. Keeps internal precision; *Display fields are rounded.
   * Returns { ok:false, error } when inputs are invalid.
   */
  function quote(params) {
    const p = params || {};
    const v = typeof p.amount === "number" ? validateAmount(String(p.amount)) : validateAmount(p.amount);
    if (!v.ok) return { ok: false, error: v.error, code: v.code };
    if (!isSupported(p.source) || !isSupported(p.target)) return { ok: false, error: "Unsupported currency.", code: "CURRENCY" };
    const table = p.table || buildRateTable(DEFAULT_FX_CONFIG);
    const rate = getRate(table, p.source, p.target);
    if (rate === null) return { ok: false, error: "No valid demo rate is configured for " + p.source + " → " + p.target + ".", code: "RATE" };

    const converted = v.value * rate;
    const fee = calcFee(converted, p.provider, table, p.target);
    const convertedDisplay = roundForCurrency(converted, p.target);
    const feeDisplay = roundForCurrency(fee.feeAmount, p.target);
    const totalDisplay = roundForCurrency(convertedDisplay + feeDisplay, p.target);

    return {
      ok: true,
      sourceAmount: v.value,
      sourceCurrency: p.source,
      targetCurrency: p.target,
      exchangeRate: rate,
      inverseRate: 1 / rate,
      convertedAmount: converted,
      convertedDisplay: convertedDisplay,
      feeAmount: fee.feeAmount,
      feeDisplay: feeDisplay,
      feeFixedInTarget: fee.feeFixedInTarget,
      feeCurrency: p.target,
      feePercent: p.provider ? Number(p.provider.feePercent) || 0 : 0,
      feeFixed: p.provider ? Number(p.provider.feeFixed) || 0 : 0,
      totalDisplay: totalDisplay,
      providerId: p.provider ? p.provider.id : null,
    };
  }

  /** Human-readable formula strings for explaining a quote. */
  function explain(q) {
    if (!q || !q.ok) return null;
    return {
      conversion:
        formatMoney(q.sourceAmount, q.sourceCurrency) + " × " + formatRate(q.exchangeRate) + " = " + formatMoney(q.convertedDisplay, q.targetCurrency),
      fee:
        formatMoney(q.convertedDisplay, q.targetCurrency) + " × " + q.feePercent + "%" +
        (q.feeFixed ? " + " + formatMoney(q.feeFixedInTarget, q.targetCurrency) + " fixed" : "") +
        " = " + formatMoney(q.feeDisplay, q.targetCurrency),
      total: formatMoney(q.convertedDisplay, q.targetCurrency) + " + " + formatMoney(q.feeDisplay, q.targetCurrency) + " = " + formatMoney(q.totalDisplay, q.targetCurrency),
      direction: "1 " + q.sourceCurrency + " = " + formatRate(q.exchangeRate) + " " + q.targetCurrency,
      inverse: "1 " + q.targetCurrency + " = " + formatRate(q.inverseRate) + " " + q.sourceCurrency,
    };
  }

  return {
    SUPPORTED_CURRENCIES: SUPPORTED_CURRENCIES,
    CURRENCY_META: CURRENCY_META,
    LIMITS: LIMITS,
    MESSAGES: MESSAGES,
    DEFAULT_FX_CONFIG: DEFAULT_FX_CONFIG,
    DEFAULT_PROVIDERS: DEFAULT_PROVIDERS,
    isSupported: isSupported,
    validateFxConfig: validateFxConfig,
    buildRateTable: buildRateTable,
    getRate: getRate,
    roundTo: roundTo,
    roundForCurrency: roundForCurrency,
    formatMoney: formatMoney,
    formatRate: formatRate,
    validateAmount: validateAmount,
    calcFee: calcFee,
    quote: quote,
    explain: explain,
  };
});
