/**
 * app.js — Checkout / Payment Review / Payment Result screens.
 *
 * Flow (PRD Journey 1):
 *   amount → currencies → demo rate → provider → Review Payment (modal)
 *   → Simulate Payment → state machine animation → record SAVED → result shown.
 *
 * Deep links:  index.html?amount=100&from=USD&to=INR&provider=razorpay_mock
 *              index.html#result=<transaction reference>
 */
(function () {
  "use strict";

  const C = window.MCPACurrency;
  const Sim = window.MCPASimulator;
  const Store = window.MCPAStorage;
  const UI = window.MCPAUI;
  const { $, $$, esc } = UI;

  UI.boot("checkout");

  // ---------------------------------------------------------------- state ----
  const fx = UI.getFxConfig();
  let settings = UI.getSettings().data;
  // Active rates: live reference rates (when enabled + available) or the demo table.
  let active = UI.getActiveFx();
  let fxConfig = active.config;
  let table = C.buildRateTable(fxConfig);
  let demoTable = C.buildRateTable(fx.config);
  // live status: "idle" | "loading" | "ok" | "error"
  const live = { status: "idle", errors: [], lastChecked: active.snapshot ? active.snapshot.fetchedAt : null };

  function applyActive() {
    active = UI.getActiveFx();
    fxConfig = active.config;
    table = C.buildRateTable(fxConfig);
    demoTable = C.buildRateTable(UI.getFxConfig().config);
  }

  /** Fetch live reference rates (if Live is selected). Silent unless something changes. */
  function refreshLive(force) {
    if (settings.rateSource !== "live" || !window.MCPALive) return;
    const cached = MCPALive.getCached();
    if (!force && cached && !MCPALive.needsRefresh(cached)) return;
    const before = active.mode === "live" ? JSON.stringify(active.snapshot.rates) : null;
    live.status = "loading";
    if (typeof update === "function") update();
    MCPALive.fetchLatest().then(function (res) {
      live.status = "ok";
      live.errors = res.errors;
      live.lastChecked = res.snapshot.fetchedAt;
      applyActive();
      update();
      const changed = before !== JSON.stringify(res.snapshot.rates);
      if (changed) {
        const p = $("#rate-panel");
        p.classList.remove("flash"); void p.offsetWidth; p.classList.add("flash");
        if (before !== null || force) UI.toast("Live reference rates updated · " + res.snapshot.sourceShort + " · as of " + UI.fmtDate(res.snapshot.asOf), "success", { delay: 2600 });
      } else if (force) {
        UI.toast("Live rates are up to date (" + res.snapshot.sourceShort + ").", "info", { delay: 2000 });
      }
    }).catch(function (err) {
      live.status = "error";
      live.errors = (err && err.details) || [String(err)];
      applyActive();
      update();
      if (force || active.mode !== "live") {
        UI.toast(active.mode === "live" ? "Couldn't reach live rate sources — using the last saved live rates." : "Couldn't reach live rate sources — using the demo table for now.", "warning", { delay: 4200 });
      }
    });
  }

  const state = {
    amountRaw: "",
    source: "USD",
    target: "INR",
    providerId: null,
    touched: false,
    startedAt: null, // first interaction → used for the "under 30 s" timer
    busy: false,
  };

  if (fx.error) {
    UI.showBanner("#page-alerts", fx.error, [{ label: "Reset demo rates", onClick: function () {
      Store.remove(Store.KEYS.FX_RATES); location.reload();
    } }]);
  }

  // ------------------------------------------------- URL prefill (shareable) ----
  (function prefillFromUrl() {
    const q = new URLSearchParams(location.search);
    if (q.get("amount")) { state.amountRaw = q.get("amount"); state.touched = true; }
    if (C.isSupported(q.get("from"))) state.source = q.get("from");
    if (C.isSupported(q.get("to"))) state.target = q.get("to");
    if (q.get("provider") && providers().some(function (p) { return p.id === q.get("provider"); })) state.providerId = q.get("provider");
  })();

  function providers() { return settings.providers; }
  function currentProvider() { return providers().find(function (p) { return p.id === state.providerId; }) || null; }

  // ------------------------------------------------------- render: currency ----
  function renderCurrencyGroup(host, name, selected) {
    host.innerHTML = C.SUPPORTED_CURRENCIES.map(function (code) {
      const m = C.CURRENCY_META[code];
      const id = name + "-" + code;
      return '<div class="ccy-option"><input type="radio" name="' + name + '" id="' + id + '" value="' + code + '"' + (code === selected ? " checked" : "") + ">" +
        '<label for="' + id + '" title="' + esc(m.name) + '"><span class="flag" aria-hidden="true">' + m.flag + "</span>" + code +
        '<span class="visually-hidden"> ' + esc(m.name) + "</span></label></div>";
    }).join("");
  }

  // ------------------------------------------------------- render: providers ----
  function renderProviders() {
    const grid = $("#provider-grid");
    const enabled = providers().filter(function (p) { return p.enabled; });
    if (!enabled.length) {
      grid.innerHTML = '<div class="alert alert-warning mb-0 small" role="alert"><i class="bi bi-exclamation-triangle" aria-hidden="true"></i> No enabled mock provider. Enable one in <a href="settings.html">FX &amp; Settings</a>.</div>';
      return;
    }
    grid.innerHTML = providers().map(function (p, i) {
      const isStripe = p.id === "stripe_mock";
      return '<div class="provider-card" data-provider="' + p.id + '">' +
        '<input type="radio" name="provider" id="pv-' + p.id + '" value="' + p.id + '"' + (state.providerId === p.id ? " checked" : "") + (p.enabled ? "" : " disabled") + ' aria-describedby="pv-desc-' + p.id + '">' +
        '<label for="pv-' + p.id + '" class="spotlight">' +
        '<div class="d-flex align-items-center gap-3">' +
        '<span class="provider-logo ' + (isStripe ? "is-stripe" : "is-razorpay") + '" aria-hidden="true">' + (isStripe ? "S" : "R") + "</span>" +
        '<div class="flex-grow-1 min-w-0"><div class="fw-bold">' + esc(p.name) + ' <span class="sim-badge">MOCK</span></div>' +
        '<div class="small text-muted">Key ' + (i + 1) + " · " + esc(p.settlementNote || "") + "</div></div>" +
        '<span class="provider-check" aria-hidden="true"><i class="bi bi-check-lg"></i></span></div>' +
        '<p class="small text-muted mt-2 mb-0" id="pv-desc-' + p.id + '">' + esc(p.description) + (p.enabled ? "" : " <b>(disabled in settings)</b>") + "</p>" +
        '<div class="provider-metrics">' +
        "<div><small>Mock fee</small><strong>" + p.feePercent + "%" + (p.feeFixed ? " + $" + p.feeFixed : "") + "</strong></div>" +
        '<div><small>Est. total</small><strong class="pv-total" data-total="' + p.id + '">—</strong></div>' +
        "</div></label></div>";
    }).join("");

    $$('#provider-grid input[name="provider"]').forEach(function (inp) {
      inp.addEventListener("change", function () {
        state.providerId = inp.value;
        touch();
        update();
        const label = inp.nextElementSibling;
        if (M) { M.pop(label); M.burst(label.querySelector(".provider-check")); }
      });
    });
  }

  // ------------------------------------------------------------ motion ----
  const M = window.MCPAMotion;

  /** Set text and give it a small "bump" when the value actually changes. */
  function setVal(sel, text) {
    const el = $(sel);
    if (el.textContent === text) return;
    el.textContent = text;
    if (M && text !== "—") M.bump(el);
  }

  /** Coin-flow visualiser between the two currencies; coin count grows with the amount. */
  let flowKey = "";
  function updateFlow(v, rate) {
    const src = C.CURRENCY_META[state.source];
    const tgt = C.CURRENCY_META[state.target];
    const srcEl = $("#flow-src");
    const tgtEl = $("#flow-tgt");
    const pairChanged = srcEl.dataset.code !== state.source || tgtEl.dataset.code !== state.target;
    srcEl.textContent = src.flag + " " + state.source;
    tgtEl.textContent = tgt.flag + " " + state.target;
    srcEl.dataset.code = state.source;
    tgtEl.dataset.code = state.target;
    $("#flow-rate").textContent = rate === null ? "no rate" : "× " + C.formatRate(rate);
    if (pairChanged) {
      [srcEl, tgtEl, $("#flow-rate")].forEach(function (el) { el.classList.remove("pulse"); void el.offsetWidth; el.classList.add("pulse"); });
    }
    const track = $("#fx-track");
    const n = v.ok && rate !== null ? Math.max(2, Math.min(7, 2 + Math.floor(Math.log10(v.value + 1)))) : 0;
    const key = n + "|" + state.source + state.target;
    track.classList.toggle("idle", n === 0);
    if (key === flowKey) return;
    flowKey = key;
    $$(".coin", track).forEach(function (c) { c.remove(); });
    const dur = 2.2 - Math.min(0.9, n * 0.12);
    for (let i = 0; i < n; i++) {
      const c = document.createElement("span");
      c.className = "coin";
      c.style.setProperty("--dur", dur.toFixed(2) + "s");
      c.style.setProperty("--d", ((dur / n) * i).toFixed(2) + "s");
      track.appendChild(c);
    }
  }

  // ------------------------------------------------------- rate source UI ----
  function renderRateSource(rate) {
    const isLive = active.mode === "live";
    const wantsLive = settings.rateSource === "live";
    const tag = $("#rate-tag");
    tag.classList.toggle("is-live", isLive);
    $("#rate-label").textContent = isLive ? "Live reference rate" : wantsLive ? "Demo exchange rate · live unavailable" : "Demo exchange rate";
    $("#rs-live").checked = wantsLive;
    $("#rs-demo").checked = !wantsLive;
    $("#rate-refresh").hidden = !wantsLive;
    $("#rate-edit").hidden = isLive;
    $("#rate-updated").textContent = isLive ? "As of " + UI.fmtDate(fxConfig.updatedAt) : "Rates labelled " + UI.fmtDate(fxConfig.updatedAt);
    $("#rate-disclaimer").textContent = isLive ? fxConfig.disclaimer : "Illustrative rate only. No live FX quote is provided.";
    paintChecked();
    // How far is live from the demo table for this pair?
    const delta = $("#rate-delta");
    const demoRate = C.getRate(demoTable, state.source, state.target);
    if (isLive && rate !== null && demoRate !== null && state.source !== state.target) {
      const pct = ((rate - demoRate) / demoRate) * 100;
      delta.innerHTML = '<span class="delta-chip ' + (pct >= 0 ? "up" : "down") + '"><i class="bi ' + (pct >= 0 ? "bi-arrow-up-right" : "bi-arrow-down-right") + '" aria-hidden="true"></i>' +
        (pct >= 0 ? "+" : "") + pct.toFixed(2) + "%</span> vs demo table (" + C.formatRate(demoRate) + ")";
    } else {
      delta.textContent = "";
    }
  }

  function paintChecked() {
    const el = $("#rate-checked");
    if (settings.rateSource !== "live") { el.textContent = ""; return; }
    if (live.status === "loading") { el.innerHTML = '<span class="spinner-border spinner-border-sm" aria-hidden="true"></span> Fetching live rates…'; return; }
    if (active.mode !== "live") {
      el.innerHTML = '<span class="text-warning"><i class="bi bi-wifi-off" aria-hidden="true"></i> Live sources unreachable — demo fallback</span>';
      return;
    }
    const src = fxConfig.sourceShort || "live source";
    const ago = live.lastChecked ? UI.relTime(live.lastChecked) : "—";
    el.innerHTML = '<a href="' + esc(fxConfig.sourceUrl || "#") + '" target="_blank" rel="noopener noreferrer" class="link-secondary">' + esc(src) + "</a> · checked " + esc(ago);
    el.title = fxConfig.cadence || "";
  }

  $$('input[name="ratesrc"]').forEach(function (r) {
    r.addEventListener("change", function () { UI.setRateSource(r.value); });
  });
  document.addEventListener("mcpa:ratesource", function () {
    settings = UI.getSettings().data;
    applyActive();
    update();
    refreshLive(true);
  });
  $("#rate-refresh").addEventListener("click", function () { refreshLive(true); });
  setInterval(function () { paintChecked(); if (!document.hidden) refreshLive(false); }, 30000);
  document.addEventListener("visibilitychange", function () { if (!document.hidden) refreshLive(false); });

  // ------------------------------------------------------------ update ----
  let lastConverted = null;

  function update(opts) {
    const o = opts || {};
    const v = C.validateAmount(state.amountRaw);
    const showErr = state.touched && !v.ok && state.amountRaw !== "";
    const showEmpty = state.touched && state.amountRaw === "" && o.fromSubmit;

    // Amount UI
    const meta = C.CURRENCY_META[state.source];
    $("#amount-prefix").innerHTML = '<span class="flag">' + meta.flag + "</span><span>" + state.source + "</span>";
    const errBox = $("#amount-error");
    const msg = showErr || showEmpty ? v.error : "";
    if (errBox.dataset.msg !== msg) {
      errBox.dataset.msg = msg;
      errBox.innerHTML = msg ? '<i class="bi bi-exclamation-circle-fill" aria-hidden="true"></i>' + esc(msg) : "";
    }
    $("#amount-wrap").classList.toggle("is-invalid", !!msg);
    $("#amount-input").setAttribute("aria-invalid", msg ? "true" : "false");

    // Rate panel
    const rate = C.getRate(table, state.source, state.target);
    renderRateSource(rate);
    $("#rate-direction").textContent = rate === null ? "No rate available for this pair" : "1 " + state.source + " = " + C.formatRate(rate) + " " + state.target;
    $("#rate-inverse").textContent = rate === null ? "" : "1 " + state.target + " = " + C.formatRate(1 / rate) + " " + state.source + (state.source === state.target ? " · same-currency rate is always 1" : "");
    $("#rate-source").textContent = fxConfig.source;
    $("#conv-src").textContent = state.source;
    $("#conv-tgt").textContent = state.target;

    // Per-provider comparison
    let best = null;
    providers().forEach(function (p) {
      const q = v.ok ? C.quote({ amount: state.amountRaw, source: state.source, target: state.target, provider: p, table: table }) : null;
      const el = document.querySelector('[data-total="' + p.id + '"]');
      if (el) el.textContent = q && q.ok ? C.formatMoney(q.totalDisplay, state.target) : "—";
      if (q && q.ok && p.enabled && (!best || q.totalDisplay < best.total)) best = { id: p.id, total: q.totalDisplay };
    });
    $$(".badge-best").forEach(function (b) { b.remove(); });
    if (best && providers().filter(function (p) { return p.enabled; }).length > 1) {
      const card = document.querySelector('.provider-card[data-provider="' + best.id + '"]');
      if (card) card.insertAdjacentHTML("afterbegin", '<span class="badge-best"><i class="bi bi-lightning-charge-fill" aria-hidden="true"></i> Lowest mock fee</span>');
    }

    // Summary
    const prov = currentProvider();
    const q = C.quote({ amount: state.amountRaw, source: state.source, target: state.target, provider: prov, table: table });
    const sumEl = $("#sum-converted");
    if (q.ok) {
      UI.countTo(sumEl, q.convertedDisplay, state.target, { from: lastConverted === null ? 0 : undefined });
      lastConverted = q.convertedDisplay;
      $("#sum-source").textContent = "for " + C.formatMoney(q.sourceAmount, state.source) + " · " + state.source + " → " + state.target;
      setVal("#bd-source", C.formatMoney(q.sourceAmount, state.source));
      setVal("#bd-rate", "1 " + state.source + " = " + C.formatRate(q.exchangeRate) + " " + state.target);
      $("#bd-rate-label").textContent = active.mode === "live" ? "Live rate" : "Demo rate";
      setVal("#bd-converted", C.formatMoney(q.convertedDisplay, state.target));
      $("#bd-fee-label").textContent = prov ? "Mock fee · " + prov.shortName + " (" + prov.feePercent + "%)" : "Mock provider fee";
      setVal("#bd-fee", prov ? C.formatMoney(q.feeDisplay, state.target) : "Select provider");
      setVal("#bd-total", prov ? C.formatMoney(q.totalDisplay, state.target) : "—");
      const ex = C.explain(q);
      $("#formula").innerHTML = "conversion: " + esc(ex.conversion) + (prov ? "<br>fee: " + esc(ex.fee) + "<br>total: " + esc(ex.total) : "<br>fee: select a provider to estimate");
    } else {
      UI.resetCount(sumEl);
      sumEl.textContent = "—";
      lastConverted = null;
      $("#sum-source").textContent = state.amountRaw ? "Fix the amount to see the conversion" : "Enter an amount";
      ["#bd-source", "#bd-converted", "#bd-fee", "#bd-total"].forEach(function (s) { $(s).textContent = "—"; });
      setVal("#bd-rate", rate === null ? "—" : "1 " + state.source + " = " + C.formatRate(rate) + " " + state.target);
      $("#formula").textContent = "Fee = converted × fee % (in target currency). Total = converted + fee. Currencies are never mixed.";
    }

    updateFlow(v, rate);

    // Readiness checklist + CTA
    const ready = { amount: v.ok, ccy: rate !== null, provider: !!(prov && prov.enabled) };
    $("#ck-amount").classList.toggle("done", ready.amount);
    $("#ck-ccy").classList.toggle("done", ready.ccy);
    $("#ck-provider").classList.toggle("done", ready.provider);
    const canReview = ready.amount && ready.ccy && ready.provider;
    $("#review-btn").disabled = !canReview;
    $("#form-status").textContent = canReview ? "Ready — press R or Ctrl/⌘ + Enter to review." :
      !ready.amount ? "Enter a valid amount to continue." : !ready.provider ? "Choose a mock provider to continue." : "Pick a supported currency pair.";

    syncUrl();
    return { quote: q, canReview: canReview };
  }

  function syncUrl() {
    const q = new URLSearchParams();
    if (state.amountRaw) q.set("amount", state.amountRaw);
    q.set("from", state.source);
    q.set("to", state.target);
    if (state.providerId) q.set("provider", state.providerId);
    const url = location.pathname + "?" + q.toString() + location.hash;
    try { history.replaceState(null, "", url); } catch (e) {}
  }

  function touch() {
    if (!state.startedAt) state.startedAt = performance.now();
  }

  // ------------------------------------------------------------ events ----
  const amountInput = $("#amount-input");
  amountInput.value = state.amountRaw;

  amountInput.addEventListener("input", function () {
    state.amountRaw = amountInput.value;
    state.touched = true;
    touch();
    update();
  });
  amountInput.addEventListener("blur", function () {
    // Gentle normalisation of valid input (keeps invalid input untouched per PRD §11).
    const v = C.validateAmount(amountInput.value);
    if (v.ok && /,/.test(amountInput.value)) { amountInput.value = String(v.value); state.amountRaw = amountInput.value; update(); }
  });

  $$(".quick-amounts button").forEach(function (b) {
    b.addEventListener("click", function () {
      amountInput.value = b.dataset.amt;
      state.amountRaw = b.dataset.amt;
      state.touched = true;
      touch();
      update();
      amountInput.focus();
      if (M) { M.pop(b); M.pop($("#amount-wrap")); }
    });
  });

  function bindCurrencyGroups() {
    renderCurrencyGroup($("#source-group"), "source", state.source);
    renderCurrencyGroup($("#target-group"), "target", state.target);
    $$('#source-group input, #target-group input').forEach(function (inp) {
      inp.addEventListener("change", function () {
        state[inp.name] = inp.value;
        touch();
        update();
        if (M) M.pop(inp.nextElementSibling);
        $("#rate-panel").classList.remove("flash"); void $("#rate-panel").offsetWidth; $("#rate-panel").classList.add("flash");
      });
    });
  }

  function swap() {
    const s = state.source;
    state.source = state.target;
    state.target = s;
    bindCurrencyGroups();
    const btn = $("#swap-btn");
    btn.classList.toggle("spin");
    touch();
    update();
    if (M) {
      // The two pickers visibly trade places.
      const stacked = window.matchMedia("(max-width: 575.98px)").matches;
      M.slideIn($("#source-group"), stacked ? "down" : "right", 60);
      M.slideIn($("#target-group"), stacked ? "up" : "left", 60);
      M.pop($("#amount-prefix"));
    }
    $("#rate-panel").classList.remove("flash"); void $("#rate-panel").offsetWidth; $("#rate-panel").classList.add("flash");
    UI.toast("Swapped: " + state.source + " → " + state.target, "info", { delay: 1600 });
  }
  $("#swap-btn").addEventListener("click", swap);

  function syncOutcomeControl() {
    const map = { success: "#oc-success", failure: "#oc-failure", rule_based: "#oc-rules" };
    const el = $(map[settings.outcomeMode] || "#oc-rules");
    if (el) el.checked = true;
  }
  $$('#outcome-group input').forEach(function (inp) {
    inp.addEventListener("change", function () {
      const s = UI.getSettings().data;
      s.outcomeMode = inp.value;
      UI.saveSettings(s);
      settings = s;
    });
  });
  document.addEventListener("mcpa:settings", function () { settings = UI.getSettings().data; syncOutcomeControl(); });

  $("#reset-btn").addEventListener("click", function () {
    state.amountRaw = ""; state.touched = false; state.providerId = null; state.source = "USD"; state.target = "INR"; state.startedAt = null;
    amountInput.value = "";
    bindCurrencyGroups();
    renderProviders();
    update();
    amountInput.focus();
  });

  $("#checkout-form").addEventListener("submit", function (e) { e.preventDefault(); openReview(); });

  // --------------------------------------------------------- review modal ----
  const reviewModalEl = $("#review-modal");
  const reviewModal = bootstrap.Modal.getOrCreateInstance(reviewModalEl);
  let reviewQuote = null;

  $("#review-btn").addEventListener("click", openReview);

  function openReview() {
    state.touched = true;
    const r = update({ fromSubmit: true });
    if (!r.canReview) {
      $("#amount-wrap").classList.remove("shake"); void $("#amount-wrap").offsetWidth;
      if (!C.validateAmount(state.amountRaw).ok) { $("#amount-wrap").classList.add("shake"); amountInput.focus(); }
      else if (!currentProvider()) { const first = $('#provider-grid input:not(:disabled)'); if (first) first.focus(); }
      return;
    }
    reviewQuote = r.quote;
    const p = currentProvider();
    const q = reviewQuote;
    const ex = C.explain(q);
    $("#review-body").innerHTML =
      '<div class="d-flex align-items-center justify-content-between mb-3"><span class="provider-chip ' + (p.id === "stripe_mock" ? "is-stripe" : "is-razorpay") + '"><span class="dot"></span>' + esc(p.name) + '</span><span class="sim-badge">SIMULATED</span></div>' +
      '<div class="text-center py-2"><div class="small text-muted">Estimated total in ' + q.targetCurrency + '</div>' +
      '<div class="display-6 fw-bold money" style="letter-spacing:-.03em">' + C.formatMoney(q.totalDisplay, q.targetCurrency) + "</div>" +
      '<div class="small text-muted">from ' + C.formatMoney(q.sourceAmount, q.sourceCurrency) + "</div></div>" +
      '<ul class="breakdown mt-3">' +
      "<li><span>Amount</span><strong>" + C.formatMoney(q.sourceAmount, q.sourceCurrency) + "</strong></li>" +
      "<li><span>" + esc(fxConfig.label) + "</span><strong>" + esc(ex.direction) + "</strong></li>" +
      "<li><span>Converted amount</span><strong>" + C.formatMoney(q.convertedDisplay, q.targetCurrency) + "</strong></li>" +
      "<li><span>Mock fee (" + q.feePercent + "% of converted)</span><strong>" + C.formatMoney(q.feeDisplay, q.targetCurrency) + "</strong></li>" +
      '<li class="total"><span>Estimated total</span><strong>' + C.formatMoney(q.totalDisplay, q.targetCurrency) + "</strong></li></ul>" +
      '<div class="formula mt-3">' + esc(ex.conversion) + "<br>" + esc(ex.fee) + "</div>" +
      '<div class="alert alert-light border small mt-3 mb-0 d-flex gap-2" role="note"><i class="bi bi-info-circle text-primary" aria-hidden="true"></i><div>Mock provider — no real payment will be processed. ' + esc(active.mode === "live" ? fxConfig.disclaimer : "Illustrative rate only. No live FX quote is provided.") + ' Demo outcome: <b>' + esc(Sim.OUTCOME_MODES[settings.outcomeMode].label) + "</b>.</div></div>";
    $("#review-footer").hidden = false;
    $("#review-close").disabled = false;
    $("#simulate-btn").disabled = false;
    reviewModal.show();
  }

  reviewModalEl.addEventListener("shown.bs.modal", function () { $("#simulate-btn").focus(); });
  reviewModalEl.addEventListener("hide.bs.modal", function (e) { if (state.busy) e.preventDefault(); });

  $("#simulate-btn").addEventListener("click", simulate);

  async function simulate() {
    if (state.busy || !reviewQuote) return;
    state.busy = true;
    $("#simulate-btn").disabled = true;
    $("#review-close").disabled = true;
    $("#review-footer").hidden = true;

    const p = currentProvider();
    const q = reviewQuote;
    const steps = Sim.STATES.concat(["RESULT"]);
    $("#review-body").innerHTML =
      '<div class="text-center mb-3"><div class="fw-semibold">Running mock payment pipeline…</div><div class="small text-muted">' + esc(p.name) + " · nothing leaves this browser</div></div>" +
      '<ol class="pipeline" id="pipeline">' + steps.map(function (s, i) {
        const label = s === "RESULT" ? "Simulated outcome" : Sim.STATE_LABELS[s];
        return '<li data-step="' + s + '"><span class="node">' + (i + 1) + '</span><div><div class="step-title">' + label + '</div><div class="step-meta">' + s.toLowerCase() + "</div></div></li>";
      }).join("") + "</ol>";

    const latency = settings.latency === "instant" ? 0 : 520;
    let result;
    try {
      result = await Sim.run({
        mode: settings.outcomeMode,
        forcedFailure: settings.forcedFailure,
        sourceAmount: q.sourceAmount,
        sourceCurrency: q.sourceCurrency,
        table: table,
        provider: p,
      }, {
        latencyMs: latency,
        onStep: function (s, i) {
          $$("#pipeline li").forEach(function (li, j) {
            li.classList.toggle("done", j < i);
            li.classList.toggle("active", j === i);
            if (j < i) li.querySelector(".node").innerHTML = '<i class="bi bi-check-lg" aria-hidden="true"></i>';
          });
          document.getElementById("sr-announcer").textContent = Sim.STATE_LABELS[s];
        },
      });
    } catch (e) {
      state.busy = false;
      UI.toast("The simulation could not run. Please try again.", "danger");
      reviewModal.hide();
      return;
    }

    // Build + SAVE the record before showing the final message (PRD §10.6).
    const existing = new Set(Store.loadTransactions().data.map(function (t) { return t.id; }));
    const txn = Sim.buildTransaction({
      id: Sim.generateReference(p.tag, existing),
      quote: q,
      provider: p,
      outcome: result.outcome,
      mode: settings.outcomeMode,
      fxConfig: fxConfig,
      timeline: result.timeline,
    });
    if (state.startedAt) txn.durationMs = Math.round(performance.now() - state.startedAt);
    const saved = Store.addTransaction(txn);

    const ok = txn.status === "SUCCESS";
    const last = $$("#pipeline li").pop();
    $$("#pipeline li").forEach(function (li) { li.classList.remove("active"); li.classList.add("done"); li.querySelector(".node").innerHTML = '<i class="bi bi-check-lg" aria-hidden="true"></i>'; });
    last.classList.add(ok ? "ok" : "fail");
    last.querySelector(".node").innerHTML = '<i class="bi ' + (ok ? "bi-check-lg" : "bi-x-lg") + '" aria-hidden="true"></i>';
    last.querySelector(".step-title").textContent = ok ? "Simulated success" : "Simulated failure";

    await new Promise(function (r) { setTimeout(r, latency ? 450 : 0); });
    state.busy = false;
    reviewModal.hide();

    showResult(txn, { saveError: saved.ok ? null : saved.error, fresh: true });
    state.startedAt = null;
    refreshHistoryCount();
  }

  // --------------------------------------------------------------- result ----
  function resultIcon(ok) {
    const color = ok ? "var(--pb-success)" : "var(--pb-error)";
    return '<svg class="result-icon" viewBox="0 0 100 100" aria-hidden="true"><circle cx="50" cy="50" r="44" fill="none" stroke="' + color + '" stroke-width="6" stroke-linecap="round" transform="rotate(-90 50 50)"/>' +
      (ok ? '<path d="M31 52l13 13 26-28" fill="none" stroke="' + color + '" stroke-width="7" stroke-linecap="round" stroke-linejoin="round"/>'
          : '<path d="M35 35l30 30M65 35L35 65" fill="none" stroke="' + color + '" stroke-width="7" stroke-linecap="round"/>') + "</svg>";
  }

  function showResult(t, opts) {
    const o = opts || {};
    const ok = t.status === "SUCCESS";
    $("#view-checkout").hidden = true;
    $("#view-result").hidden = false;
    if (location.hash !== "#result=" + t.id) history.pushState(null, "", location.pathname + location.search + "#result=" + t.id);

    const timeline = (t.timeline || []).map(function (s, i, arr) {
      const last = i === arr.length - 1;
      const cls = last ? (s.state === "SUCCESS" ? "done ok" : "done fail") : "done";
      return '<li class="' + cls + '"><span class="node"><i class="bi ' + (last && s.state === "FAILED" ? "bi-x-lg" : "bi-check-lg") + '" aria-hidden="true"></i></span><div><div class="step-title">' + esc(s.label) + '</div><div class="step-meta">' + esc(s.state) + " · " + esc(new Date(s.at).toISOString().slice(11, 23)) + "Z</div></div></li>";
    }).join("");

    $("#result-card").innerHTML =
      '<div class="print-watermark">SIMULATION — NOT A REAL PAYMENT</div>' +
      '<div class="result-hero ' + (ok ? "is-success" : "is-failed") + '">' + resultIcon(ok) +
      '<span class="sim-badge mb-2 d-inline-block">MODE: ' + esc(t.mode) + " · NO REAL MONEY MOVED</span>" +
      '<h1 class="result-title mb-1" id="result-title" tabindex="-1">' + (ok ? "Simulated payment successful" : "Simulated payment failed") + "</h1>" +
      '<p class="text-muted mb-3">' + (ok ? "The mock provider approved this demo attempt. No money moved." : esc(t.failureReason || "The mock provider declined this demo attempt.")) + "</p>" +
      '<div class="ref-pill"><i class="bi bi-hash text-muted" aria-hidden="true"></i><span id="ref-text">' + esc(t.id) + '</span>' +
      '<button type="button" class="btn btn-sm btn-light rounded-pill no-print" id="copy-ref" aria-label="Copy transaction reference"><i class="bi bi-copy" aria-hidden="true"></i></button></div>' +
      (t.durationMs ? '<div class="small text-muted mt-2"><i class="bi bi-stopwatch" aria-hidden="true"></i> Checkout completed in <b>' + (t.durationMs / 1000).toFixed(1) + " s</b>" + (t.durationMs <= 30000 ? " — within the 30-second product promise" : "") + "</div>" : "") +
      "</div>" +
      '<div class="card-pad">' +
      (o.saveError ? '<div class="alert alert-warning small d-flex gap-2" role="alert"><i class="bi bi-exclamation-triangle-fill" aria-hidden="true"></i>' + esc(o.saveError) + "</div>" : "") +
      '<div class="row g-4">' +
      '<div class="col-lg-7"><h2 class="h6 text-muted text-uppercase small fw-bold mb-3">Transaction details</h2><div class="detail-grid">' +
      cell("Status", UI.statusBadge(t.status), true) +
      cell("Mock provider", UI.providerChip(t.providerId, t.providerName), true) +
      cell("Amount", C.formatMoney(t.sourceAmount, t.sourceCurrency)) +
      cell(/^Live/.test(t.rateLabel || "") ? "Live reference rate" : "Demo rate", "1 " + t.sourceCurrency + " = " + C.formatRate(t.exchangeRate) + " " + t.targetCurrency) +
      cell("Converted", C.formatMoney(t.convertedAmount, t.targetCurrency)) +
      cell("Mock fee (" + t.feePercent + "%)", C.formatMoney(t.feeAmount, t.feeCurrency)) +
      cell("Estimated total", C.formatMoney(t.totalAmount, t.targetCurrency)) +
      cell("Created", UI.fmtDate(t.createdAt, true)) +
      cell("Outcome rule", esc(t.outcomeRule)) +
      (t.failureCode ? cell("Failure code", '<span class="mono">' + esc(t.failureCode) + "</span>", true) : "") +
      "</div></div>" +
      '<div class="col-lg-5"><h2 class="h6 text-muted text-uppercase small fw-bold mb-3">State transitions</h2><ol class="pipeline">' + timeline + "</ol>" +
      '<p class="small text-muted mb-0">Rate snapshot: ' + esc(t.rateLabel) + " · " + esc(typeof t.rateVersion === "number" ? "v" + t.rateVersion : t.rateVersion) + " · as of " + esc(UI.fmtDate(t.rateUpdatedAt)) + (t.rateSource ? '<br><span class="opacity-75">' + esc(t.rateSource) + "</span>" : "") + "</p></div>" +
      "</div>" +
      '<div class="d-flex flex-wrap gap-2 mt-4 no-print">' +
      (ok ? "" : '<button type="button" class="btn-glow" id="retry-btn"><i class="bi bi-arrow-repeat" aria-hidden="true"></i> Retry</button>') +
      '<button type="button" class="' + (ok ? "btn-glow" : "btn-soft") + '" id="new-btn"><i class="bi bi-plus-circle" aria-hidden="true"></i> Return to checkout</button>' +
      '<a class="btn-soft text-decoration-none d-inline-flex align-items-center gap-2" href="history.html#txn=' + encodeURIComponent(t.id) + '"><i class="bi bi-clock-history" aria-hidden="true"></i> View history</a>' +
      '<button type="button" class="btn-soft" id="copy-sum"><i class="bi bi-clipboard" aria-hidden="true"></i> Copy summary</button>' +
      '<button type="button" class="btn-soft" id="print-btn"><i class="bi bi-printer" aria-hidden="true"></i> Print receipt</button>' +
      "</div></div>";

    $("#copy-ref").addEventListener("click", function () { UI.copyText(t.id, "Reference"); });
    $("#copy-sum").addEventListener("click", function () { UI.copyText(UI.txnSummaryText(t), "Summary"); });
    $("#print-btn").addEventListener("click", function () { window.print(); });
    $("#new-btn").addEventListener("click", function () { backToCheckout(ok); });
    if (!ok) $("#retry-btn").addEventListener("click", function () {
      state.amountRaw = String(t.sourceAmount); state.source = t.sourceCurrency; state.target = t.targetCurrency; state.providerId = t.providerId;
      amountInput.value = state.amountRaw;
      backToCheckout(false);
      setTimeout(openReview, 250);
    });

    const h = $("#result-title");
    h.focus({ preventScroll: true });
    window.scrollTo({ top: 0, behavior: UI.reduceMotion ? "auto" : "smooth" });
    document.getElementById("sr-announcer").textContent = (ok ? "Simulated payment successful. " : "Simulated payment failed. ") + "Reference " + t.id;
    if (ok && o.fresh) setTimeout(function () { UI.confetti(document.querySelector(".result-icon")); }, 500);
    if (o.fresh) UI.toast(ok ? "Simulated success recorded in history." : "Simulated failure recorded in history.", ok ? "success" : "warning");
  }

  function cell(label, value, html) {
    return '<div class="cell"><small>' + esc(label) + "</small><strong>" + (html ? value : esc(value)) + "</strong></div>";
  }

  function backToCheckout(clearAmount) {
    if (clearAmount) { state.amountRaw = ""; amountInput.value = ""; state.touched = false; }
    $("#view-result").hidden = true;
    $("#view-checkout").hidden = false;
    history.pushState(null, "", location.pathname + location.search);
    bindCurrencyGroups();
    renderProviders();
    update();
    amountInput.focus();
  }

  $("#back-to-checkout").addEventListener("click", function (e) { e.preventDefault(); backToCheckout(false); });

  function route() {
    const m = /^#result=(.+)$/.exec(location.hash);
    if (m) {
      const id = decodeURIComponent(m[1]);
      const t = Store.loadTransactions().data.find(function (x) { return x.id === id; });
      if (t) { showResult(t, {}); return; }
      UI.toast("Transaction " + id + " was not found in this browser.", "warning");
    }
    $("#view-result").hidden = true;
    $("#view-checkout").hidden = false;
  }
  window.addEventListener("popstate", route);

  function refreshHistoryCount() {
    const r = Store.loadTransactions();
    const n = r.data.length;
    $("#history-count").textContent = n + " simulated attempt" + (n === 1 ? "" : "s");
    if (r.error && r.corrupt) {
      UI.showBanner("#page-alerts", r.error, [{ label: "Reset history", onClick: function () { Store.saveTransactions([]); refreshHistoryCount(); } }]);
    }
  }
  Store.subscribe(function (key) { if (key === Store.KEYS.TRANSACTIONS) refreshHistoryCount(); if (key === Store.KEYS.SETTINGS) { settings = UI.getSettings().data; syncOutcomeControl(); applyActive(); update(); } });

  // --------------------------------------------------- shortcuts & commands ----
  function selectProviderByIndex(i) {
    const p = providers()[i];
    if (!p || !p.enabled) return;
    state.providerId = p.id;
    const inp = $("#pv-" + p.id);
    if (inp) inp.checked = true;
    touch();
    update();
  }
  function onCheckout() { return !$("#view-checkout").hidden; }

  UI.registerShortcuts([
    { keys: "/", label: "Focus the amount field", match: function (e) { return e.key === "/" && onCheckout(); }, run: function () { amountInput.focus(); amountInput.select(); } },
    { keys: "s", label: "Swap currencies", match: function (e) { return e.key === "s" && onCheckout(); }, run: swap },
    { keys: "1 / 2", label: "Select mock provider", match: function (e) { return (e.key === "1" || e.key === "2") && onCheckout(); }, run: function (e) { selectProviderByIndex(Number(e.key) - 1); } },
    { keys: "r", label: "Review payment", match: function (e) { return e.key === "r" && onCheckout(); }, run: openReview },
  ]);
  document.addEventListener("keydown", function (e) {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && onCheckout() && !UI.anyModalOpen()) { e.preventDefault(); openReview(); }
  });

  function fill(amount, from, to, provider) {
    backToCheckout(false);
    state.amountRaw = amount; amountInput.value = amount; state.touched = true;
    state.source = from; state.target = to; state.providerId = provider;
    touch();
    bindCurrencyGroups(); renderProviders(); update();
  }

  UI.registerCommands([
    { id: "swap", title: "Swap source and target currencies", group: "Checkout", icon: "bi-arrow-left-right", keys: "s", run: swap },
    { id: "review", title: "Review payment", group: "Checkout", icon: "bi-receipt", keys: "r", run: openReview },
    { id: "pv1", title: "Select Stripe-like Mock provider", group: "Checkout", icon: "bi-1-circle", keys: "1", run: function () { selectProviderByIndex(0); } },
    { id: "pv2", title: "Select Razorpay-like Mock provider", group: "Checkout", icon: "bi-2-circle", keys: "2", run: function () { selectProviderByIndex(1); } },
    { id: "demo-ok", title: "Demo: 100 USD → INR via Razorpay-like", group: "Demo scenarios", icon: "bi-magic", run: function () { fill("100", "USD", "INR", "razorpay_mock"); } },
    { id: "demo-eur", title: "Demo: 2,500 EUR → USD via Stripe-like", group: "Demo scenarios", icon: "bi-magic", run: function () { fill("2500", "EUR", "USD", "stripe_mock"); } },
    { id: "demo-fail", title: "Demo: 100.13 USD → EUR (rule R1 failure)", group: "Demo scenarios", icon: "bi-bug", run: function () { fill("100.13", "USD", "EUR", "stripe_mock"); } },
    { id: "demo-risk", title: "Demo: 30,000 USD → INR (rule R2 risk decline)", group: "Demo scenarios", icon: "bi-shield-x", run: function () { fill("30000", "USD", "INR", "razorpay_mock"); } },
    { id: "reset", title: "Reset checkout form", group: "Checkout", icon: "bi-arrow-counterclockwise", run: function () { $("#reset-btn").click(); } },
  ]);

  // ------------------------------------------------------------------ init ----
  bindCurrencyGroups();
  renderProviders();
  syncOutcomeControl();
  update();
  refreshHistoryCount();
  route();
  refreshLive(false);
})();
