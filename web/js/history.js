/**
 * history.js — Transaction History + Transaction Details (PRD Journey 2).
 * TransactionTable, TransactionFilters, StatusBadge, KPIs, Chart.js analytics,
 * search/sort/paginate, CSV export, sample data, live cross-tab updates.
 */
(function () {
  "use strict";

  const C = window.MCPACurrency;
  const Sim = window.MCPASimulator;
  const Store = window.MCPAStorage;
  const UI = window.MCPAUI;
  const { $, $$, esc } = UI;

  UI.boot("history");

  const PAGE_SIZE = 10;
  const PROVIDER_NAMES = { stripe_mock: "Stripe-like Mock", razorpay_mock: "Razorpay-like Mock" };
  let all = [];
  let page = 1;
  let knownIds = new Set();
  let charts = {};

  // ------------------------------------------------------------ filters ----
  const f = {
    q: $("#f-q"), status: $("#f-status"), provider: $("#f-provider"), ccy: $("#f-ccy"), sort: $("#f-sort"),
  };

  (function filtersFromUrl() {
    const p = new URLSearchParams(location.search);
    f.q.value = p.get("q") || "";
    f.status.value = p.get("status") || "";
    f.provider.value = p.get("provider") || "";
    f.ccy.value = p.get("ccy") || "";
    f.sort.value = p.get("sort") || "date_desc";
    page = Math.max(1, Number(p.get("page")) || 1);
  })();

  function filtersToUrl() {
    const p = new URLSearchParams();
    if (f.q.value.trim()) p.set("q", f.q.value.trim());
    if (f.status.value) p.set("status", f.status.value);
    if (f.provider.value) p.set("provider", f.provider.value);
    if (f.ccy.value) p.set("ccy", f.ccy.value);
    if (f.sort.value !== "date_desc") p.set("sort", f.sort.value);
    if (page > 1) p.set("page", page);
    const qs = p.toString();
    try { history.replaceState(null, "", location.pathname + (qs ? "?" + qs : "") + location.hash); } catch (e) {}
  }

  let debounce;
  f.q.addEventListener("input", function () { clearTimeout(debounce); debounce = setTimeout(function () { page = 1; render(); }, 140); });
  [f.status, f.provider, f.ccy, f.sort].forEach(function (el) { el.addEventListener("change", function () { page = 1; render(); }); });

  function applyFilters(list) {
    const q = f.q.value.trim().toUpperCase();
    let out = list.filter(function (t) {
      if (q && t.id.toUpperCase().indexOf(q) === -1) return false;
      if (f.status.value && t.status !== f.status.value) return false;
      if (f.provider.value && t.providerId !== f.provider.value) return false;
      if (f.ccy.value && t.targetCurrency !== f.ccy.value) return false;
      return true;
    });
    const usd = function (t) { return t.sourceAmount * (C.getRate(C.buildRateTable(C.DEFAULT_FX_CONFIG), t.sourceCurrency, "USD") || 1); };
    const sorters = {
      date_desc: function (a, b) { return b.createdAt.localeCompare(a.createdAt); },
      date_asc: function (a, b) { return a.createdAt.localeCompare(b.createdAt); },
      // Amount sorting compares a USD-equivalent at the default demo rates so mixed currencies order sensibly.
      amount_desc: function (a, b) { return usd(b) - usd(a); },
      amount_asc: function (a, b) { return usd(a) - usd(b); },
    };
    return out.sort(sorters[f.sort.value] || sorters.date_desc);
  }

  function renderActiveFilters() {
    const chips = [];
    if (f.q.value.trim()) chips.push(["q", "Ref: " + f.q.value.trim()]);
    if (f.status.value) chips.push(["status", f.status.value === "SUCCESS" ? "Simulated success" : "Simulated failure"]);
    if (f.provider.value) chips.push(["provider", PROVIDER_NAMES[f.provider.value]]);
    if (f.ccy.value) chips.push(["ccy", "To " + f.ccy.value]);
    $("#active-filters").innerHTML = chips.map(function (c) {
      return '<span class="filter-chip">' + esc(c[1]) + '<button type="button" data-clear="' + c[0] + '" aria-label="Remove filter ' + esc(c[1]) + '"><i class="bi bi-x" aria-hidden="true"></i></button></span>';
    }).join("") + (chips.length > 1 ? '<button type="button" class="btn btn-link btn-sm p-0" id="clear-filters">Clear all</button>' : "");
    $$("#active-filters [data-clear]").forEach(function (b) {
      b.addEventListener("click", function () { f[b.dataset.clear].value = ""; page = 1; render(); });
    });
    const ca = $("#clear-filters");
    if (ca) ca.addEventListener("click", function () { f.q.value = ""; f.status.value = ""; f.provider.value = ""; f.ccy.value = ""; page = 1; render(); });
  }

  // ---------------------------------------------------------------- load ----
  function load() {
    const r = Store.loadTransactions();
    all = r.data;
    if (r.error && r.corrupt) {
      UI.showBanner("#page-alerts", r.error, [
        { label: "Reset history", onClick: function () { Store.saveTransactions([]); load(); render(); } },
      ]);
    } else if (r.error) {
      UI.showBanner("#page-alerts", r.error);
    }
  }

  // -------------------------------------------------------------- render ----
  function render(opts) {
    const o = opts || {};
    const list = applyFilters(all);
    filtersToUrl();
    renderActiveFilters();
    renderKpis(list);
    renderCharts(list);
    renderFailures(list);

    const pages = Math.max(1, Math.ceil(list.length / PAGE_SIZE));
    if (page > pages) page = pages;
    const slice = list.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
    const host = $("#list-host");

    if (!all.length) {
      host.innerHTML =
        '<div class="empty-state"><div class="icon-bubble"><i class="bi bi-inbox" aria-hidden="true"></i></div>' +
        '<h3 class="h5 fw-bold">No simulated transactions yet.</h3><p class="text-muted mb-4">Complete a checkout to create your first record.</p>' +
        '<div class="d-flex flex-wrap justify-content-center gap-2"><a class="btn-glow text-decoration-none" href="index.html"><i class="bi bi-credit-card-2-front" aria-hidden="true"></i> Go to checkout</a>' +
        '<button type="button" class="btn-soft" id="seed-inline"><i class="bi bi-database-add" aria-hidden="true"></i> Load sample data</button></div></div>';
      $("#seed-inline").addEventListener("click", seed);
      $("#pager-wrap").classList.add("d-none");
      return;
    }
    $("#pager-wrap").classList.remove("d-none");
    if (!list.length) {
      host.innerHTML = '<div class="empty-state"><div class="icon-bubble"><i class="bi bi-funnel" aria-hidden="true"></i></div><h3 class="h6 fw-bold">No records match these filters.</h3><p class="text-muted small mb-0">Try clearing a filter or searching a different reference.</p></div>';
    } else {
      host.innerHTML =
        // Table for ≥ md
        '<div class="table-responsive d-none d-md-block"><table class="table table-app table-hover mb-0"><caption class="visually-hidden">Simulated transactions</caption><thead><tr>' +
        '<th scope="col">Reference</th><th scope="col">' + sortBtn("date", "Date") + '</th><th scope="col">Provider</th><th scope="col" class="text-end">' + sortBtn("amount", "Amount") + '</th>' +
        '<th scope="col">Conversion</th><th scope="col" class="text-end">Est. total</th><th scope="col">Status</th></tr></thead><tbody>' +
        slice.map(function (t, idx) {
          const isNew = !knownIds.has(t.id) && o.highlightNew;
          return '<tr tabindex="0" style="--i:' + idx + '" data-id="' + esc(t.id) + '" class="' + (isNew ? "row-new" : "") + '" aria-label="Open details for ' + esc(t.id) + '">' +
            '<td><span class="mono">' + esc(t.id) + "</span></td>" +
            '<td><div class="small">' + esc(UI.fmtDate(t.createdAt)) + '</div><div class="small text-muted">' + esc(UI.relTime(t.createdAt)) + "</div></td>" +
            "<td>" + UI.providerChip(t.providerId, t.providerName) + "</td>" +
            '<td class="text-end money fw-semibold">' + C.formatMoney(t.sourceAmount, t.sourceCurrency) + "</td>" +
            '<td class="small text-muted">' + t.sourceCurrency + ' <i class="bi bi-arrow-right" aria-hidden="true"></i><span class="visually-hidden"> to </span> ' + t.targetCurrency + " @ " + C.formatRate(t.exchangeRate) + "</td>" +
            '<td class="text-end money">' + C.formatMoney(t.totalAmount, t.targetCurrency) + "</td>" +
            "<td>" + UI.statusBadge(t.status) + "</td></tr>";
        }).join("") + "</tbody></table></div>" +
        // Cards for < md
        '<div class="d-md-none p-3 d-grid gap-2">' + slice.map(function (t, idx) {
          return '<button type="button" class="card-app txn-card" style="--i:' + idx + '" data-id="' + esc(t.id) + '">' +
            '<div class="d-flex justify-content-between align-items-start gap-2"><span class="mono small text-truncate">' + esc(t.id) + "</span>" + UI.statusBadge(t.status) + "</div>" +
            '<div class="d-flex justify-content-between align-items-end mt-2 gap-2"><div><div class="fw-bold money">' + C.formatMoney(t.sourceAmount, t.sourceCurrency) + '</div><div class="small text-muted">→ ' + C.formatMoney(t.totalAmount, t.targetCurrency) + " est. total</div></div>" +
            '<div class="text-end">' + UI.providerChip(t.providerId, t.providerName) + '<div class="small text-muted">' + esc(UI.relTime(t.createdAt)) + "</div></div></div></button>";
        }).join("") + "</div>";

      $$("[data-id]", host).forEach(function (row) {
        row.addEventListener("click", function () { openDetails(row.dataset.id); });
        row.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); openDetails(row.dataset.id); } });
      });
      $$("[data-sort]", host).forEach(function (b) {
        b.addEventListener("click", function () {
          const k = b.dataset.sort;
          f.sort.value = f.sort.value === k + "_desc" ? k + "_asc" : k + "_desc";
          render();
        });
      });
    }
    knownIds = new Set(all.map(function (t) { return t.id; }));

    $("#result-count").textContent = list.length ? "Showing " + ((page - 1) * PAGE_SIZE + 1) + "–" + Math.min(page * PAGE_SIZE, list.length) + " of " + list.length + (list.length !== all.length ? " (filtered from " + all.length + ")" : "") : "0 results";
    renderPager(pages);
  }

  function sortBtn(key, label) {
    const cur = f.sort.value;
    const icon = cur === key + "_desc" ? "bi-sort-down" : cur === key + "_asc" ? "bi-sort-up" : "bi-arrow-down-up";
    const aria = cur.indexOf(key) === 0 ? (cur.endsWith("desc") ? "descending" : "ascending") : "none";
    return '<button type="button" class="sort-btn" data-sort="' + key + '" aria-label="Sort by ' + label + ' (currently ' + aria + ')">' + label + ' <i class="bi ' + icon + '" aria-hidden="true"></i></button>';
  }

  function renderPager(pages) {
    const ul = $("#pager");
    if (pages <= 1) { ul.innerHTML = ""; return; }
    let html = '<li class="page-item' + (page === 1 ? " disabled" : "") + '"><button class="page-link" data-p="' + (page - 1) + '" aria-label="Previous page">‹</button></li>';
    for (let i = 1; i <= pages; i++) {
      if (pages > 7 && i > 2 && i < pages - 1 && Math.abs(i - page) > 1) { if (!html.endsWith("…</span></li>")) html += '<li class="page-item disabled"><span class="page-link">…</span></li>'; continue; }
      html += '<li class="page-item' + (i === page ? " active" : "") + '"><button class="page-link" data-p="' + i + '"' + (i === page ? ' aria-current="page"' : "") + ">" + i + "</button></li>";
    }
    html += '<li class="page-item' + (page === pages ? " disabled" : "") + '"><button class="page-link" data-p="' + (page + 1) + '" aria-label="Next page">›</button></li>';
    ul.innerHTML = html;
    $$("[data-p]", ul).forEach(function (b) {
      b.addEventListener("click", function () { page = Number(b.dataset.p); render(); $("#list-title").scrollIntoView({ block: "start", behavior: UI.reduceMotion ? "auto" : "smooth" }); });
    });
  }

  // ---------------------------------------------------------------- KPIs ----
  function renderKpis(list) {
    const n = list.length;
    const ok = list.filter(function (t) { return t.status === "SUCCESS"; });
    const rate = n ? Math.round((ok.length / n) * 100) : 0;
    const byCcy = {};
    ok.forEach(function (t) { byCcy[t.targetCurrency] = (byCcy[t.targetCurrency] || 0) + t.totalAmount; });
    const durations = list.filter(function (t) { return t.durationMs; }).map(function (t) { return t.durationMs; });
    const avgDur = durations.length ? durations.reduce(function (a, b) { return a + b; }, 0) / durations.length / 1000 : null;

    $("#kpis").innerHTML =
      kpi("Attempts", '<span class="kpi-value" id="k-n">0</span>', "bi-activity", n === all.length ? "All time, this browser" : "Matching filters") +
      '<div class="col-6 col-lg-3"><div class="card-app kpi spotlight"><div class="ring" style="--p:' + rate + '" aria-hidden="true"></div><div class="kpi-label">Success rate</div><div class="kpi-value"><span id="k-rate">0</span>%</div><div class="small text-muted">' + ok.length + " ok · " + (n - ok.length) + " failed</div></div></div>" +
      kpi("Simulated success volume", Object.keys(byCcy).length ? '<div class="d-grid gap-1 mt-1">' + Object.keys(byCcy).sort().map(function (c) { return '<div class="fw-bold money">' + C.formatMoney(byCcy[c], c, { compact: byCcy[c] > 99999 }) + "</div>"; }).join("") + "</div>" : '<div class="kpi-value">—</div>', "bi-cash-stack", "Per currency — never summed across currencies") +
      kpi("Avg. checkout time", '<div class="kpi-value">' + (avgDur ? avgDur.toFixed(1) + " s" : "—") + "</div>", "bi-stopwatch", "Target: under 30 s");
    UI.countTo($("#k-n"), n, null, { from: 0 });
    UI.countTo($("#k-rate"), rate, null, { from: 0 });
    UI.initReveal($("#kpis"));
  }

  function kpi(label, valueHtml, icon, sub) {
    return '<div class="col-6 col-lg-3"><div class="card-app kpi spotlight"><span class="kpi-icon" aria-hidden="true"><i class="bi ' + icon + '"></i></span><div class="kpi-label pe-5">' + esc(label) + "</div>" + valueHtml + '<div class="small text-muted">' + esc(sub) + "</div></div></div>";
  }

  // -------------------------------------------------------------- charts ----
  function cssVar(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }

  function renderCharts(list) {
    if (!window.Chart) return;
    const text = cssVar("--pb-muted");
    const grid = cssVar("--pb-border");
    Chart.defaults.font.family = "Inter, system-ui, sans-serif";
    Chart.defaults.color = text;

    const provIds = ["stripe_mock", "razorpay_mock"];
    const succ = provIds.map(function (id) { return list.filter(function (t) { return t.providerId === id && t.status === "SUCCESS"; }).length; });
    const fail = provIds.map(function (id) { return list.filter(function (t) { return t.providerId === id && t.status === "FAILED"; }).length; });
    const pData = {
      labels: provIds.map(function (id) { return PROVIDER_NAMES[id]; }),
      datasets: [
        { label: "Simulated success", data: succ, backgroundColor: cssVar("--pb-success"), borderRadius: 8, maxBarThickness: 46 },
        { label: "Simulated failure", data: fail, backgroundColor: cssVar("--pb-error"), borderRadius: 8, maxBarThickness: 46 },
      ],
    };
    const ccys = C.SUPPORTED_CURRENCIES;
    const cData = {
      labels: ccys,
      datasets: [{ data: ccys.map(function (c) { return list.filter(function (t) { return t.targetCurrency === c; }).length; }), backgroundColor: document.documentElement.getAttribute("data-bs-theme") === "dark" ? ["#9D8CFF", "#FFB36B", "#F47AA0"] : ["#2563EB", "#F59E0B", "#14B8A6"], borderColor: cssVar("--pb-card"), borderWidth: 3, hoverOffset: 8 }],
    };

    if (charts.p) { charts.p.data = pData; charts.p.options.scales.x.grid.color = grid; charts.p.options.scales.y.grid.color = grid; charts.p.update(); }
    else {
      charts.p = new Chart($("#chart-provider"), {
        type: "bar", data: pData,
        options: {
          responsive: true, maintainAspectRatio: false, indexAxis: "y",
          scales: { x: { stacked: true, beginAtZero: true, ticks: { precision: 0 }, grid: { color: grid } }, y: { stacked: true, grid: { color: grid, display: false } } },
          plugins: { legend: { position: "bottom", labels: { usePointStyle: true, boxWidth: 8 } } },
          animation: { duration: UI.reduceMotion ? 0 : 700 },
        },
      });
    }
    if (charts.c) { charts.c.data = cData; charts.c.update(); }
    else {
      charts.c = new Chart($("#chart-currency"), {
        type: "doughnut", data: cData,
        options: { responsive: true, maintainAspectRatio: false, cutout: "68%", plugins: { legend: { position: "bottom", labels: { usePointStyle: true, boxWidth: 8 } } }, animation: { duration: UI.reduceMotion ? 0 : 700 } },
      });
    }
  }
  document.addEventListener("mcpa:theme", function () {
    Object.keys(charts).forEach(function (k) { charts[k].destroy(); });
    charts = {};
    render();
  });

  function renderFailures(list) {
    const counts = {};
    list.filter(function (t) { return t.status === "FAILED"; }).forEach(function (t) { counts[t.failureCode || "UNKNOWN"] = (counts[t.failureCode || "UNKNOWN"] || 0) + 1; });
    const keys = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; });
    $("#failure-reasons").innerHTML = keys.length
      ? keys.map(function (k) { return '<span class="status-badge is-failed"><span class="mono">' + esc(k) + "</span> × " + counts[k] + "</span>"; }).join("")
      : '<span class="small text-muted">No simulated failures in this view.</span>';
  }

  // ------------------------------------------------------------- details ----
  const offEl = $("#details");
  const off = bootstrap.Offcanvas.getOrCreateInstance(offEl);
  let lastFocus = null;

  function openDetails(id) {
    const t = all.find(function (x) { return x.id === id; });
    lastFocus = document.activeElement;
    if (!t) {
      $("#details-body").innerHTML = '<div class="empty-state"><div class="icon-bubble"><i class="bi bi-question-circle" aria-hidden="true"></i></div><h3 class="h6">Record not found</h3><p class="small text-muted">' + esc(id) + " is not in this browser's history.</p></div>";
      off.show();
      return;
    }
    const ok = t.status === "SUCCESS";
    const q = C.quote({ amount: String(t.sourceAmount), source: t.sourceCurrency, target: t.targetCurrency, table: C.buildRateTable(C.DEFAULT_FX_CONFIG) });
    const changed = q.ok && Math.abs(q.exchangeRate - t.exchangeRate) > 1e-12;
    $("#details-body").innerHTML =
      '<div class="d-flex justify-content-between align-items-center gap-2 mb-3">' + UI.statusBadge(t.status) + '<span class="sim-badge">SIMULATED</span></div>' +
      '<div class="mono small text-muted mb-1">Reference</div><div class="ref-pill mb-3"><span>' + esc(t.id) + '</span><button type="button" class="btn btn-sm btn-light rounded-pill" id="d-copy-ref" aria-label="Copy reference"><i class="bi bi-copy" aria-hidden="true"></i></button></div>' +
      (ok ? "" : '<div class="alert alert-danger small d-flex gap-2" role="note"><i class="bi bi-x-octagon" aria-hidden="true"></i><div><b>' + esc(t.failureCode) + "</b><br>" + esc(t.failureReason) + "</div></div>") +
      '<h3 class="h6 fw-bold mt-3">Conversion breakdown</h3><ul class="breakdown">' +
      "<li><span>Original amount</span><strong>" + C.formatMoney(t.sourceAmount, t.sourceCurrency) + "</strong></li>" +
      "<li><span>" + (/^Live/.test(t.rateLabel || "") ? "Live reference rate (snapshot)" : "Rate used (snapshot)") + "</span><strong>1 " + t.sourceCurrency + " = " + C.formatRate(t.exchangeRate) + " " + t.targetCurrency + "</strong></li>" +
      "<li><span>Converted amount</span><strong>" + C.formatMoney(t.convertedAmount, t.targetCurrency) + "</strong></li>" +
      "<li><span>Mock fee (" + t.feePercent + "%" + (t.feeFixed ? " + $" + t.feeFixed : "") + ")</span><strong>" + C.formatMoney(t.feeAmount, t.feeCurrency) + "</strong></li>" +
      '<li class="total"><span>Estimated total</span><strong>' + C.formatMoney(t.totalAmount, t.targetCurrency) + "</strong></li></ul>" +
      '<div class="formula mt-2">' + C.formatMoney(t.sourceAmount, t.sourceCurrency) + " × " + C.formatRate(t.exchangeRate) + " = " + C.formatMoney(t.convertedAmount, t.targetCurrency) +
      "<br>" + C.formatMoney(t.convertedAmount, t.targetCurrency) + " × " + t.feePercent + "% = " + C.formatMoney(t.feeAmount, t.feeCurrency) + " (fee in " + t.feeCurrency + ")</div>" +
      (changed ? '<p class="small text-muted mt-2"><i class="bi bi-lock" aria-hidden="true"></i> Today\'s default demo rate differs (' + C.formatRate(q.exchangeRate) + "). This record keeps its original snapshot.</p>" : "") +
      '<h3 class="h6 fw-bold mt-4">Record</h3><div class="detail-grid">' +
      cell("Provider", UI.providerChip(t.providerId, t.providerName), true) + cell("Created", UI.fmtDate(t.createdAt, true)) +
      cell("Outcome mode", t.outcomeMode) + cell("Rule", t.outcomeRule) +
      cell("Rate label", t.rateLabel + " · " + (typeof t.rateVersion === "number" ? "v" + t.rateVersion : t.rateVersion)) + cell("Mode", t.mode) + "</div>" +
      '<h3 class="h6 fw-bold mt-4">State transitions</h3><ol class="pipeline">' + (t.timeline || []).map(function (s, i, a) {
        const last = i === a.length - 1;
        return '<li class="done' + (last ? (s.state === "SUCCESS" ? " ok" : " fail") : "") + '"><span class="node"><i class="bi ' + (last && s.state === "FAILED" ? "bi-x-lg" : "bi-check-lg") + '" aria-hidden="true"></i></span><div><div class="step-title">' + esc(s.label) + '</div><div class="step-meta">' + esc(s.state) + " · " + esc(String(s.at).slice(11, 23)) + "Z</div></div></li>";
      }).join("") + "</ol>" +
      '<div class="d-grid gap-2 mt-3">' +
      '<a class="btn-glow text-decoration-none text-center" href="index.html#result=' + encodeURIComponent(t.id) + '"><i class="bi bi-receipt" aria-hidden="true"></i> Open result receipt</a>' +
      '<div class="d-flex gap-2"><button type="button" class="btn-soft flex-fill" id="d-copy-sum"><i class="bi bi-clipboard" aria-hidden="true"></i> Copy summary</button>' +
      '<button type="button" class="btn-soft flex-fill" id="d-copy-json"><i class="bi bi-braces" aria-hidden="true"></i> Copy JSON</button></div>' +
      '<button type="button" class="btn-soft" data-bs-dismiss="offcanvas"><i class="bi bi-arrow-left" aria-hidden="true"></i> Return to history</button></div>';
    $("#d-copy-ref").addEventListener("click", function () { UI.copyText(t.id, "Reference"); });
    $("#d-copy-sum").addEventListener("click", function () { UI.copyText(UI.txnSummaryText(t), "Summary"); });
    $("#d-copy-json").addEventListener("click", function () { UI.copyText(JSON.stringify(t, null, 2), "JSON record"); });
    try { history.replaceState(null, "", location.pathname + location.search + "#txn=" + encodeURIComponent(t.id)); } catch (e) {}
    off.show();
  }
  offEl.addEventListener("hidden.bs.offcanvas", function () {
    try { history.replaceState(null, "", location.pathname + location.search); } catch (e) {}
    if (lastFocus && document.contains(lastFocus)) lastFocus.focus();
  });

  function cell(label, value, html) {
    return '<div class="cell"><small>' + esc(label) + "</small><strong>" + (html ? value : esc(value)) + "</strong></div>";
  }

  // ---------------------------------------------------------- CSV export ----
  function toCsv(list) {
    const cols = ["id", "createdAt", "status", "failureCode", "failureReason", "providerId", "providerName", "sourceAmount", "sourceCurrency", "exchangeRate", "targetCurrency", "convertedAmount", "feePercent", "feeFixed", "feeAmount", "feeCurrency", "totalAmount", "outcomeMode", "outcomeRule", "rateLabel", "rateVersion", "mode"];
    const escCell = function (v) {
      let s = v === null || v === undefined ? "" : String(v);
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // spreadsheet formula-injection guard
      return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    return [cols.join(",")].concat(list.map(function (t) { return cols.map(function (c) { return escCell(t[c]); }).join(","); })).join("\r\n");
  }

  $("#export-btn").addEventListener("click", function () {
    const list = applyFilters(all);
    if (!list.length) { UI.toast("Nothing to export — no records in the current view.", "warning"); return; }
    const blob = new Blob(["﻿" + toCsv(list)], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "paybridge-simulated-transactions-" + new Date().toISOString().slice(0, 10) + ".csv";
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    UI.toast("Exported " + list.length + " simulated record" + (list.length === 1 ? "" : "s") + " to CSV.", "success");
  });

  // --------------------------------------------------------- sample data ----
  /** Deterministic sample dataset (PRD deliverable 6) — successes and failures across all pairs. */
  function seed() {
    const tbl = C.buildRateTable(C.DEFAULT_FX_CONFIG);
    const provs = C.DEFAULT_PROVIDERS;
    const rows = [
      [100, "USD", "INR", 1, "rule_based", 0.05],
      [100.13, "USD", "EUR", 0, "rule_based", 0.3],
      [2500, "EUR", "USD", 0, "rule_based", 1.1],
      [15000, "INR", "USD", 1, "rule_based", 1.6],
      [30000, "USD", "INR", 1, "rule_based", 2.2],
      [49.99, "USD", "USD", 0, "rule_based", 2.9],
      [820, "EUR", "INR", 1, "rule_based", 3.4],
      [1200, "USD", "EUR", 0, "failure", 4.1, "SIM_PROVIDER_TIMEOUT"],
      [75000, "INR", "EUR", 1, "rule_based", 4.8],
      [310.5, "EUR", "EUR", 0, "rule_based", 5.5],
      [999, "USD", "INR", 0, "failure", 6.2, "SIM_INSUFFICIENT_BALANCE"],
      [64.13, "EUR", "USD", 1, "rule_based", 7.0],
      [5400, "INR", "INR", 1, "rule_based", 8.3],
      [18, "USD", "EUR", 0, "rule_based", 9.6],
    ];
    const existing = new Set(all.map(function (t) { return t.id; }));
    const now = Date.now();
    const records = rows.map(function (r) {
      const p = provs[r[3]];
      const created = new Date(now - r[5] * 86400000);
      const q = C.quote({ amount: String(r[0]), source: r[1], target: r[2], provider: p, table: tbl });
      const outcome = Sim.decideOutcome({ mode: r[4], forcedFailure: r[6], sourceAmount: q.sourceAmount, sourceCurrency: r[1], table: tbl, provider: p });
      const ts = function (ms) { return new Date(created.getTime() + ms).toISOString(); };
      const id = Sim.generateReference(p.tag, existing, created);
      existing.add(id);
      const t = Sim.buildTransaction({
        id: id, quote: q, provider: p, outcome: outcome, mode: r[4], fxConfig: C.DEFAULT_FX_CONFIG, createdAt: created.toISOString(),
        timeline: [
          { state: "CREATED", label: Sim.STATE_LABELS.CREATED, at: ts(0) },
          { state: "AUTHORIZING", label: Sim.STATE_LABELS.AUTHORIZING, at: ts(520) },
          { state: "PROCESSING", label: Sim.STATE_LABELS.PROCESSING, at: ts(1040) },
          { state: outcome.status, label: Sim.STATE_LABELS[outcome.status], at: ts(1770) },
        ],
      });
      t.durationMs = 9000 + ((r[0] * 37) % 15000);
      t.sample = true;
      return t;
    });
    const merged = records.concat(all).sort(function (a, b) { return b.createdAt.localeCompare(a.createdAt); });
    const res = Store.saveTransactions(merged);
    if (!res.ok) { UI.toast(res.error, "danger"); return; }
    load();
    render({ highlightNew: true });
    UI.toast("Loaded " + records.length + " sample simulated records (" + records.filter(function (t) { return t.status === "FAILED"; }).length + " failures).", "success");
  }
  $("#seed-btn").addEventListener("click", seed);

  // --------------------------------------------------------------- clear ----
  const clearModal = bootstrap.Modal.getOrCreateInstance($("#clear-modal"));
  $("#clear-btn").addEventListener("click", function () {
    if (!all.length) { UI.toast("History is already empty.", "info"); return; }
    $("#clear-count").textContent = all.length;
    clearModal.show();
  });
  $("#clear-confirm").addEventListener("click", function () {
    const res = Store.saveTransactions([]);
    clearModal.hide();
    if (!res.ok) { UI.toast(res.error, "danger"); return; }
    load();
    render();
    UI.toast("Simulated history cleared.", "success");
  });

  // ------------------------------------------------- live updates & init ----
  Store.subscribe(function (key, origin) {
    if (key !== Store.KEYS.TRANSACTIONS || origin === "local") return;
    load();
    render({ highlightNew: true });
    UI.toast("History updated from another tab.", "info", { delay: 2000 });
  });

  UI.registerShortcuts([
    { keys: "/", label: "Search by reference", match: function (e) { return e.key === "/"; }, run: function () { f.q.focus(); } },
    { keys: "e", label: "Export CSV", match: function (e) { return e.key === "e"; }, run: function () { $("#export-btn").click(); } },
    { keys: "← / →", label: "Previous / next page", match: function (e) { return e.key === "ArrowLeft" || e.key === "ArrowRight"; }, run: function (e) {
      const pages = Math.ceil(applyFilters(all).length / PAGE_SIZE);
      const next = page + (e.key === "ArrowRight" ? 1 : -1);
      if (next >= 1 && next <= pages) { page = next; render(); }
    } },
  ]);
  UI.registerCommands([
    { id: "h-success", title: "Filter: simulated successes only", group: "History", icon: "bi-check-circle", run: function () { f.status.value = "SUCCESS"; page = 1; render(); } },
    { id: "h-failed", title: "Filter: simulated failures only", group: "History", icon: "bi-x-circle", run: function () { f.status.value = "FAILED"; page = 1; render(); } },
    { id: "h-stripe", title: "Filter: Stripe-like Mock", group: "History", icon: "bi-funnel", run: function () { f.provider.value = "stripe_mock"; page = 1; render(); } },
    { id: "h-rzp", title: "Filter: Razorpay-like Mock", group: "History", icon: "bi-funnel", run: function () { f.provider.value = "razorpay_mock"; page = 1; render(); } },
    { id: "h-clear", title: "Clear all filters", group: "History", icon: "bi-x-lg", run: function () { f.q.value = ""; f.status.value = ""; f.provider.value = ""; f.ccy.value = ""; page = 1; render(); } },
    { id: "h-export", title: "Export current view to CSV", group: "History", icon: "bi-filetype-csv", keys: "e", run: function () { $("#export-btn").click(); } },
    { id: "h-seed", title: "Load sample simulated data", group: "History", icon: "bi-database-add", run: seed },
  ]);

  load();
  render();
  const m = /^#txn=(.+)$/.exec(location.hash);
  if (m) openDetails(decodeURIComponent(m[1]));
})();
