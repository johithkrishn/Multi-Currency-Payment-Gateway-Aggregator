/**
 * tour.js — Product tour page effects:
 *  - typing line that types a live demo conversion, then a ghost suffix, then erases
 *  - full-screen illustrated hero + stacked scene chapters (scenes from scene.js)
 *  - demo-rate ticker (marquee)
 *  - scroll-spy word list: the word nearest the viewport centre lights up and
 *    drives a sticky explainer screen
 *  - horizontal drag/scroll-snap carousel with prev/next + progress bar
 * All motion respects prefers-reduced-motion.
 */
(function () {
  "use strict";

  const C = window.MCPACurrency;
  const UI = window.MCPAUI;
  const { $, $$, esc } = UI;
  const RM = UI.reduceMotion;

  UI.boot("tour");

  const activeFx = UI.getActiveFx();
  const fx = activeFx.config;
  const isLive = activeFx.mode === "live";
  const rateWord = isLive ? "live" : "demo";
  const table = C.buildRateTable(fx);
  const providers = UI.getSettings().data.providers;

  // ------------------------------------------------------------ typing ----
  (function typer() {
    const samples = [["100", "USD", "INR"], ["2500", "EUR", "USD"], ["15000", "INR", "EUR"], ["499.99", "USD", "EUR"]];
    const phrases = samples.map(function (s) {
      const q = C.quote({ amount: s[0], source: s[1], target: s[2], table: table });
      return { typed: C.formatMoney(q.sourceAmount, s[1]) + " → " + C.formatMoney(q.convertedDisplay, s[2]), ghost: "  · " + rateWord + " rate" };
    });
    const typed = $("#typed");
    const ghost = $("#ghost");
    if (RM) { typed.textContent = phrases[0].typed; ghost.textContent = phrases[0].ghost; return; }
    let i = 0;
    const wait = function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    (async function loop() {
      for (;;) {
        const p = phrases[i % phrases.length];
        for (let k = 1; k <= p.typed.length; k++) { typed.textContent = p.typed.slice(0, k); await wait(42 + Math.random() * 40); }
        await wait(220);
        for (let k = 1; k <= p.ghost.length; k++) { ghost.textContent = p.ghost.slice(0, k); await wait(30); }
        await wait(1800);
        ghost.textContent = "";
        for (let k = p.typed.length; k >= 0; k--) { typed.textContent = p.typed.slice(0, k); await wait(18); }
        await wait(260);
        i++;
      }
    })();
  })();

  // ------------------------------------------------- chapter live stats ----
  (function chapters() {
    const rateEl = $("#ch-rate");
    if (rateEl) rateEl.textContent = C.formatRate(table.USD.INR);
    const unitEl = $("#ch-rate-unit");
    if (unitEl) unitEl.textContent = "INR per 1 USD · " + (isLive ? "live (" + fx.sourceShort + ", " + fx.updatedAt.slice(0, 10) + ")" : "demo");
    const quotes = providers.filter(function (p) { return p.enabled; }).map(function (p) {
      return C.quote({ amount: "100", source: "USD", target: "INR", provider: p, table: table });
    });
    const saveEl = $("#ch-save");
    if (saveEl && quotes.length > 1) {
      const fees = quotes.map(function (q) { return q.feeDisplay; });
      saveEl.textContent = C.formatMoney(Math.max.apply(null, fees) - Math.min.apply(null, fees), "INR");
    }
    UI.magnetic($("#cta-btn"), 0.18);
  })();

  // ------------------------------------------------------------ ticker ----
  (function ticker() {
    const items = [];
    C.SUPPORTED_CURRENCIES.forEach(function (s) {
      C.SUPPORTED_CURRENCIES.forEach(function (t) {
        if (s === t) return;
        items.push('<span class="ticker-item"><span class="pair">' + C.CURRENCY_META[s].flag + " " + s + "/" + t + "</span>" + C.formatRate(table[s][t]) + '<span class="rate-tag' + (isLive ? " is-live" : "") + '" style="font-size:.6rem;padding:1px 6px">' + (isLive ? '<span class="live-dot" aria-hidden="true"></span>' : "") + rateWord + "</span></span>");
      });
    });
    const html = items.join("");
    $("#ticker").innerHTML = html + html; // duplicated for a seamless loop
    $("#ticker").setAttribute("aria-hidden", "true");
  })();

  // ------------------------------------------------- scroll-spy flow list ----
  (function flow() {
    const q = C.quote({ amount: "100", source: "USD", target: "INR", provider: providers[1] || providers[0], table: table });
    const steps = [
      ["Amount", "Enter an amount", "Positive decimals up to 1,000,000 with at most 2 places. Empty, zero, negative and malformed input get precise messages — and your value is kept.", 'validateAmount("100")\n→ { ok: true, value: 100 }'],
      ["Currencies", "Pick source & target", "USD, INR and EUR in either direction. Swap with one key (S). Same-currency pairs use a rate of exactly 1.", "source = USD · target = INR"],
      [isLive ? "Live rate" : "Demo rate", isLive ? "Read the live reference rate" : "Read the demo rate", isLive ? "One convention everywhere: fxRates[source][target] = target units per 1 source unit. Live mode uses real ECB reference rates (with fallbacks) — clearly labelled, never an executable quote." : "One convention everywhere: fxRates[source][target] = target units per 1 source unit. Labelled illustrative — never a live quote.", "fxRates.USD.INR = " + C.formatRate(q.exchangeRate) + "\n100 × " + C.formatRate(q.exchangeRate) + " = " + C.formatMoney(q.convertedDisplay, "INR")],
      ["Providers", "Compare mock providers", "Stripe-like and Razorpay-like mocks side by side with live fee and total estimates. The cheaper one gets a badge.", "fee = converted × 2% = " + C.formatMoney(q.feeDisplay, "INR")],
      ["Review", "Review the summary", "An accessible dialog shows amount, rate, converted value, fee and total — in one currency, never mixed.", "total = " + C.formatMoney(q.convertedDisplay, "INR") + " + " + C.formatMoney(q.feeDisplay, "INR") + "\n      = " + C.formatMoney(q.totalDisplay, "INR")],
      ["Authorise", "Mock authorisation", "The state machine moves CREATED → AUTHORIZING. Nothing leaves the browser; no SDK, no API, no card data.", "state: CREATED → AUTHORIZING"],
      ["Process", "Mock processing", "Deterministic rules decide the outcome: .13 cents declines, > 25,000 USD hits the risk limit, disabled providers are unavailable.", "decideOutcome({ mode: 'rule_based' })"],
      ["Outcome", "Simulated outcome", "“Simulated payment successful” or “Simulated payment failed” — with an icon, text, reason and a unique reference.", "SIM-RZP-YYYYMMDD-XXXXXX"],
      ["Record", "Save the snapshot", "The record is written to localStorage before the result appears, keeping the rate and fee used at that moment forever.", 'localStorage["mcpa_transactions_v1"]'],
      ["Inspect", "Inspect in history", "Filter by status, provider and currency, search references, sort, chart, export CSV and open full details.", "history.html#txn=SIM-…"],
    ];
    const list = $("#flow-words");
    list.innerHTML = steps.map(function (s, i) {
      return '<li data-i="' + i + '" tabindex="0"><span class="num">' + String(i + 1).padStart(2, "0") + "</span>" + esc(s[0]) + "</li>";
    }).join("");
    $("#fs-dots").innerHTML = steps.map(function () { return '<span style="height:4px;flex:1;border-radius:4px;background:#1e293b"></span>'; }).join("");

    let active = -1;
    function setActive(i) {
      if (i === active) return;
      active = i;
      const words = $$("#flow-words li");
      words.forEach(function (w, j) {
        w.classList.toggle("active", j === i);
        w.classList.toggle("near", Math.abs(j - i) === 1);
      });
      const s = steps[i];
      const screen = $("#flow-screen");
      $("#fs-label").textContent = "Step " + String(i + 1).padStart(2, "0") + " / " + steps.length;
      $("#fs-title").textContent = s[1];
      $("#fs-body").textContent = s[2];
      $("#fs-code").textContent = s[3];
      $$("#fs-dots span").forEach(function (d, j) { d.style.background = j <= i ? "#3b82f6" : "#1e293b"; });
      if (!RM) {
        screen.style.transform = "translateY(6px) scale(.985)";
        requestAnimationFrame(function () { requestAnimationFrame(function () { screen.style.transform = ""; }); });
      }
    }
    function onScroll() {
      const mid = window.innerHeight / 2;
      let best = 0, bestD = Infinity;
      $$("#flow-words li").forEach(function (li, i) {
        const r = li.getBoundingClientRect();
        const d = Math.abs(r.top + r.height / 2 - mid);
        if (d < bestD) { bestD = d; best = i; }
      });
      setActive(best);
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    $$("#flow-words li").forEach(function (li) {
      const go = function () { li.scrollIntoView({ block: "center", behavior: RM ? "auto" : "smooth" }); setActive(Number(li.dataset.i)); };
      li.addEventListener("click", go);
      li.addEventListener("keydown", function (e) { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); go(); } });
    });
    setActive(0);

  })();

  // ---------------------------------------------------------- carousel ----
  (function carousel() {
    const cards = [
      ["#2563EB,#1D4ED8", "bi-command", "Command palette", "Ctrl/⌘ K anywhere: navigate, flip demo outcomes, load sample data, run demo scenarios.", "index.html"],
      ["#15803D,#166534", "bi-diagram-3", "Deterministic outcomes", "Success, failure and rule-based modes make every demo repeatable — no random failures.", "settings.html"],
      ["#7C3AED,#5B21B6", "bi-lock", "Snapshot integrity", "Edit demo rates any time; each saved record keeps the exact rate and fee it used.", "settings.html"],
      ["#B45309,#92400E", "bi-filetype-csv", "Export & copy", "CSV export (formula-injection safe), copyable summaries, JSON records and printable receipts.", "history.html"],
      ["#0C7CD5,#075985", "bi-phone", "Mobile companion", "React Native + Expo Go: checkout, bottom sheet and result screen with identical maths.", "tour.html#flow"],
      ["#0F766E,#115E59", "bi-universal-access", "Accessible by default", "Semantic forms, focus rings, dialog semantics, live regions, text+icon statuses, reduced motion.", "index.html"],
      ["#1E293B,#0F172A", "bi-link-45deg", "Shareable deep links", "Checkouts, filters, receipts and record details all live in the URL.", "history.html?status=FAILED"],
    ];
    const sc = $("#scroller");
    sc.innerHTML = cards.map(function (c) {
      return '<article class="feature-card card-app spotlight"><div><div class="fc-art" style="background:linear-gradient(135deg,' + c[0] + ')" aria-hidden="true"><i class="bi ' + c[1] + '"></i></div>' +
        "<h3>" + esc(c[2]) + '</h3><p class="text-muted small mb-0">' + esc(c[3]) + '</p></div><a class="small fw-semibold mt-3 text-decoration-none" href="' + c[4] + '" draggable="false">Explore <i class="bi bi-arrow-up-right" aria-hidden="true"></i></a></article>';
    }).join("");

    const prev = $("#car-prev"), next = $("#car-next"), bar = $("#car-bar");
    function step() { const card = sc.querySelector(".feature-card"); return card ? card.getBoundingClientRect().width + 16 : 300; }
    function sync() {
      const max = sc.scrollWidth - sc.clientWidth;
      const p = max > 0 ? sc.scrollLeft / max : 0;
      const vis = sc.clientWidth / sc.scrollWidth;
      bar.style.width = Math.max(10, vis * 100) + "%";
      bar.style.transform = "translateX(" + (p * (1 / Math.max(vis, 0.1) - 1) * 100) + "%)";
      prev.disabled = sc.scrollLeft <= 2;
      next.disabled = sc.scrollLeft >= max - 2;
    }
    prev.addEventListener("click", function () { sc.scrollBy({ left: -step(), behavior: RM ? "auto" : "smooth" }); });
    next.addEventListener("click", function () { sc.scrollBy({ left: step(), behavior: RM ? "auto" : "smooth" }); });
    sc.addEventListener("scroll", sync, { passive: true });
    window.addEventListener("resize", sync);
    sc.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight") { e.preventDefault(); next.click(); }
      if (e.key === "ArrowLeft") { e.preventDefault(); prev.click(); }
    });
    // Drag to scroll (mouse); touch uses native scrolling.
    let down = false, startX = 0, startLeft = 0, moved = false;
    sc.addEventListener("pointerdown", function (e) {
      if (e.pointerType !== "mouse") return;
      down = true; moved = false; startX = e.clientX; startLeft = sc.scrollLeft;
    });
    window.addEventListener("pointermove", function (e) {
      if (!down) return;
      const dx = e.clientX - startX;
      if (Math.abs(dx) > 4) { moved = true; sc.classList.add("dragging"); }
      sc.scrollLeft = startLeft - dx;
    });
    window.addEventListener("pointerup", function () {
      if (!down) return;
      down = false;
      sc.classList.remove("dragging");
    });
    sc.addEventListener("click", function (e) { if (moved) { e.preventDefault(); e.stopPropagation(); moved = false; } }, true);
    sync();
  })();

  if (window.MCPALive && UI.getSettings().data.rateSource === "live" && MCPALive.needsRefresh(MCPALive.getCached())) MCPALive.fetchLatest().catch(function () {});
  UI.initReveal();
})();
