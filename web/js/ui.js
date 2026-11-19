/**
 * ui.js — shared UI components & effects (vanilla JS "components" = functions
 * that render HTML and attach handlers, per PRD §9).
 *
 * AppNavbar, Toast, StatusBadge, command palette (Ctrl/⌘ K), keyboard-shortcut
 * help (?), theme toggle, spotlight (cursor-following glow), magnetic buttons,
 * scroll reveal, number count-up, clipboard, confetti.
 */
(function (root) {
  "use strict";

  const C = root.MCPACurrency;
  const S = root.MCPAStorage;
  const reduceMotion = root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches;

  // ---------------------------------------------------------------------------
  // App state helpers (FX config + settings), shared by every page
  // ---------------------------------------------------------------------------

  const DEFAULT_SETTINGS = {
    outcomeMode: "rule_based",
    forcedFailure: "SIM_PROVIDER_TIMEOUT",
    latency: "realistic", // "realistic" | "instant"
    rateSource: "live", // "live" = real reference rates (ECB …) with demo fallback · "demo" = illustrative table
    theme: "dusk", // "dusk" = illustrated night theme (default) · "day" = light PRD palette
    providers: C.DEFAULT_PROVIDERS.map(function (p) { return Object.assign({}, p); }),
  };

  function getFxConfig() {
    const r = S.loadFxConfig(JSON.parse(JSON.stringify(C.DEFAULT_FX_CONFIG)));
    const v = C.validateFxConfig(r.data);
    if (!v.ok) return { config: JSON.parse(JSON.stringify(C.DEFAULT_FX_CONFIG)), error: "Saved demo rates were invalid (" + v.errors[0] + ") — defaults are in use.", invalid: true };
    return { config: r.data, error: r.error };
  }

  /**
   * The rate config checkout should use right now (synchronous):
   *  - "live" mode + a usable cached live snapshot → live reference config
   *  - otherwise → the (editable) demo table.
   * Returns { config, mode: "live"|"demo", fallback: bool, error }.
   */
  function getActiveFx() {
    const demo = getFxConfig();
    const s = getSettings().data;
    if (s.rateSource !== "live" || !root.MCPALive) return { config: demo.config, mode: "demo", fallback: false, error: demo.error };
    const snap = root.MCPALive.getCached();
    if (!snap) return { config: demo.config, mode: "demo", fallback: true, error: demo.error };
    return { config: root.MCPALive.toFxConfig(snap), mode: "live", fallback: false, snapshot: snap, demoConfig: demo.config };
  }

  function getSettings() {
    return S.loadSettings(DEFAULT_SETTINGS);
  }

  function saveSettings(next) {
    return S.write(S.KEYS.SETTINGS, next);
  }

  // ---------------------------------------------------------------------------
  // Tiny helpers
  // ---------------------------------------------------------------------------

  function $(sel, ctx) { return (ctx || document).querySelector(sel); }
  function $$(sel, ctx) { return Array.prototype.slice.call((ctx || document).querySelectorAll(sel)); }

  function esc(v) {
    return String(v === null || v === undefined ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function fmtDate(iso, withSeconds) {
    try {
      const d = new Date(iso);
      return d.toLocaleString(undefined, {
        year: "numeric", month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit",
        second: withSeconds ? "2-digit" : undefined,
      });
    } catch (e) { return iso; }
  }

  function relTime(iso) {
    const diff = (Date.now() - new Date(iso).getTime()) / 1000;
    if (diff < 45) return "just now";
    if (diff < 3600) return Math.round(diff / 60) + " min ago";
    if (diff < 86400) return Math.round(diff / 3600) + " h ago";
    return Math.round(diff / 86400) + " d ago";
  }

  // ---------------------------------------------------------------------------
  // AppNavbar
  // ---------------------------------------------------------------------------

  const NAV = [
    { href: "index.html", id: "checkout", label: "Checkout", icon: "bi-credit-card-2-front" },
    { href: "history.html", id: "history", label: "History", icon: "bi-clock-history" },
    { href: "settings.html", id: "settings", label: "FX & Settings", icon: "bi-sliders" },
    { href: "tour.html", id: "tour", label: "Tour", icon: "bi-stars" },
  ];

  function renderNavbar(active) {
    const host = $("#app-navbar");
    if (!host) return;
    const isMac = /Mac|iPhone|iPad/.test(navigator.platform || navigator.userAgent);
    host.innerHTML =
      '<a class="skip-link" href="#main">Skip to content</a>' +
      '<nav class="navbar navbar-expand-lg app-navbar" aria-label="Primary">' +
      '<div class="container-xl">' +
      '<a class="navbar-brand d-flex align-items-center gap-2" href="index.html" aria-label="PayBridge home">' + logoSvg(38) +
      '<span class="brand-text"><span class="brand-word">Pay<span>Bridge</span></span><span class="brand-sub">Multi-Currency Aggregator · Demo</span></span></a>' +
      '<div class="d-flex align-items-center gap-2 order-lg-3">' +
      '<a class="btn-outline-dusk d-none d-md-inline-flex" href="index.html">New checkout</a>' +
      '<button class="btn btn-icon" type="button" id="cmdk-open" aria-label="Open command palette" title="Command palette (' + (isMac ? "⌘" : "Ctrl") + " K)\">" +
      '<i class="bi bi-command" aria-hidden="true"></i><span class="kbd-hint d-none d-md-inline">' + (isMac ? "⌘" : "Ctrl") + ' K</span></button>' +
      '<button class="btn btn-icon" type="button" id="theme-toggle" aria-label="Toggle dark mode"><i class="bi bi-moon-stars" aria-hidden="true"></i></button>' +
      '<button class="navbar-toggler" type="button" data-bs-toggle="collapse" data-bs-target="#nav-links" aria-controls="nav-links" aria-expanded="false" aria-label="Toggle navigation"><i class="bi bi-list" aria-hidden="true"></i></button>' +
      "</div>" +
      '<div class="collapse navbar-collapse order-lg-2" id="nav-links"><ul class="navbar-nav mx-lg-auto gap-lg-1">' +
      NAV.map(function (n) {
        const on = n.id === active;
        return '<li class="nav-item"><a class="nav-link' + (on ? " active" : "") + '"' + (on ? ' aria-current="page"' : "") + ' href="' + n.href + '"><i class="bi ' + n.icon + '" aria-hidden="true"></i> ' + n.label + "</a></li>";
      }).join("") +
      "</ul></div></div></nav>";

    $("#theme-toggle").addEventListener("click", cycleTheme);
    $("#cmdk-open").addEventListener("click", function () { openPalette(); });
    syncThemeIcon();
  }

  /**
   * PayBridge mark: a suspension bridge (arch + hangers + deck) with a coin that
   * travels across it — money crossing between currencies. The arch draws itself
   * in on load; the coin loops along the arch (static when reduced motion is on).
   */
  const ARCH = "M9 27 C 13 13, 27 13, 31 27";
  function logoSvg(size, opts) {
    const s = size || 38;
    const o = opts || {};
    const coin = reduceMotion
      ? '<circle cx="20" cy="16.6" r="2.7" fill="#FCD34D" stroke="#fff" stroke-width="1"/>'
      : '<circle r="2.7" fill="#FCD34D" stroke="#fff" stroke-width="1"><animateMotion dur="2.8s" repeatCount="indefinite" path="' + ARCH + '" keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines=".45 0 .55 1"/></circle>';
    return '<svg class="brand-logo' + (o.className ? " " + o.className : "") + '" width="' + s + '" height="' + s + '" viewBox="0 0 40 40" aria-hidden="true">' +
      '<defs><linearGradient id="pb-bg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#60A5FA"/><stop offset=".45" stop-color="#2563EB"/><stop offset="1" stop-color="#1E3A8A"/></linearGradient>' +
      '<radialGradient id="pb-shine" cx=".25" cy=".15" r=".8"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset=".6" stop-color="#fff" stop-opacity="0"/></radialGradient></defs>' +
      '<rect width="40" height="40" rx="12" fill="url(#pb-bg)"/><rect width="40" height="40" rx="12" fill="url(#pb-shine)"/>' +
      '<path class="lg-hangers" d="M14 18.8V27M20 16.6V27M26 18.8V27" stroke="#fff" stroke-opacity=".5" stroke-width="1.6" stroke-linecap="round"/>' +
      '<path class="lg-deck" d="M6.5 27.5H33.5" stroke="#fff" stroke-opacity=".75" stroke-width="2.2" stroke-linecap="round"/>' +
      '<path class="lg-arch" d="' + ARCH + '" fill="none" stroke="#fff" stroke-width="3.2" stroke-linecap="round" pathLength="100"/>' +
      coin + "</svg>";
  }

  function renderFooter() {
    const host = $("#app-footer");
    if (!host) return;
    host.innerHTML =
      '<footer class="app-footer"><div class="container-xl d-flex flex-column flex-md-row gap-2 justify-content-between">' +
      "<span>PayBridge is an educational FinTech prototype (PST_PD_045). Mock providers are not connected to Stripe or Razorpay. Exchange rates are illustrative.</span>" +
      '<span class="text-nowrap"><button type="button" class="btn btn-link btn-sm p-0 link-secondary" id="shortcut-help-btn">Keyboard shortcuts <kbd>?</kbd></button></span>' +
      "</div></footer>";
    $("#shortcut-help-btn").addEventListener("click", openShortcutHelp);
  }

  // ---------------------------------------------------------------------------
  // Theme
  // ---------------------------------------------------------------------------

  /** "day" → light PRD palette; anything else (incl. legacy values) → Dusk. */
  function resolvedTheme(pref) {
    return pref === "day" ? "light" : "dark";
  }

  function applyTheme(pref) {
    document.documentElement.setAttribute("data-bs-theme", resolvedTheme(pref));
    syncThemeIcon();
    document.dispatchEvent(new CustomEvent("mcpa:theme"));
  }

  function cycleTheme() {
    const s = getSettings().data;
    const current = resolvedTheme(s.theme);
    s.theme = current === "dark" ? "day" : "dusk";
    saveSettings(s);
    applyTheme(s.theme);
    toast("Theme: " + (s.theme === "day" ? "Day (light)" : "Dusk"), "info");
  }

  function syncThemeIcon() {
    const btn = $("#theme-toggle");
    if (!btn) return;
    const dark = document.documentElement.getAttribute("data-bs-theme") === "dark";
    btn.innerHTML = '<i class="bi ' + (dark ? "bi-sun" : "bi-moon-stars") + '" aria-hidden="true"></i>';
    btn.setAttribute("aria-label", dark ? "Switch to Day theme" : "Switch to Dusk theme");
  }

  // ---------------------------------------------------------------------------
  // Toast / Alert (aria-live)
  // ---------------------------------------------------------------------------

  function ensureToastHost() {
    let host = $("#toast-host");
    if (!host) {
      host = document.createElement("div");
      host.id = "toast-host";
      host.className = "toast-container position-fixed bottom-0 end-0 p-3";
      host.setAttribute("aria-live", "polite");
      host.setAttribute("aria-atomic", "false");
      document.body.appendChild(host);
    }
    return host;
  }

  const TOAST_ICON = { success: "bi-check-circle-fill", danger: "bi-x-octagon-fill", warning: "bi-exclamation-triangle-fill", info: "bi-info-circle-fill" };

  function toast(message, severity, opts) {
    const sev = severity || "info";
    const host = ensureToastHost();
    const el = document.createElement("div");
    el.className = "toast app-toast toast-" + sev;
    el.setAttribute("role", sev === "danger" ? "alert" : "status");
    el.innerHTML =
      '<div class="d-flex align-items-start gap-2 p-3"><i class="bi ' + TOAST_ICON[sev] + ' toast-icon" aria-hidden="true"></i>' +
      '<div class="flex-grow-1 small">' + esc(message) +
      (opts && opts.action ? ' <button type="button" class="btn btn-link btn-sm p-0 align-baseline toast-action">' + esc(opts.action.label) + "</button>" : "") +
      '</div><button type="button" class="btn-close btn-close-sm" data-bs-dismiss="toast" aria-label="Dismiss notification"></button></div>';
    host.appendChild(el);
    if (opts && opts.action) el.querySelector(".toast-action").addEventListener("click", opts.action.onClick);
    const t = new root.bootstrap.Toast(el, { delay: (opts && opts.delay) || 3800 });
    el.addEventListener("hidden.bs.toast", function () { el.remove(); });
    t.show();
  }

  // ---------------------------------------------------------------------------
  // StatusBadge
  // ---------------------------------------------------------------------------

  function statusBadge(status) {
    const ok = status === "SUCCESS";
    return '<span class="status-badge ' + (ok ? "is-success" : "is-failed") + '"><i class="bi ' + (ok ? "bi-check-circle-fill" : "bi-x-circle-fill") + '" aria-hidden="true"></i>' +
      (ok ? "Simulated success" : "Simulated failure") + "</span>";
  }

  function providerChip(providerId, name) {
    const isStripe = providerId === "stripe_mock";
    return '<span class="provider-chip ' + (isStripe ? "is-stripe" : "is-razorpay") + '"><span class="dot" aria-hidden="true"></span>' + esc(name || providerId) + "</span>";
  }

  // ---------------------------------------------------------------------------
  // Command palette (Ctrl/⌘ K) & shortcuts help
  // ---------------------------------------------------------------------------

  let pageCommands = [];
  const globalCommands = [
    { id: "go-checkout", title: "Go to Checkout", group: "Navigate", icon: "bi-credit-card-2-front", keys: "g c", run: function () { location.href = "index.html"; } },
    { id: "go-history", title: "Go to Transaction History", group: "Navigate", icon: "bi-clock-history", keys: "g h", run: function () { location.href = "history.html"; } },
    { id: "go-settings", title: "Go to FX Rates & Demo Settings", group: "Navigate", icon: "bi-sliders", keys: "g s", run: function () { location.href = "settings.html"; } },
    { id: "go-tour", title: "Open the product tour", group: "Navigate", icon: "bi-stars", keys: "g t", run: function () { location.href = "tour.html"; } },
    { id: "theme", title: "Toggle Dusk / Day theme", group: "Preferences", icon: "bi-circle-half", run: cycleTheme },
    { id: "mode-success", title: "Demo outcome → Always succeed", group: "Simulation", icon: "bi-check2-circle", run: function () { setOutcomeMode("success"); } },
    { id: "mode-failure", title: "Demo outcome → Always fail", group: "Simulation", icon: "bi-x-circle", run: function () { setOutcomeMode("failure"); } },
    { id: "mode-rules", title: "Demo outcome → Rule-based (deterministic)", group: "Simulation", icon: "bi-diagram-3", run: function () { setOutcomeMode("rule_based"); } },
    { id: "rates-live", title: "Rate source → Live reference rates (ECB)", group: "Rates", icon: "bi-broadcast", run: function () { setRateSource("live"); } },
    { id: "rates-demo", title: "Rate source → Demo table", group: "Rates", icon: "bi-table", run: function () { setRateSource("demo"); } },
    { id: "shortcuts", title: "Show keyboard shortcuts", group: "Help", icon: "bi-keyboard", keys: "?", run: function () { openShortcutHelp(); } },
  ];

  function setOutcomeMode(mode) {
    const s = getSettings().data;
    s.outcomeMode = mode;
    saveSettings(s);
    document.dispatchEvent(new CustomEvent("mcpa:settings"));
    toast("Demo outcome set to: " + root.MCPASimulator.OUTCOME_MODES[mode].label, "info");
  }

  function setRateSource(mode) {
    const s = getSettings().data;
    s.rateSource = mode;
    saveSettings(s);
    document.dispatchEvent(new CustomEvent("mcpa:ratesource", { detail: mode }));
    toast(mode === "live" ? "Using live reference rates." : "Using the demo rate table.", "info");
  }

  function registerCommands(cmds) { pageCommands = cmds || []; }

  function ensurePalette() {
    let m = $("#cmdk");
    if (m) return m;
    m = document.createElement("div");
    m.className = "modal fade cmdk-modal";
    m.id = "cmdk";
    m.tabIndex = -1;
    m.setAttribute("aria-labelledby", "cmdk-title");
    m.setAttribute("aria-hidden", "true");
    m.innerHTML =
      '<div class="modal-dialog modal-dialog-scrollable"><div class="modal-content">' +
      '<h2 class="visually-hidden" id="cmdk-title">Command palette</h2>' +
      '<div class="cmdk-search"><i class="bi bi-search" aria-hidden="true"></i>' +
      '<input id="cmdk-input" type="text" class="form-control" placeholder="Type a command or search…" autocomplete="off" role="combobox" aria-expanded="true" aria-controls="cmdk-list" aria-autocomplete="list">' +
      '<kbd>Esc</kbd></div><div class="modal-body p-2"><ul id="cmdk-list" class="cmdk-list" role="listbox" aria-label="Commands"></ul></div></div></div>';
    document.body.appendChild(m);
    const input = $("#cmdk-input");
    input.addEventListener("input", function () { paintPalette(input.value); });
    input.addEventListener("keydown", function (e) {
      const items = $$("#cmdk-list [role=option]");
      let idx = items.findIndex(function (i) { return i.getAttribute("aria-selected") === "true"; });
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        idx = e.key === "ArrowDown" ? Math.min(items.length - 1, idx + 1) : Math.max(0, idx - 1);
        selectOption(items, idx);
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (items[idx]) items[idx].click();
      }
    });
    m.addEventListener("shown.bs.modal", function () { input.focus(); });
    return m;
  }

  function selectOption(items, idx) {
    items.forEach(function (it, i) { it.setAttribute("aria-selected", i === idx ? "true" : "false"); });
    if (items[idx]) {
      items[idx].scrollIntoView({ block: "nearest" });
      $("#cmdk-input").setAttribute("aria-activedescendant", items[idx].id);
    }
  }

  function fuzzy(q, text) {
    q = q.toLowerCase().trim();
    if (!q) return 1;
    text = text.toLowerCase();
    if (text.indexOf(q) !== -1) return 2;
    let ti = 0;
    for (let i = 0; i < q.length; i++) {
      if (q[i] === " ") continue;
      ti = text.indexOf(q[i], ti);
      if (ti === -1) return 0;
      ti++;
    }
    return 1;
  }

  function paintPalette(q) {
    const all = pageCommands.concat(globalCommands);
    const list = $("#cmdk-list");
    const hits = all.map(function (c) { return { c: c, s: fuzzy(q || "", c.title + " " + c.group) }; })
      .filter(function (h) { return h.s > 0; })
      .sort(function (a, b) { return b.s - a.s; });
    if (!hits.length) {
      list.innerHTML = '<li class="cmdk-empty">No matching commands.</li>';
      return;
    }
    let lastGroup = null;
    list.innerHTML = hits.map(function (h, i) {
      const c = h.c;
      const header = !q && c.group !== lastGroup ? '<li class="cmdk-group" role="presentation">' + esc(c.group) + "</li>" : "";
      lastGroup = c.group;
      return header + '<li role="option" id="cmdk-opt-' + i + '" data-cmd="' + esc(c.id) + '" aria-selected="' + (i === 0) + '" class="cmdk-item spotlight">' +
        '<i class="bi ' + (c.icon || "bi-lightning") + '" aria-hidden="true"></i><span class="flex-grow-1">' + esc(c.title) + "</span>" +
        (c.keys ? '<span class="cmdk-keys">' + c.keys.split(" ").map(function (k) { return "<kbd>" + esc(k) + "</kbd>"; }).join("") + "</span>" : "") + "</li>";
    }).join("");
    $$("#cmdk-list [role=option]").forEach(function (el) {
      el.addEventListener("click", function () {
        const cmd = all.find(function (c) { return c.id === el.dataset.cmd; });
        root.bootstrap.Modal.getOrCreateInstance($("#cmdk")).hide();
        if (cmd) setTimeout(cmd.run, 120);
      });
      el.addEventListener("mousemove", function () {
        selectOption($$("#cmdk-list [role=option]"), $$("#cmdk-list [role=option]").indexOf(el));
      });
    });
  }

  function openPalette() {
    const m = ensurePalette();
    $("#cmdk-input").value = "";
    paintPalette("");
    root.bootstrap.Modal.getOrCreateInstance(m).show();
  }

  let pageShortcuts = [];
  function registerShortcuts(list) { pageShortcuts = list || []; }

  function openShortcutHelp() {
    let m = $("#shortcut-help");
    const rows = [
      ["Ctrl / ⌘ K", "Command palette"],
      ["?", "This help"],
      ["g then c / h / s / t", "Go to Checkout / History / Settings / Tour"],
    ].concat(pageShortcuts.map(function (s) { return [s.keys, s.label]; }));
    if (!m) {
      m = document.createElement("div");
      m.className = "modal fade";
      m.id = "shortcut-help";
      m.tabIndex = -1;
      m.setAttribute("aria-labelledby", "shortcut-help-title");
      m.setAttribute("aria-hidden", "true");
      document.body.appendChild(m);
    }
    m.innerHTML =
      '<div class="modal-dialog modal-dialog-centered"><div class="modal-content">' +
      '<div class="modal-header"><h2 class="modal-title h5" id="shortcut-help-title"><i class="bi bi-keyboard" aria-hidden="true"></i> Keyboard shortcuts</h2>' +
      '<button type="button" class="btn-close" data-bs-dismiss="modal" aria-label="Close"></button></div>' +
      '<div class="modal-body"><table class="table table-sm align-middle mb-0"><tbody>' +
      rows.map(function (r) { return "<tr><td class=\"text-nowrap\"><kbd>" + esc(r[0]) + "</kbd></td><td>" + esc(r[1]) + "</td></tr>"; }).join("") +
      "</tbody></table></div></div></div>";
    root.bootstrap.Modal.getOrCreateInstance(m).show();
  }

  function isTyping(e) {
    const t = e.target;
    return t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
  }

  function anyModalOpen() { return !!$(".modal.show"); }

  let gPending = 0;
  function initKeyboard() {
    document.addEventListener("keydown", function (e) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        openPalette();
        return;
      }
      if (isTyping(e) || anyModalOpen() || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "?") { e.preventDefault(); openShortcutHelp(); return; }
      if (e.key === "g") { gPending = Date.now(); return; }
      if (gPending && Date.now() - gPending < 900) {
        const map = { c: "index.html", h: "history.html", s: "settings.html", t: "tour.html" };
        gPending = 0;
        if (map[e.key]) { location.href = map[e.key]; return; }
      }
      pageShortcuts.forEach(function (s) {
        if (s.match && s.match(e)) { e.preventDefault(); s.run(e); }
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Effects: spotlight glow (cursor-following light), magnetic, reveal, count-up
  // ---------------------------------------------------------------------------

  /**
   * Spotlight: any element with .spotlight gets --mx/--my CSS vars that track
   * the pointer, so a radial "light" follows the cursor inside it.
   * Delegated on document so dynamically rendered elements work too.
   */
  function initSpotlight() {
    if (reduceMotion) return;
    document.addEventListener("pointermove", function (e) {
      const el = e.target.closest && e.target.closest(".spotlight, .btn-glow, .provider-card label");
      if (!el) return;
      const r = el.getBoundingClientRect();
      el.style.setProperty("--mx", ((e.clientX - r.left) / r.width) * 100 + "%");
      el.style.setProperty("--my", ((e.clientY - r.top) / r.height) * 100 + "%");
    }, { passive: true });
  }

  /** Magnetic: element drifts toward the cursor when it is near. */
  function magnetic(el, strength) {
    if (!el || reduceMotion) return;
    const k = strength || 0.35;
    const zone = el.closest("[data-magnetic-zone]") || el.parentElement;
    zone.addEventListener("pointermove", function (e) {
      const r = el.getBoundingClientRect();
      const dx = e.clientX - (r.left + r.width / 2);
      const dy = e.clientY - (r.top + r.height / 2);
      el.style.transform = "translate(" + dx * k + "px," + dy * k + "px)";
    });
    zone.addEventListener("pointerleave", function () { el.style.transform = ""; });
  }

  /** Scroll reveal for [data-reveal] (adds .is-visible once). */
  function initReveal(ctx) {
    const els = $$("[data-reveal]:not(.is-visible)", ctx);
    if (reduceMotion || !("IntersectionObserver" in root)) {
      els.forEach(function (el) { el.classList.add("is-visible"); });
      return;
    }
    const io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add("is-visible");
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.12, rootMargin: "0px 0px -8% 0px" });
    els.forEach(function (el, i) {
      if (!el.style.getPropertyValue("--reveal-delay")) el.style.setProperty("--reveal-delay", (i % 6) * 70 + "ms");
      // Anything already on screen reveals on the next frame — never wait on the observer
      // for above-the-fold content (it must be usable immediately).
      const r = el.getBoundingClientRect();
      if (r.top < root.innerHeight && r.bottom > 0) {
        requestAnimationFrame(function () { el.classList.add("is-visible"); });
        return;
      }
      io.observe(el);
    });
    // Safety net: never leave content invisible if an observer callback is throttled.
    setTimeout(function () { els.forEach(function (el) { el.classList.add("is-visible"); }); }, 2500);
  }

  /** Animate a money value change inside `el` (rolling count-up). */
  const tweens = new WeakMap();
  function countTo(el, value, currency, opts) {
    if (!el) return;
    const o = opts || {};
    const fmt = function (v) { return currency ? C.formatMoney(v, currency, o) : String(Math.round(v)); };
    const from = tweens.has(el) ? tweens.get(el).current : (o.from !== undefined ? o.from : 0);
    if (reduceMotion || !isFinite(from) || from === value) {
      el.textContent = fmt(value);
      tweens.set(el, { current: value });
      return;
    }
    const state = { current: from, target: value, start: performance.now(), dur: o.duration || 520 };
    tweens.set(el, state);
    function step(now) {
      if (tweens.get(el) !== state) return;
      const p = Math.min(1, (now - state.start) / state.dur);
      const eased = 1 - Math.pow(1 - p, 4);
      state.current = from + (value - from) * eased;
      el.textContent = fmt(p === 1 ? value : state.current);
      if (p < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  }
  function resetCount(el) { tweens.delete(el); }

  // ---------------------------------------------------------------------------
  // Clipboard & confetti
  // ---------------------------------------------------------------------------

  function copyText(text, label) {
    function done() { toast((label || "Text") + " copied to clipboard.", "success"); }
    if (navigator.clipboard && root.isSecureContext) {
      navigator.clipboard.writeText(text).then(done, fallback);
    } else fallback();
    function fallback() {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.setAttribute("readonly", "");
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        document.execCommand("copy");
        ta.remove();
        done();
      } catch (e) {
        toast("Could not copy. Select the text and copy it manually.", "warning");
      }
    }
  }

  function txnSummaryText(t) {
    return [
      "PayBridge — SIMULATED transaction (no real payment)",
      "Reference: " + t.id,
      "Status: " + (t.status === "SUCCESS" ? "Simulated success" : "Simulated failure") + (t.failureReason ? " — " + t.failureReason : ""),
      "Provider: " + t.providerName + " (mock)",
      "Amount: " + C.formatMoney(t.sourceAmount, t.sourceCurrency),
      "Demo rate: 1 " + t.sourceCurrency + " = " + C.formatRate(t.exchangeRate) + " " + t.targetCurrency,
      "Converted: " + C.formatMoney(t.convertedAmount, t.targetCurrency),
      "Mock fee (" + t.feePercent + "%): " + C.formatMoney(t.feeAmount, t.feeCurrency),
      "Estimated total: " + C.formatMoney(t.totalAmount, t.targetCurrency),
      "Created: " + new Date(t.createdAt).toISOString(),
    ].join("\n");
  }

  function confetti(originEl) {
    if (reduceMotion) return;
    const canvas = document.createElement("canvas");
    canvas.className = "confetti-canvas";
    canvas.setAttribute("aria-hidden", "true");
    document.body.appendChild(canvas);
    const dpr = root.devicePixelRatio || 1;
    canvas.width = innerWidth * dpr;
    canvas.height = innerHeight * dpr;
    const ctx = canvas.getContext("2d");
    ctx.scale(dpr, dpr);
    const r = originEl ? originEl.getBoundingClientRect() : { left: innerWidth / 2, top: innerHeight / 3, width: 0, height: 0 };
    const ox = r.left + r.width / 2;
    const oy = r.top + r.height / 2;
    const colors = ["#2563EB", "#60A5FA", "#15803D", "#22C55E", "#F59E0B", "#A855F7"];
    const parts = Array.from({ length: 110 }, function () {
      const a = Math.random() * Math.PI * 2;
      const v = 4 + Math.random() * 7;
      return { x: ox, y: oy, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 4, s: 4 + Math.random() * 5, r: Math.random() * 6, vr: (Math.random() - 0.5) * 0.3, c: colors[(Math.random() * colors.length) | 0], life: 0 };
    });
    let frame = 0;
    (function tick() {
      frame++;
      ctx.clearRect(0, 0, innerWidth, innerHeight);
      parts.forEach(function (p) {
        p.vy += 0.18; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - frame / 110);
        ctx.translate(p.x, p.y); ctx.rotate(p.r);
        ctx.fillStyle = p.c; ctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2);
        ctx.restore();
      });
      if (frame < 110) requestAnimationFrame(tick);
      else canvas.remove();
    })();
  }

  /** Inline banner for storage / config problems with a recovery action. */
  function showBanner(hostSel, message, actions) {
    const host = $(hostSel);
    if (!host) return;
    const id = "banner-" + Math.random().toString(36).slice(2, 7);
    host.insertAdjacentHTML("beforeend",
      '<div class="alert alert-warning d-flex flex-wrap align-items-center gap-2 app-alert" role="alert" id="' + id + '">' +
      '<i class="bi bi-exclamation-triangle-fill" aria-hidden="true"></i><span class="flex-grow-1">' + esc(message) + "</span>" +
      (actions || []).map(function (a, i) { return '<button type="button" class="btn btn-sm btn-outline-warning" data-i="' + i + '">' + esc(a.label) + "</button>"; }).join("") +
      "</div>");
    (actions || []).forEach(function (a, i) {
      $("#" + id + ' [data-i="' + i + '"]').addEventListener("click", function () { a.onClick(); $("#" + id).remove(); });
    });
  }

  // ---------------------------------------------------------------------------
  // Boot
  // ---------------------------------------------------------------------------

  function boot(active) {
    applyTheme(getSettings().data.theme);
    if (root.matchMedia) {
    }
    renderNavbar(active);
    renderFooter();
    initKeyboard();
    initSpotlight();
    initReveal();
    if (!S.isAvailable()) {
      showBanner("#page-alerts", "Browser storage is unavailable (private mode or blocked). The demo still works, but history will be lost when this tab closes.");
    }
  }

  root.MCPAUI = {
    DEFAULT_SETTINGS: DEFAULT_SETTINGS,
    reduceMotion: reduceMotion,
    $: $, $$: $$, esc: esc, fmtDate: fmtDate, relTime: relTime,
    getFxConfig: getFxConfig, getActiveFx: getActiveFx, getSettings: getSettings, saveSettings: saveSettings,
    boot: boot, toast: toast, statusBadge: statusBadge, providerChip: providerChip,
    registerCommands: registerCommands, registerShortcuts: registerShortcuts, openPalette: openPalette,
    isTyping: isTyping, anyModalOpen: anyModalOpen,
    magnetic: magnetic, initReveal: initReveal, countTo: countTo, resetCount: resetCount,
    copyText: copyText, txnSummaryText: txnSummaryText, confetti: confetti, showBanner: showBanner,
    applyTheme: applyTheme,
    setRateSource: setRateSource,
    logoSvg: logoSvg,
  };
})(window);
