/**
 * settings.js — FX Rate Reference + Demo Settings screens (combined, PRD §8).
 * Interactive rate matrix (heat-mapped, formula on hover/focus, arrow-key nav),
 * base-rate editor with live preview, provider fee editor, simulation settings,
 * storage diagnostics and guarded resets.
 */
(function () {
  "use strict";

  const C = window.MCPACurrency;
  const Sim = window.MCPASimulator;
  const Store = window.MCPAStorage;
  const UI = window.MCPAUI;
  const { $, $$, esc } = UI;

  UI.boot("settings");

  let fxConfig = UI.getFxConfig().config;
  let settings = UI.getSettings().data;
  const CODES = C.SUPPORTED_CURRENCIES;

  // ------------------------------------------------------------- matrix ----
  function renderMatrix(cfg, opts) {
    const tbl = C.buildRateTable(cfg);
    const logs = [];
    CODES.forEach(function (s) { CODES.forEach(function (t) { if (s !== t) logs.push(Math.log10(tbl[s][t])); }); });
    const min = Math.min.apply(null, logs);
    const max = Math.max.apply(null, logs);
    let html = '<thead><tr><th scope="col"><span class="visually-hidden">Source \\ Target</span><i class="bi bi-arrow-down-right" aria-hidden="true"></i></th>' +
      CODES.map(function (c) { return '<th scope="col">' + C.CURRENCY_META[c].flag + " " + c + "</th>"; }).join("") + "</tr></thead><tbody>";
    CODES.forEach(function (s, i) {
      html += '<tr><th scope="row" class="row-h">' + C.CURRENCY_META[s].flag + " " + s + "</th>";
      CODES.forEach(function (t, j) {
        const r = tbl[s][t];
        const heat = s === t ? 0 : Math.round(((Math.log10(r) - min) / (max - min || 1)) * 85 + 8);
        html += '<td tabindex="' + (i === 0 && j === 1 ? 0 : -1) + '" data-s="' + s + '" data-t="' + t + '" data-i="' + i + '" data-j="' + j + '" class="' + (s === t ? "diag" : heat > 55 ? "hot" : "") + '" style="--heat:' + heat + ';--i:' + (i * 3 + j) + '" aria-label="1 ' + s + " equals " + C.formatRate(r) + " " + t + '">' + C.formatRate(r) + "</td>";
      });
      html += "</tr>";
    });
    $("#fx-matrix").innerHTML = '<caption class="visually-hidden">Demo exchange-rate matrix</caption>' + html + "</tbody>";

    $$("#fx-matrix td").forEach(function (td) {
      const show = function () {
        $$("#fx-matrix td.is-focus").forEach(function (x) { x.classList.remove("is-focus"); });
        td.classList.add("is-focus");
        const s = td.dataset.s, t = td.dataset.t;
        const b = cfg.rates;
        $("#matrix-explain").innerHTML = s === t
          ? "fxRates[" + s + "][" + t + "] = <b>1</b> — same-currency conversion is always exactly 1."
          : "fxRates[" + s + "][" + t + "] = base[" + t + "] / base[" + s + "] = " + b[t] + " / " + b[s] + " = <b>" + C.formatRate(tbl[s][t]) + "</b><br>" +
            "e.g. " + C.formatMoney(100, s) + " × " + C.formatRate(tbl[s][t]) + " = " + C.formatMoney(100 * tbl[s][t], t) +
            ' · <a href="index.html?amount=100&from=' + s + "&to=" + t + '">try in checkout →</a>';
      };
      td.addEventListener("mouseenter", show);
      td.addEventListener("focus", show);
      td.addEventListener("keydown", function (e) {
        const dirs = { ArrowRight: [0, 1], ArrowLeft: [0, -1], ArrowDown: [1, 0], ArrowUp: [-1, 0] };
        if (!dirs[e.key]) return;
        e.preventDefault();
        const ni = (Number(td.dataset.i) + dirs[e.key][0] + 3) % 3;
        const nj = (Number(td.dataset.j) + dirs[e.key][1] + 3) % 3;
        const next = $('#fx-matrix td[data-i="' + ni + '"][data-j="' + nj + '"]');
        td.tabIndex = -1; next.tabIndex = 0; next.focus();
      });
    });

    if (!opts || !opts.preview) {
      $("#fx-label").textContent = cfg.label;
      $("#fx-source").textContent = cfg.source;
      $("#fx-updated").textContent = UI.fmtDate(cfg.updatedAt, true);
      $("#fx-version").textContent = "v" + cfg.version;
    }
  }

  // ------------------------------------------------------- rates editor ----
  function fillRates() {
    $("#r-INR").value = fxConfig.rates.INR;
    $("#r-EUR").value = fxConfig.rates.EUR;
    $("#r-label").value = fxConfig.label;
  }

  function readRates() {
    const out = { ok: true, rates: { USD: 1 } };
    ["INR", "EUR"].forEach(function (c) {
      const raw = $("#r-" + c).value.trim();
      const n = Number(raw);
      let err = "";
      if (!raw) err = "Enter a rate.";
      else if (!/^\d+(\.\d+)?$/.test(raw) || !isFinite(n)) err = "Enter a positive number, e.g. 83.0.";
      else if (n <= 0) err = "Rate must be greater than zero.";
      else if (n > 1e6) err = "Rate looks unrealistic for a demo table.";
      $("#r-" + c + "-err").innerHTML = err ? '<i class="bi bi-exclamation-circle-fill" aria-hidden="true"></i>' + esc(err) : "";
      $("#r-" + c).setAttribute("aria-invalid", err ? "true" : "false");
      if (err) out.ok = false; else out.rates[c] = n;
    });
    return out;
  }

  ["#r-INR", "#r-EUR"].forEach(function (sel) {
    $(sel).addEventListener("input", function () {
      const r = readRates();
      if (!r.ok) { $("#rates-preview").textContent = "Fix the highlighted rate to preview."; return; }
      const preview = Object.assign({}, fxConfig, { rates: r.rates });
      renderMatrix(preview, { preview: true });
      $("#rates-preview").innerHTML = '<i class="bi bi-eye" aria-hidden="true"></i> Previewing unsaved rates — the matrix above updates live.';
    });
  });

  $("#rates-form").addEventListener("submit", function (e) {
    e.preventDefault();
    const r = readRates();
    if (!r.ok) { UI.toast("Fix the highlighted rates before saving.", "warning"); return; }
    const next = Object.assign({}, fxConfig, {
      rates: r.rates,
      label: $("#r-label").value.trim() || "Demo exchange rate",
      source: "Custom demonstration table (edited in Settings)",
      updatedAt: new Date().toISOString(),
      version: (Number(fxConfig.version) || 1) + 1,
    });
    const v = C.validateFxConfig(next);
    if (!v.ok) { UI.toast(v.errors[0], "danger"); return; }
    const res = Store.write(Store.KEYS.FX_RATES, next);
    if (!res.ok) { UI.toast(res.error, "danger"); return; }
    fxConfig = next;
    renderMatrix(fxConfig);
    $("#rates-preview").textContent = "";
    UI.toast("Demo rates saved as v" + next.version + ". Existing transactions keep their original snapshot.", "success");
  });

  $("#rates-reset").addEventListener("click", function () {
    fxConfig = JSON.parse(JSON.stringify(C.DEFAULT_FX_CONFIG));
    Store.remove(Store.KEYS.FX_RATES);
    fillRates();
    renderMatrix(fxConfig);
    UI.toast("Demo rates reset to PRD sample values.", "success");
  });

  // ---------------------------------------------------------- providers ----
  function renderProviders() {
    $("#prov-rows").innerHTML = settings.providers.map(function (p) {
      const isStripe = p.id === "stripe_mock";
      return '<fieldset class="border rounded-4 p-3 spotlight" style="border-color:var(--pb-border)!important">' +
        '<legend class="float-none w-auto fs-6 fw-bold mb-2 d-flex align-items-center gap-2"><span class="provider-logo ' + (isStripe ? "is-stripe" : "is-razorpay") + '" style="width:28px;height:28px;font-size:.8rem;border-radius:8px" aria-hidden="true">' + (isStripe ? "S" : "R") + "</span>" + esc(p.name) + "</legend>" +
        '<div class="row g-3 align-items-end">' +
        '<div class="col-6 col-md-4"><label class="form-label small" for="fp-' + p.id + '">Fee %</label><input class="form-control mono" id="fp-' + p.id + '" inputmode="decimal" value="' + p.feePercent + '"></div>' +
        '<div class="col-6 col-md-4"><label class="form-label small" for="ff-' + p.id + '">Fixed fee (USD)</label><input class="form-control mono" id="ff-' + p.id + '" inputmode="decimal" value="' + p.feeFixed + '"></div>' +
        '<div class="col-md-4"><div class="form-check form-switch mb-2"><input class="form-check-input" type="checkbox" role="switch" id="fe-' + p.id + '"' + (p.enabled ? " checked" : "") + '><label class="form-check-label small fw-semibold" for="fe-' + p.id + '">Enabled</label></div></div>' +
        '</div><div class="small text-muted mt-2" id="fx-ex-' + p.id + '"></div></fieldset>';
    }).join("");
    settings.providers.forEach(function (p) {
      ["fp-", "ff-"].forEach(function (pre) { $("#" + pre + p.id).addEventListener("input", function () { example(p.id); }); });
      example(p.id);
    });
  }

  function example(id) {
    const pct = Number($("#fp-" + id).value);
    const fixed = Number($("#ff-" + id).value);
    const el = $("#fx-ex-" + id);
    if (!isFinite(pct) || !isFinite(fixed) || pct < 0 || fixed < 0) { el.innerHTML = '<span class="text-danger">Enter non-negative numbers.</span>'; return; }
    const q = C.quote({ amount: "100", source: "USD", target: "INR", provider: { id: id, feePercent: pct, feeFixed: fixed }, table: C.buildRateTable(fxConfig) });
    el.textContent = "Example: $100.00 → INR · fee " + C.formatMoney(q.feeDisplay, "INR") + " · total " + C.formatMoney(q.totalDisplay, "INR");
  }

  $("#prov-form").addEventListener("submit", function (e) {
    e.preventDefault();
    let bad = false;
    const next = settings.providers.map(function (p) {
      const pct = Number($("#fp-" + p.id).value);
      const fixed = Number($("#ff-" + p.id).value);
      if (!isFinite(pct) || pct < 0 || pct > 20 || !isFinite(fixed) || fixed < 0 || fixed > 100) bad = true;
      return Object.assign({}, p, { feePercent: pct, feeFixed: fixed, enabled: $("#fe-" + p.id).checked });
    });
    if (bad) { UI.toast("Fee % must be 0–20 and fixed fee 0–100 USD.", "warning"); return; }
    if (!next.some(function (p) { return p.enabled; })) UI.toast("Warning: no provider is enabled — checkout will show an empty state.", "warning");
    settings.providers = next;
    const res = UI.saveSettings(settings);
    UI.toast(res.ok ? "Provider settings saved." : res.error, res.ok ? "success" : "danger");
  });

  // ---------------------------------------------------------- simulation ----
  function fillSim() {
    $("#s-mode").value = settings.outcomeMode;
    $("#s-fail").innerHTML = Sim.FORCEABLE_FAILURES.map(function (c) { return '<option value="' + c + '">' + c + " — " + esc(Sim.FAILURE_REASONS[c].message) + "</option>"; }).join("");
    $("#s-fail").value = settings.forcedFailure;
    $("#s-fail").disabled = settings.outcomeMode !== "failure";
    ($(settings.latency === "instant" ? "#lat-i" : "#lat-r")).checked = true;
    ($(settings.theme === "day" ? "#th-l" : "#th-d")).checked = true;
  }
  function saveSim(msg) {
    const res = UI.saveSettings(settings);
    if (res.ok) UI.toast(msg, "success", { delay: 1800 }); else UI.toast(res.error, "danger");
  }
  $("#s-mode").addEventListener("change", function () { settings.outcomeMode = this.value; $("#s-fail").disabled = this.value !== "failure"; saveSim("Outcome mode: " + Sim.OUTCOME_MODES[this.value].label); });
  $("#s-fail").addEventListener("change", function () { settings.forcedFailure = this.value; saveSim("Forced failure reason saved."); });
  $$('input[name="lat"]').forEach(function (r) { r.addEventListener("change", function () { settings.latency = r.value; saveSim("Pipeline latency: " + r.value); }); });
  $$('input[name="theme"]').forEach(function (r) { r.addEventListener("change", function () { settings.theme = r.value; UI.saveSettings(settings); UI.applyTheme(r.value); }); });

  // ------------------------------------------------------ storage / reset ----
  function diag() {
    const n = Store.loadTransactions().data.length;
    $("#storage-diag").innerHTML =
      '<div><i class="bi ' + (Store.isAvailable() ? "bi-check-circle-fill text-success" : "bi-x-circle-fill text-danger") + '" aria-hidden="true"></i> localStorage ' + (Store.isAvailable() ? "available" : "unavailable") + "</div>" +
      "<div>" + n + " records · " + (Store.usageBytes() / 1024).toFixed(1) + " KB</div>" +
      '<div class="text-muted mono" style="font-size:.72rem">' + Object.keys(Store.KEYS).filter(function (k) { return k !== "CORRUPT_BACKUP"; }).map(function (k) { return Store.KEYS[k]; }).join(" · ") + "</div>";
  }

  const resetModal = bootstrap.Modal.getOrCreateInstance($("#reset-modal"));
  let pendingReset = null;
  const RESET_COPY = {
    rates: "Restore the PRD sample rate table (USD 1 · INR 83.0 · EUR 0.92). Saved transactions are not changed.",
    settings: "Restore default provider fees, outcome mode, latency and theme.",
    all: "Remove ALL demo data from this browser: simulated transaction history, custom rates and settings. This cannot be undone.",
  };
  $$("[data-reset]").forEach(function (b) {
    b.addEventListener("click", function () {
      pendingReset = b.dataset.reset;
      $("#reset-body").textContent = RESET_COPY[pendingReset];
      resetModal.show();
    });
  });
  $("#reset-confirm").addEventListener("click", function () {
    if (pendingReset === "rates" || pendingReset === "all") Store.remove(Store.KEYS.FX_RATES);
    if (pendingReset === "settings" || pendingReset === "all") Store.remove(Store.KEYS.SETTINGS);
    if (pendingReset === "all") { Store.remove(Store.KEYS.TRANSACTIONS); Store.remove(Store.KEYS.CORRUPT_BACKUP); }
    resetModal.hide();
    fxConfig = UI.getFxConfig().config;
    settings = UI.getSettings().data;
    UI.applyTheme(settings.theme);
    fillRates(); renderMatrix(fxConfig); renderProviders(); fillSim(); diag(); renderSource();
    UI.toast("Reset complete.", "success");
  });

  Store.subscribe(function () { diag(); });

  // ------------------------------------------------------ rate source ----
  let liveState = { status: "idle", errors: [] };

  function renderSource() {
    const mode = settings.rateSource === "demo" ? "demo" : "live";
    $("#sm-live").checked = mode === "live";
    $("#sm-demo").checked = mode === "demo";
    const snap = window.MCPALive ? MCPALive.getCached() : null;
    const demoTbl = C.buildRateTable(fxConfig);
    const liveTbl = snap ? C.buildRateTable({ rates: snap.rates }) : null;
    const pairs = [["USD", "INR"], ["USD", "EUR"], ["EUR", "INR"], ["INR", "USD"], ["EUR", "USD"], ["INR", "EUR"]];
    $("#live-rows").innerHTML = pairs.map(function (pr) {
      const d = demoTbl[pr[0]][pr[1]];
      const l = liveTbl ? liveTbl[pr[0]][pr[1]] : null;
      const pct = l ? ((l - d) / d) * 100 : null;
      return "<tr><td>" + C.CURRENCY_META[pr[0]].flag + " " + pr[0] + " → " + C.CURRENCY_META[pr[1]].flag + " " + pr[1] + "</td>" +
        '<td class="text-end fw-semibold">' + (l ? C.formatRate(l) : "—") + "</td>" +
        '<td class="text-end text-muted">' + C.formatRate(d) + "</td>" +
        '<td class="text-end">' + (pct === null ? "—" : '<span class="delta-chip ' + (pct >= 0 ? "up" : "down") + '">' + (pct >= 0 ? "+" : "") + pct.toFixed(2) + "%</span>") + "</td></tr>";
    }).join("");
    const st = $("#src-status");
    if (liveState.status === "loading") {
      st.innerHTML = '<span class="spinner-border spinner-border-sm" aria-hidden="true"></span> Fetching live reference rates…';
      return;
    }
    if (!snap) {
      st.innerHTML = '<span class="text-warning"><i class="bi bi-wifi-off" aria-hidden="true"></i> No live rates yet.</span>' +
        (liveState.errors.length ? "<br>" + liveState.errors.map(esc).join("<br>") : "") +
        "<br>Checkout uses the demo table until a live source responds.";
      return;
    }
    st.innerHTML =
      '<span class="rate-tag is-live"><span class="live-dot" aria-hidden="true"></span>' + (mode === "live" ? "Live — in use at checkout" : "Live — available (Demo selected)") + "</span><br><br>" +
      'source: <a href="' + esc(snap.sourceUrl) + '" target="_blank" rel="noopener noreferrer">' + esc(snap.sourceName) + "</a><br>" +
      "as of: " + esc(UI.fmtDate(snap.asOf, true)) + "<br>" +
      "checked: " + esc(UI.relTime(snap.fetchedAt)) + "<br>" +
      "cadence: " + esc(snap.cadence) +
      (liveState.status === "error" ? '<br><span class="text-warning">Last refresh failed — showing the saved snapshot.</span>' : "");
  }

  function refreshSource(force) {
    if (!window.MCPALive) return;
    liveState.status = "loading";
    renderSource();
    MCPALive.fetchLatest().then(function (res) {
      liveState = { status: "ok", errors: res.errors };
      renderSource();
      if (force) UI.toast("Live reference rates refreshed (" + res.snapshot.sourceShort + ").", "success");
    }).catch(function (e) {
      liveState = { status: "error", errors: (e && e.details) || [String(e)] };
      renderSource();
      if (force) UI.toast("Couldn't reach any live rate source.", "warning");
    });
  }

  $$('input[name="srcmode"]').forEach(function (r) {
    r.addEventListener("change", function () {
      UI.setRateSource(r.value);
      settings = UI.getSettings().data;
      renderSource();
    });
  });
  $("#src-refresh").addEventListener("click", function () { refreshSource(true); });
  document.addEventListener("mcpa:ratesource", function () { settings = UI.getSettings().data; renderSource(); });
  $("#rates-form").addEventListener("submit", function () { setTimeout(renderSource, 0); });

  // --------------------------------------------------------------- init ----
  fillRates();
  renderMatrix(fxConfig);
  renderProviders();
  fillSim();
  diag();
  renderSource();
  if (window.MCPALive && MCPALive.needsRefresh(MCPALive.getCached())) refreshSource(false);
})();
