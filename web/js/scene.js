/**
 * scene.js — illustrated "Dusk" landscapes, drawn as layered inline SVG.
 *
 * Variants:  "summit" (glowing peak, sun, birds, lake)
 *            "falls"  (cliff waterfall, light rays, plants)
 *            "grove"  (rocks, flowers, fireflies, small cascade)
 * Every layer has a depth; the scene shifts in parallax with the pointer and
 * with scroll. Waterfalls fall, grass sways, birds fly, stars twinkle, rays
 * breathe. Purely decorative (aria-hidden); reduced-motion = a still image.
 *
 * Usage: <div data-scene="summit"></div>  (auto-mounted)  or  MCPAScene.mount(el, "falls")
 */
(function (root) {
  "use strict";

  const RM = root.matchMedia && root.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const W = 1440;
  const H = 800;
  let uid = 0;

  // Deterministic pseudo-random so every render of a variant looks identical.
  function rng(seed) {
    let s = seed >>> 0;
    return function () {
      s = (s * 1664525 + 1013904223) >>> 0;
      return s / 4294967296;
    };
  }

  /** Smooth path through points [[x,y],...], closed to the bottom of the frame. */
  function ridge(points, bottom) {
    let d = "M" + points[0][0] + " " + (bottom || H) + " L" + points[0][0] + " " + points[0][1];
    for (let i = 1; i < points.length; i++) {
      const p0 = points[i - 1];
      const p1 = points[i];
      const mx = (p0[0] + p1[0]) / 2;
      d += " Q" + p0[0] + " " + p0[1] + " " + mx + " " + (p0[1] + p1[1]) / 2;
    }
    const last = points[points.length - 1];
    d += " T" + last[0] + " " + last[1] + " L" + last[0] + " " + (bottom || H) + " Z";
    return d;
  }

  function defs(id) {
    return "<defs>" +
      '<linearGradient id="' + id + 'sky" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="#0F0B26"/><stop offset=".38" stop-color="#2A1D6B"/><stop offset=".62" stop-color="#6B4BA8"/>' +
      '<stop offset=".8" stop-color="#E07F9E"/><stop offset="1" stop-color="#FFB36B"/></linearGradient>' +
      '<radialGradient id="' + id + 'sun" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#FFF4DA"/><stop offset=".25" stop-color="#FFD29A" stop-opacity=".9"/>' +
      '<stop offset=".6" stop-color="#FF9E7A" stop-opacity=".35"/><stop offset="1" stop-color="#FF9E7A" stop-opacity="0"/></radialGradient>' +
      '<linearGradient id="' + id + 'peak" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFD9A8"/><stop offset=".35" stop-color="#F29BB0"/>' +
      '<stop offset=".7" stop-color="#9A7BE0"/><stop offset="1" stop-color="#5A47B8"/></linearGradient>' +
      '<linearGradient id="' + id + 'shade" x1="1" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4B3AA6"/><stop offset="1" stop-color="#2A1F6B"/></linearGradient>' +
      '<linearGradient id="' + id + 'mid" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#4C3CA8"/><stop offset="1" stop-color="#21185A"/></linearGradient>' +
      '<linearGradient id="' + id + 'near" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#20175A"/><stop offset="1" stop-color="#0D0924"/></linearGradient>' +
      '<linearGradient id="' + id + 'lake" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFB59A" stop-opacity=".75"/><stop offset=".5" stop-color="#8B7CF6" stop-opacity=".6"/><stop offset="1" stop-color="#21185A"/></linearGradient>' +
      '<linearGradient id="' + id + 'fall" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#C7D2FE" stop-opacity=".55"/><stop offset=".5" stop-color="#FFFFFF" stop-opacity=".95"/><stop offset="1" stop-color="#A5B4FC" stop-opacity=".6"/></linearGradient>' +
      '<linearGradient id="' + id + 'ray" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FFE8C2" stop-opacity=".55"/><stop offset="1" stop-color="#FFE8C2" stop-opacity="0"/></linearGradient>' +
      '<linearGradient id="' + id + 'rock" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#C9B2F5"/><stop offset=".45" stop-color="#7E68D6"/><stop offset="1" stop-color="#2E2378"/></linearGradient>' +
      '<radialGradient id="' + id + 'fly"><stop offset="0" stop-color="#FFF3C4"/><stop offset=".4" stop-color="#FFC56B" stop-opacity=".8"/><stop offset="1" stop-color="#FFC56B" stop-opacity="0"/></radialGradient>' +
      '<filter id="' + id + 'blur" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="6"/></filter>' +
      "</defs>";
  }

  function stars(r, n) {
    let s = "";
    for (let i = 0; i < n; i++) {
      const x = (r() * W).toFixed(0);
      const y = (r() * H * 0.42).toFixed(0);
      const rad = (0.6 + r() * 1.5).toFixed(2);
      s += '<circle class="sc-star" cx="' + x + '" cy="' + y + '" r="' + rad + '" fill="#fff" style="--tw:' + (2 + r() * 4).toFixed(1) + "s;--td:" + (r() * 4).toFixed(1) + 's"/>';
    }
    return s;
  }

  function clouds(r, list) {
    return list.map(function (c) {
      const x = c[0], y = c[1], k = c[2];
      return '<g class="sc-cloud" style="--cd:' + (40 + r() * 30).toFixed(0) + 's" opacity=".85">' +
        '<ellipse cx="' + x + '" cy="' + y + '" rx="' + 70 * k + '" ry="' + 18 * k + '" fill="#FFD7B5"/>' +
        '<ellipse cx="' + (x - 34 * k) + '" cy="' + (y - 10 * k) + '" rx="' + 34 * k + '" ry="' + 22 * k + '" fill="#FFE3C9"/>' +
        '<ellipse cx="' + (x + 22 * k) + '" cy="' + (y - 16 * k) + '" rx="' + 40 * k + '" ry="' + 28 * k + '" fill="#FFF0E0"/></g>';
    }).join("");
  }

  function birds(r, n, y0) {
    let s = '<g class="sc-birds">';
    for (let i = 0; i < n; i++) {
      const x = r() * 520;
      const y = y0 + r() * 120;
      const k = 0.6 + r() * 0.8;
      s += '<g transform="translate(' + x.toFixed(0) + " " + y.toFixed(0) + ") scale(" + k.toFixed(2) + ')"><path class="sc-wing" style="--fd:' + (0.5 + r() * 0.5).toFixed(2) + 's" d="M0 0 Q7 -7 14 0 Q21 -7 28 0" fill="none" stroke="#FFF7EE" stroke-width="2.4" stroke-linecap="round"/></g>';
    }
    return s + "</g>";
  }

  function grass(r, x0, x1, base, hMin, hMax, color, count) {
    let s = "";
    for (let i = 0; i < count; i++) {
      const x = x0 + r() * (x1 - x0);
      const h = hMin + r() * (hMax - hMin);
      const lean = (r() - 0.5) * h * 0.5;
      s += '<path d="M' + (x - 4).toFixed(1) + " " + base + " Q" + (x + lean / 2).toFixed(1) + " " + (base - h * 0.6).toFixed(1) + " " + (x + lean).toFixed(1) + " " + (base - h).toFixed(1) +
        " Q" + (x + lean / 2 + 3).toFixed(1) + " " + (base - h * 0.5).toFixed(1) + " " + (x + 5).toFixed(1) + " " + base + 'Z" fill="' + color + '"/>';
    }
    return '<g class="sc-sway" style="--sd:' + (4 + r() * 3).toFixed(1) + 's">' + s + "</g>";
  }

  function plant(r, x, base, scale, hue) {
    const k = scale;
    let s = '<g transform="translate(' + x + " " + base + ") scale(" + k + ')"><g class="sc-sway" style="--sd:' + (5 + r() * 3).toFixed(1) + 's">';
    const leaves = 7;
    for (let i = 0; i < leaves; i++) {
      const a = -80 + (i / (leaves - 1)) * 160 + (r() - 0.5) * 14;
      const len = 60 + r() * 50;
      s += '<path transform="rotate(' + a.toFixed(1) + ')" d="M0 0 Q' + (len * 0.18).toFixed(1) + " " + (-len * 0.5).toFixed(1) + " 0 " + (-len).toFixed(1) +
        " Q" + (-len * 0.18).toFixed(1) + " " + (-len * 0.5).toFixed(1) + ' 0 0Z" fill="' + (i % 2 ? hue[0] : hue[1]) + '"/>';
    }
    // flowers
    for (let j = 0; j < 3; j++) {
      const fx = (r() - 0.5) * 70;
      const fy = -70 - r() * 50;
      s += '<g transform="translate(' + fx.toFixed(1) + " " + fy.toFixed(1) + ')">' +
        [0, 72, 144, 216, 288].map(function (d) { return '<ellipse transform="rotate(' + d + ')" cx="0" cy="-6" rx="3.2" ry="7" fill="#FFB36B"/>'; }).join("") +
        '<circle r="3" fill="#FFE8C2"/></g>';
    }
    return s + "</g></g>";
  }

  function rock(id, x, y, w, h) {
    return '<path d="M' + x + " " + (y + h) + " Q" + (x - w * 0.05) + " " + (y + h * 0.35) + " " + (x + w * 0.25) + " " + (y + h * 0.1) +
      " Q" + (x + w * 0.55) + " " + (y - h * 0.08) + " " + (x + w * 0.85) + " " + (y + h * 0.2) +
      " Q" + (x + w * 1.05) + " " + (y + h * 0.5) + " " + (x + w) + " " + (y + h) + 'Z" fill="url(#' + id + 'rock)"/>';
  }

  function waterfall(id, x, top, bottom, w) {
    let s = '<g class="sc-falls">';
    s += '<rect x="' + x + '" y="' + top + '" width="' + w + '" height="' + (bottom - top) + '" fill="url(#' + id + 'fall)" opacity=".85"/>';
    for (let i = 0; i < 9; i++) {
      const sx = x + 4 + (i / 8) * (w - 8);
      s += '<line class="sc-stream" style="--fd:' + (0.9 + (i % 3) * 0.25) + "s;--fo:" + (i * 37) % 120 + 'px" x1="' + sx.toFixed(1) + '" y1="' + top + '" x2="' + sx.toFixed(1) + '" y2="' + bottom +
        '" stroke="#FFFFFF" stroke-opacity="' + (0.35 + (i % 3) * 0.2) + '" stroke-width="' + (2 + (i % 2) * 2) + '" stroke-dasharray="40 26" stroke-linecap="round"/>';
    }
    s += '<ellipse class="sc-mist" cx="' + (x + w / 2) + '" cy="' + bottom + '" rx="' + w * 1.1 + '" ry="26" fill="#E0E7FF" opacity=".45" filter="url(#' + id + 'blur)"/>';
    return s + "</g>";
  }

  function rays(id, list) {
    return '<g class="sc-rays">' + list.map(function (p, i) {
      return '<polygon style="--rd:' + (5 + i * 1.3).toFixed(1) + 's" points="' + p + '" fill="url(#' + id + 'ray)"/>';
    }).join("") + "</g>";
  }

  function fireflies(r, n, x0, x1, y0, y1) {
    let s = "";
    for (let i = 0; i < n; i++) {
      s += '<circle class="sc-firefly" style="--ff:' + (4 + r() * 5).toFixed(1) + "s;--fdl:" + (r() * 5).toFixed(1) + 's" cx="' + (x0 + r() * (x1 - x0)).toFixed(0) + '" cy="' + (y0 + r() * (y1 - y0)).toFixed(0) + '" r="' + (5 + r() * 6).toFixed(1) + '" fill="url(#__ID__fly)"/>';
    }
    return s;
  }

  function lake(id, y, h) {
    let s = '<rect x="0" y="' + y + '" width="' + W + '" height="' + h + '" fill="url(#' + id + 'lake)"/>';
    for (let i = 0; i < 14; i++) {
      const lx = 120 + ((i * 97) % 1200);
      const ly = y + 8 + ((i * 13) % (h - 14));
      s += '<line class="sc-shimmer" style="--sh:' + (2 + (i % 4)) + 's" x1="' + lx + '" y1="' + ly + '" x2="' + (lx + 40 + (i % 3) * 30) + '" y2="' + ly + '" stroke="#FFE8C2" stroke-opacity=".6" stroke-width="2" stroke-linecap="round"/>';
    }
    return s;
  }

  function layer(depth, inner) {
    return '<g class="sc-layer" data-depth="' + depth + '">' + inner + "</g>";
  }

  // ---------------------------------------------------------------- variants ----
  function build(variant) {
    const id = "sc" + ++uid + "-";
    const r = rng(variant === "falls" ? 7 : variant === "grove" ? 19 : 3);
    const parts = [];
    parts.push(layer(0.02, '<rect width="' + W + '" height="' + H + '" fill="url(#' + id + 'sky)"/>' + stars(r, 70)));

    if (variant === "summit") {
      parts.push(layer(0.05, '<circle cx="980" cy="330" r="260" fill="url(#' + id + 'sun)"/>' + clouds(r, [[1180, 210, 1.1], [520, 160, 0.8], [1320, 330, 0.7]])));
      parts.push(layer(0.08, birds(r, 9, 140)));
      parts.push(layer(0.12,
        '<path d="M300 800 L760 250 Q800 210 840 240 L1000 360 L1080 330 L1500 800Z" fill="url(#' + id + 'peak)"/>' +
        '<path d="M760 250 Q800 210 840 240 L1000 360 L930 352 L860 300 L820 330 L790 290Z" fill="#FFF1E2" opacity=".85"/>' +
        '<path d="M840 240 L1000 360 L1080 330 L1500 800 L960 800 Z" fill="url(#' + id + 'shade)" opacity=".55"/>'));
      parts.push(layer(0.2, '<path d="' + ridge([[-40, 600], [180, 520], [380, 590], [560, 540], [760, 610], [980, 560], [1200, 620], [1480, 560]]) + '" fill="url(#' + id + 'mid)"/>'));
      parts.push(layer(0.28, lake(id, 640, 70)));
      parts.push(layer(0.45, '<path d="' + ridge([[-40, 720], [200, 690], [420, 730], [700, 700], [1000, 735], [1240, 700], [1480, 725]]) + '" fill="url(#' + id + 'near)"/>' +
        grass(r, 0, 1440, 800, 50, 150, "#120C33", 90) + grass(r, 900, 1440, 800, 90, 220, "#1B1450", 40)));
    } else if (variant === "falls") {
      parts.push(layer(0.05, '<circle cx="1150" cy="240" r="230" fill="url(#' + id + 'sun)" opacity=".8"/>' + clouds(r, [[1250, 160, 0.8]])));
      parts.push(layer(0.08, birds(r, 5, 110)));
      parts.push(layer(0.14, '<path d="M-20 800 L-20 60 Q140 40 300 120 Q380 170 420 260 L430 800Z" fill="url(#' + id + 'shade)"/>' +
        '<path d="M-20 60 Q140 40 300 120 Q340 140 360 170 Q250 120 120 110 Q40 105 -20 130Z" fill="#9A7BE0" opacity=".7"/>' +
        waterfall(id, 300, 150, 700, 120)));
      parts.push(layer(0.16, rays(id, ["420,0 560,0 1000,800 760,800", "620,0 700,0 1180,800 1040,800", "240,0 330,0 760,800 600,800"])));
      parts.push(layer(0.22, '<path d="' + ridge([[380, 640], [620, 600], [860, 650], [1100, 590], [1480, 640]]) + '" fill="url(#' + id + 'mid)"/>' + lake(id, 690, 40)));
      parts.push(layer(0.42, rock(id, 820, 600, 260, 140) + rock(id, 1080, 560, 300, 200) + rock(id, 160, 650, 220, 120) +
        plant(r, 980, 760, 1.1, ["#5B4BC4", "#8B7CF6"]) + plant(r, 1300, 780, 1.3, ["#4A3AA8", "#7C6AE8"])));
      parts.push(layer(0.55, '<path d="' + ridge([[-40, 760], [300, 735], [700, 770], [1100, 740], [1480, 770]]) + '" fill="url(#' + id + 'near)"/>' +
        grass(r, 0, 1440, 800, 40, 140, "#120C33", 80) + plant(r, 120, 800, 1.5, ["#2E2378", "#4A3AA8"])));
      parts.push(layer(0.6, fireflies(r, 10, 500, 1400, 420, 760).replace(/__ID__/g, id)));
    } else {
      // grove
      parts.push(layer(0.05, '<circle cx="320" cy="300" r="220" fill="url(#' + id + 'sun)" opacity=".75"/>'));
      parts.push(layer(0.1, '<path d="M1120 800 L1120 40 Q1300 20 1480 80 L1480 800Z" fill="url(#' + id + 'shade)"/>' + waterfall(id, 1180, 120, 640, 90)));
      parts.push(layer(0.14, rays(id, ["900,0 1000,0 760,800 560,800", "1060,0 1120,0 980,800 860,800"])));
      parts.push(layer(0.22, '<path d="' + ridge([[-40, 560], [240, 500], [520, 570], [800, 520], [1080, 580], [1480, 540]]) + '" fill="url(#' + id + 'mid)"/>'));
      parts.push(layer(0.36, rock(id, 520, 520, 320, 220) + rock(id, 860, 560, 260, 180) + rock(id, 260, 600, 240, 140) +
        plant(r, 460, 700, 1.2, ["#5B4BC4", "#8B7CF6"]) + plant(r, 820, 720, 1.0, ["#4A3AA8", "#9D8CFF"])));
      parts.push(layer(0.5, '<path d="' + ridge([[-40, 740], [260, 715], [620, 750], [1000, 720], [1480, 750]]) + '" fill="url(#' + id + 'near)"/>' +
        grass(r, 0, 1440, 800, 50, 160, "#120C33", 90) + plant(r, 1260, 800, 1.6, ["#2E2378", "#4A3AA8"]) + plant(r, 60, 800, 1.4, ["#2E2378", "#5B4BC4"])));
      parts.push(layer(0.62, fireflies(r, 16, 80, 1360, 360, 760).replace(/__ID__/g, id)));
    }

    return '<svg class="scene-svg" viewBox="0 0 ' + W + " " + H + '" preserveAspectRatio="xMidYMax slice" aria-hidden="true" focusable="false">' + defs(id) + parts.join("") + "</svg>";
  }

  // ---------------------------------------------------------------- parallax ----
  const live = [];
  let px = 0, py = 0, tx = 0, ty = 0, running = false;

  function mount(el, variant, opts) {
    const o = opts || {};
    el.classList.add("scene");
    el.insertAdjacentHTML("afterbegin", build(variant || el.dataset.scene || "summit"));
    const svg = el.querySelector(".scene-svg");
    const layers = Array.prototype.slice.call(svg.querySelectorAll(".sc-layer")).map(function (g) {
      return { g: g, d: Number(g.dataset.depth) || 0 };
    });
    const entry = { el: el, layers: layers, visible: true, scroll: o.scroll !== false && el.dataset.sceneScroll !== "false", strength: Number(el.dataset.sceneStrength) || 1 };
    if (RM || el.dataset.parallax === "false") return entry;
    live.push(entry);
    if ("IntersectionObserver" in root) {
      new IntersectionObserver(function (es) { es.forEach(function (e) { entry.visible = e.isIntersecting; }); }).observe(el);
    }
    start();
    return entry;
  }

  function start() {
    if (running) return;
    running = true;
    root.addEventListener("pointermove", function (e) {
      tx = (e.clientX / innerWidth - 0.5) * 2;
      ty = (e.clientY / innerHeight - 0.5) * 2;
    }, { passive: true });
    (function loop() {
      px += (tx - px) * 0.06;
      py += (ty - py) * 0.06;
      live.forEach(function (s) {
        if (!s.visible) return;
        const rect = s.el.getBoundingClientRect();
        // -1 (entering from below) … 0 (centred) … +1 (leaving above)
        const prog = s.scroll ? Math.max(-1.2, Math.min(1.2, (innerHeight / 2 - (rect.top + rect.height / 2)) / innerHeight)) : 0;
        s.layers.forEach(function (l) {
          const x = -px * l.d * 60 * s.strength;
          const y = -py * l.d * 26 * s.strength + prog * l.d * 220;
          l.g.setAttribute("transform", "translate(" + x.toFixed(2) + " " + y.toFixed(2) + ")");
        });
      });
      requestAnimationFrame(loop);
    })();
  }

  function autoMount() {
    Array.prototype.slice.call(document.querySelectorAll("[data-scene]")).forEach(function (el) {
      if (!el.querySelector(".scene-svg")) mount(el, el.dataset.scene);
    });
  }

  root.MCPAScene = { mount: mount, build: build, autoMount: autoMount };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", autoMount);
  else autoMount();
})(window);
