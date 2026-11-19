/**
 * motion.js — site-wide motion & micro-interaction layer (vanilla JS).
 *
 *  - Logo intro (once per browser session, skippable, ~1.2 s)
 *  - Scroll progress bar
 *  - Cursor glow that trails the pointer + drifting aurora background
 *  - Sliding active-link pill in the navbar
 *  - 3D tilt toward the cursor on cards
 *  - Click ripples on buttons
 *  - Magnetic pull on [data-magnetic] elements
 *  - Helpers for pages: MCPAMotion.pop(el), .bump(el), .slideIn(el, dir)
 *
 * Everything is decorative: pointer-events are off, and all motion is skipped
 * when the user prefers reduced motion.
 */
(function (root) {
  "use strict";

  const UI = root.MCPAUI;
  const RM = UI.reduceMotion;
  const finePointer = root.matchMedia && root.matchMedia("(pointer: fine)").matches;
  const $ = UI.$;
  const $$ = UI.$$;

  // ------------------------------------------------------------ intro ----
  function intro() {
    let seen = false;
    try { seen = sessionStorage.getItem("mcpa_intro_seen") === "1"; sessionStorage.setItem("mcpa_intro_seen", "1"); } catch (e) { seen = true; }
    if (seen || RM) return;
    const el = document.createElement("div");
    el.className = "intro";
    el.setAttribute("aria-hidden", "true");
    const word = "PayBridge".split("").map(function (ch, i) {
      return '<span style="--i:' + i + '"' + (i >= 3 ? ' class="b"' : "") + ">" + ch + "</span>";
    }).join("");
    el.innerHTML = '<div class="intro-inner">' + UI.logoSvg(92, { className: "intro-logo" }) + '<div class="intro-word">' + word + '</div><div class="intro-sub">Multi-currency checkout · simulated</div></div>';
    document.body.appendChild(el);
    document.documentElement.classList.add("intro-lock");
    let done = false;
    function out() {
      if (done) return;
      done = true;
      el.classList.add("intro-out");
      document.documentElement.classList.remove("intro-lock");
      setTimeout(function () { el.remove(); }, 700);
    }
    el.addEventListener("click", out);
    document.addEventListener("keydown", out, { once: true });
    setTimeout(out, 1350);
  }

  // --------------------------------------------------- scroll progress ----
  function scrollProgress() {
    const bar = document.createElement("div");
    bar.className = "scroll-progress";
    bar.setAttribute("aria-hidden", "true");
    document.body.appendChild(bar);
    let ticking = false;
    function paint() {
      const max = document.documentElement.scrollHeight - innerHeight;
      bar.style.transform = "scaleX(" + (max > 0 ? Math.min(1, scrollY / max) : 0) + ")";
      ticking = false;
    }
    addEventListener("scroll", function () { if (!ticking) { ticking = true; requestAnimationFrame(paint); } }, { passive: true });
    paint();
  }

  // -------------------------------------------- cursor glow + aurora ----
  function ambient() {
    const aurora = document.createElement("div");
    aurora.className = "aurora";
    aurora.setAttribute("aria-hidden", "true");
    aurora.innerHTML = "<span></span><span></span><span></span>";
    document.body.prepend(aurora);
    if (RM || !finePointer) return;
    const glow = document.createElement("div");
    glow.className = "cursor-glow";
    glow.setAttribute("aria-hidden", "true");
    document.body.prepend(glow);
    let x = innerWidth / 2, y = innerHeight / 3, tx = x, ty = y;
    addEventListener("pointermove", function (e) { tx = e.clientX; ty = e.clientY; glow.classList.add("on"); }, { passive: true });
    document.addEventListener("pointerleave", function () { glow.classList.remove("on"); });
    (function loop() {
      x += (tx - x) * 0.12; y += (ty - y) * 0.12;
      glow.style.transform = "translate(" + (x - 260) + "px," + (y - 260) + "px)";
      requestAnimationFrame(loop);
    })();
  }

  // ------------------------------------------------ navbar active pill ----
  function navPill() {
    const ul = $(".app-navbar .navbar-nav");
    if (!ul) return;
    const pill = document.createElement("span");
    pill.className = "nav-pill";
    pill.setAttribute("aria-hidden", "true");
    ul.appendChild(pill);
    const active = $(".nav-link.active", ul);
    function moveTo(a, instant) {
      if (!a || innerWidth < 992) { pill.style.opacity = "0"; return; }
      const r = a.getBoundingClientRect();
      const pr = ul.getBoundingClientRect();
      if (instant) pill.style.transition = "none";
      pill.style.opacity = "1";
      pill.style.width = r.width + "px";
      pill.style.transform = "translateX(" + (r.left - pr.left) + "px)";
      if (instant) { void pill.offsetWidth; pill.style.transition = ""; }
    }
    $$(".nav-link", ul).forEach(function (a) {
      a.addEventListener("pointerenter", function () { moveTo(a); });
      a.addEventListener("focus", function () { moveTo(a); });
    });
    ul.addEventListener("pointerleave", function () { moveTo(active); });
    addEventListener("resize", function () { moveTo(active, true); });
    // fonts may shift widths — settle once they load
    moveTo(active, true);
    if (document.fonts && document.fonts.ready) document.fonts.ready.then(function () { moveTo(active, true); });
  }

  // ------------------------------------------------------------- tilt ----
  const TILT_SEL = ".provider-card label, .kpi, .feature-card, .tilt-card, .flow-screen";
  function tilt() {
    if (RM || !finePointer) return;
    let current = null;
    document.addEventListener("pointermove", function (e) {
      const el = e.target.closest && e.target.closest(TILT_SEL);
      if (current && current !== el) reset(current);
      current = el;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const px = (e.clientX - r.left) / r.width - 0.5;
      const py = (e.clientY - r.top) / r.height - 0.5;
      const max = el.classList.contains("flow-screen") ? 8 : 5;
      el.style.transition = "transform .12s ease-out";
      el.style.transform = "perspective(900px) rotateX(" + (-py * max).toFixed(2) + "deg) rotateY(" + (px * max).toFixed(2) + "deg) translateY(-3px)";
    }, { passive: true });
    document.addEventListener("pointerleave", function () { if (current) reset(current); current = null; });
    function reset(el) {
      el.style.transition = "transform .55s cubic-bezier(.2,.8,.2,1)";
      el.style.transform = "";
    }
  }

  // ----------------------------------------------------------- ripple ----
  const RIPPLE_SEL = ".btn-glow, .btn-soft, .btn-icon, .car-btn, .swap-btn, .quick-amounts button, .segmented label, .ccy-option label, .page-link";
  function ripple() {
    if (RM) return;
    document.addEventListener("pointerdown", function (e) {
      const el = e.target.closest && e.target.closest(RIPPLE_SEL);
      if (!el || el.disabled) return;
      const r = el.getBoundingClientRect();
      const d = Math.max(r.width, r.height) * 2.2;
      const s = document.createElement("span");
      s.className = "ripple";
      s.style.width = s.style.height = d + "px";
      s.style.left = e.clientX - r.left - d / 2 + "px";
      s.style.top = e.clientY - r.top - d / 2 + "px";
      el.classList.add("has-ripple");
      el.appendChild(s);
      setTimeout(function () { s.remove(); }, 650);
    });
  }

  // --------------------------------------------------------- magnetic ----
  function magneticAll() {
    if (RM || !finePointer) return;
    $$("[data-magnetic]").forEach(function (el) {
      const k = Number(el.dataset.magnetic) || 0.22;
      const zone = el.parentElement;
      zone.addEventListener("pointermove", function (e) {
        const r = el.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2);
        const dy = e.clientY - (r.top + r.height / 2);
        if (Math.hypot(dx, dy) > 140) { el.style.translate = ""; return; }
        el.style.translate = dx * k + "px " + dy * k + "px";
      });
      zone.addEventListener("pointerleave", function () { el.style.translate = ""; });
    });
  }

  // --------------------------------------------------- helpers for pages ----
  function anim(el, frames, opts) {
    if (!el || RM || !el.animate) return null;
    return el.animate(frames, Object.assign({ duration: 420, easing: "cubic-bezier(.2,.8,.2,1)" }, opts || {}));
  }
  /** Springy pop (selection feedback). */
  function pop(el) {
    return anim(el, [{ transform: "scale(1)" }, { transform: "scale(.96)" }, { transform: "scale(1.025)" }, { transform: "scale(1)" }], { duration: 460 });
  }
  /** Value changed: quick highlight + lift. */
  function bump(el) {
    if (!el) return;
    el.classList.remove("bump"); void el.offsetWidth; el.classList.add("bump");
  }
  /** Slide in from a direction ("left" | "right" | "up" | "down"). */
  function slideIn(el, dir, dist) {
    const d = dist || 26;
    const map = { left: "translateX(-" + d + "px)", right: "translateX(" + d + "px)", up: "translateY(-" + d + "px)", down: "translateY(" + d + "px)" };
    return anim(el, [{ transform: map[dir] || map.down, opacity: 0.15 }, { transform: "none", opacity: 1 }], { duration: 480 });
  }
  /** Ring burst at an element (e.g. a check mark). */
  function burst(el) {
    if (!el || RM) return;
    const b = document.createElement("span");
    b.className = "burst";
    b.setAttribute("aria-hidden", "true");
    el.appendChild(b);
    setTimeout(function () { b.remove(); }, 650);
  }

  // ------------------------------------------------------------- boot ----
  // Page controllers (loaded after this file) render the navbar and content
  // synchronously, so start once the whole document has been parsed.
  function boot() {
    intro();
    scrollProgress();
    ambient();
    navPill();
    tilt();
    ripple();
    magneticAll();
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();

  root.MCPAMotion = { pop: pop, bump: bump, slideIn: slideIn, burst: burst, animate: anim, reduceMotion: RM };
})(window);
