/**
 * format.js — mobile-only DISPLAY helpers. No business logic lives here:
 * every number shown comes from src/core (shared with web). These helpers only
 * decide how a value is printed.
 */

import Currency from "./core/currency";

/** Rate with fixed precision, e.g. 83 → "83.0000", 0.012048… → "0.012048". Delegates to the shared core. */
export function formatRateFixed(rate) {
  return Currency.formatRate(rate);
}

/** "1 USD = 83.0000 INR" */
export function directionText(rate, source, target) {
  return "1 " + source + " = " + formatRateFixed(rate) + " " + target;
}

/** "100.00 USD" — plain amount + ISO code (unambiguous for the source side). */
export function formatAmountCode(value, code) {
  if (typeof value !== "number" || !isFinite(value)) return "—";
  return value.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " " + code;
}

function pad(n, w) {
  return String(n).padStart(w || 2, "0");
}

/** Local time with milliseconds, e.g. "14:03:22.418". */
export function formatTime(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  return pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds()) + "." + pad(d.getMilliseconds(), 3);
}

/** Local date-time, e.g. "20 Nov 2026, 14:03:22". */
export function formatDateTime(iso) {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return "";
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return d.getDate() + " " + months[d.getMonth()] + " " + d.getFullYear() + ", " + pad(d.getHours()) + ":" + pad(d.getMinutes()) + ":" + pad(d.getSeconds());
}
