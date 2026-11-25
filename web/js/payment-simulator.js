/**
 * payment-simulator.js — deterministic mock payment engine.
 *
 * NOTHING here contacts a payment provider. Outcomes are decided locally by a
 * documented rule or a demo control so both states can be demonstrated on demand.
 *
 * OUTCOME MODES
 *   "success"    → always "Simulated success"
 *   "failure"    → always "Simulated failure" with the configured demo reason
 *   "rule_based" → predictable rules, checked in order:
 *       R1  source amount whose cents are exactly .13  → FAILED  SIM_ISSUER_DECLINED
 *       R2  USD-equivalent amount above 25,000         → FAILED  SIM_RISK_LIMIT
 *       R3  provider is disabled                       → FAILED  SIM_PROVIDER_UNAVAILABLE
 *       otherwise                                      → SUCCESS
 *
 * STATE MACHINE: CREATED → AUTHORIZING → PROCESSING → (SUCCESS | FAILED)
 */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory(require("./currency.js"));
  else root.MCPASimulator = factory(root.MCPACurrency);
})(typeof self !== "undefined" ? self : this, function (Currency) {
  "use strict";

  const OUTCOME_MODES = {
    success: { id: "success", label: "Always succeed", short: "Success" },
    failure: { id: "failure", label: "Always fail", short: "Failure" },
    rule_based: { id: "rule_based", label: "Rule-based (deterministic)", short: "Rules" },
  };

  const FAILURE_REASONS = {
    SIM_ISSUER_DECLINED: { code: "SIM_ISSUER_DECLINED", message: "Simulated issuer decline (forced by demo settings)." },
    SIM_RISK_LIMIT: { code: "SIM_RISK_LIMIT", message: "Simulated risk-limit decline (demo rule: above 25,000 USD equivalent)." },
    SIM_PROVIDER_UNAVAILABLE: { code: "SIM_PROVIDER_UNAVAILABLE", message: "Simulated provider unavailable (mock provider is disabled)." },
    SIM_PROVIDER_TIMEOUT: { code: "SIM_PROVIDER_TIMEOUT", message: "Simulated provider timeout (demo failure)." },
    SIM_INSUFFICIENT_BALANCE: { code: "SIM_INSUFFICIENT_BALANCE", message: "Simulated insufficient balance (demo failure)." },
    SIM_AUTH_FAILED: { code: "SIM_AUTH_FAILED", message: "Simulated authentication failure (demo failure)." },
  };

  const FORCEABLE_FAILURES = ["SIM_PROVIDER_TIMEOUT", "SIM_INSUFFICIENT_BALANCE", "SIM_AUTH_FAILED", "SIM_ISSUER_DECLINED"];

  const STATES = ["CREATED", "AUTHORIZING", "PROCESSING"];
  const STATE_LABELS = {
    CREATED: "Attempt created",
    AUTHORIZING: "Mock authorisation",
    PROCESSING: "Mock processing",
    SUCCESS: "Simulated success",
    FAILED: "Simulated failure",
  };

  const RISK_LIMIT_USD = 25000;

  /**
   * Decide the outcome. Pure + deterministic for a given input.
   * @returns {{status:"SUCCESS"|"FAILED", failureCode:string|null, failureReason:string|null, rule:string}}
   */
  function decideOutcome(input) {
    const mode = input.mode || "rule_based";
    if (mode === "success") return ok("Demo control: always succeed");
    if (mode === "failure") {
      const code = FAILURE_REASONS[input.forcedFailure] ? input.forcedFailure : "SIM_PROVIDER_TIMEOUT";
      return failed(code, "Demo control: always fail");
    }
    // rule_based
    const cents = Math.round((input.sourceAmount % 1) * 100);
    if (cents === 13) return failed("SIM_ISSUER_DECLINED", "R1 amount ends in .13", "Simulated issuer decline (demo rule: amount ending in .13).");
    const usdRate = Currency.getRate(input.table, input.sourceCurrency, "USD");
    if (usdRate && input.sourceAmount * usdRate > RISK_LIMIT_USD) return failed("SIM_RISK_LIMIT", "R2 above risk limit");
    if (input.provider && input.provider.enabled === false) return failed("SIM_PROVIDER_UNAVAILABLE", "R3 provider disabled");
    return ok("No failure rule matched");

    function ok(rule) {
      return { status: "SUCCESS", failureCode: null, failureReason: null, rule: rule };
    }
    function failed(code, rule, reason) {
      return { status: "FAILED", failureCode: code, failureReason: reason || FAILURE_REASONS[code].message, rule: rule };
    }
  }

  function randomBase36(len) {
    let out = "";
    const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"; // Crockford-ish, no I/L/O/U
    const c = typeof crypto !== "undefined" && crypto.getRandomValues ? crypto : null;
    const bytes = new Uint8Array(len);
    if (c) c.getRandomValues(bytes);
    else for (let i = 0; i < len; i++) bytes[i] = Math.floor(Math.random() * 256);
    for (let i = 0; i < len; i++) out += alphabet[bytes[i] % alphabet.length];
    return out;
  }

  /** Unique reference like SIM-RZP-20261120-7KQ2M9. Guaranteed unique against `existing` ids. */
  function generateReference(providerTag, existing, now) {
    const d = now || new Date();
    const ymd = d.getUTCFullYear() + String(d.getUTCMonth() + 1).padStart(2, "0") + String(d.getUTCDate()).padStart(2, "0");
    const taken = existing instanceof Set ? existing : new Set(existing || []);
    let ref;
    let guard = 0;
    do {
      ref = "SIM-" + (providerTag || "MCK") + "-" + ymd + "-" + randomBase36(6);
      guard++;
    } while (taken.has(ref) && guard < 50);
    return ref;
  }

  /**
   * Build the immutable transaction snapshot (PRD §10.3 + extra audit fields).
   * The record keeps the rate & fee assumptions used at the time of the attempt.
   */
  function buildTransaction(args) {
    const q = args.quote;
    const p = args.provider;
    const outcome = args.outcome;
    const fx = args.fxConfig || Currency.DEFAULT_FX_CONFIG;
    const created = args.createdAt || new Date().toISOString();
    return {
      id: args.id,
      createdAt: created,
      sourceAmount: q.sourceAmount,
      sourceCurrency: q.sourceCurrency,
      targetCurrency: q.targetCurrency,
      exchangeRate: q.exchangeRate,
      convertedAmount: q.convertedDisplay,
      providerId: p.id,
      providerName: p.name,
      feePercent: q.feePercent,
      feeFixed: q.feeFixed,
      feeAmount: q.feeDisplay,
      feeCurrency: q.feeCurrency,
      totalAmount: q.totalDisplay,
      status: outcome.status,
      failureCode: outcome.failureCode,
      failureReason: outcome.failureReason,
      outcomeMode: args.mode || "rule_based",
      outcomeRule: outcome.rule,
      rateLabel: fx.label,
      rateSource: fx.source,
      rateUpdatedAt: fx.updatedAt,
      rateVersion: fx.version,
      timeline: args.timeline || [],
      mode: "SIMULATED",
    };
  }

  /**
   * Run the simulated state machine. `onStep(state, index)` is awaited between
   * transitions so the UI can animate. latencyMs = 0 gives an instant run.
   */
  async function run(input, hooks) {
    const h = hooks || {};
    const latency = typeof h.latencyMs === "number" ? h.latencyMs : 600;
    const timeline = [];
    for (let i = 0; i < STATES.length; i++) {
      timeline.push({ state: STATES[i], label: STATE_LABELS[STATES[i]], at: new Date().toISOString() });
      if (h.onStep) await h.onStep(STATES[i], i);
      if (latency) await sleep(latency * (i === 2 ? 1.4 : 1));
    }
    const outcome = decideOutcome(input);
    timeline.push({ state: outcome.status, label: STATE_LABELS[outcome.status], at: new Date().toISOString() });
    return { outcome: outcome, timeline: timeline };
  }

  function sleep(ms) {
    return new Promise(function (r) { setTimeout(r, ms); });
  }

  return {
    OUTCOME_MODES: OUTCOME_MODES,
    FAILURE_REASONS: FAILURE_REASONS,
    FORCEABLE_FAILURES: FORCEABLE_FAILURES,
    STATES: STATES,
    STATE_LABELS: STATE_LABELS,
    RISK_LIMIT_USD: RISK_LIMIT_USD,
    decideOutcome: decideOutcome,
    generateReference: generateReference,
    buildTransaction: buildTransaction,
    run: run,
  };
});
