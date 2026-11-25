/**
 * storage.js — StorageService: safe, versioned localStorage access.
 *
 * - Every read/write is wrapped in try/catch.
 * - Malformed JSON is backed up under mcpa_corrupt_backup_v1 and reported, never thrown.
 * - When localStorage is unavailable (private mode, blocked), an in-memory
 *   fallback keeps the demo usable for the current tab and an error is surfaced.
 * - localStorage is NOT secure payment storage. Never store credentials here.
 */
(function (root) {
  "use strict";

  const KEYS = {
    TRANSACTIONS: "mcpa_transactions_v1",
    FX_RATES: "mcpa_fx_rates_v1",
    SETTINGS: "mcpa_settings_v1",
    CORRUPT_BACKUP: "mcpa_corrupt_backup_v1",
  };

  const memory = {};
  let available = null;

  function isAvailable() {
    if (available !== null) return available;
    try {
      const k = "__mcpa_probe__";
      window.localStorage.setItem(k, "1");
      window.localStorage.removeItem(k);
      available = true;
    } catch (e) {
      available = false;
    }
    return available;
  }

  function rawGet(key) {
    if (!isAvailable()) return Object.prototype.hasOwnProperty.call(memory, key) ? memory[key] : null;
    return window.localStorage.getItem(key);
  }

  function rawSet(key, value) {
    if (!isAvailable()) {
      memory[key] = value;
      return;
    }
    window.localStorage.setItem(key, value);
  }

  /**
   * Read JSON. Returns { data, error }. `validate(data)` may return false to
   * treat structurally wrong data as malformed.
   */
  function read(key, fallback, validate) {
    let raw;
    try {
      raw = rawGet(key);
    } catch (e) {
      return { data: clone(fallback), error: "Saved data could not be read in this browser." };
    }
    if (raw === null || raw === undefined) {
      return { data: clone(fallback), error: isAvailable() ? null : "Browser storage is unavailable. Data is only held in memory on this page and is lost if you leave or reload." };
    }
    try {
      const parsed = JSON.parse(raw);
      if (validate && !validate(parsed)) throw new Error("shape");
      return { data: parsed, error: null };
    } catch (e) {
      try { rawSet(KEYS.CORRUPT_BACKUP, JSON.stringify({ key: key, raw: raw, at: new Date().toISOString() })); } catch (_) {}
      return { data: clone(fallback), error: "Stored data for “" + key + "” was malformed. A backup was kept and safe defaults were loaded.", corrupt: true };
    }
  }

  /** Write JSON. Returns { ok, error }. */
  function write(key, value) {
    try {
      rawSet(key, JSON.stringify(value));
      notify(key);
      return { ok: true, error: null };
    } catch (e) {
      const quota = e && (e.name === "QuotaExceededError" || e.code === 22);
      return {
        ok: false,
        error: quota
          ? "Transaction history could not be saved in this browser (storage is full)."
          : "Transaction history could not be saved in this browser.",
      };
    }
  }

  function remove(key) {
    try {
      if (isAvailable()) window.localStorage.removeItem(key);
      else delete memory[key];
      notify(key);
      return { ok: true };
    } catch (e) {
      return { ok: false, error: "Could not clear saved data." };
    }
  }

  // -- Domain helpers ---------------------------------------------------------

  function isTxnArray(d) {
    return Array.isArray(d) && d.every(function (t) {
      return t && typeof t.id === "string" && typeof t.sourceAmount === "number" && (t.status === "SUCCESS" || t.status === "FAILED");
    });
  }

  function loadTransactions() {
    return read(KEYS.TRANSACTIONS, [], isTxnArray);
  }

  /** Prepend a record (save-before-display, PRD §10.6). */
  function addTransaction(txn) {
    const persistent = isAvailable();
    const current = loadTransactions();
    if (current.corrupt) return { ok: false, error: current.error };
    if (persistent && current.error) return { ok: false, error: current.error };
    const next = [txn].concat(current.data);
    const result = write(KEYS.TRANSACTIONS, next);
    if (!result.ok) return result;
    if (!persistent) {
      return {
        ok: true,
        warning: "Browser storage is unavailable. This attempt is only in memory on this page and will be lost if you leave or reload.",
      };
    }
    return result;
  }

  function saveTransactions(list) {
    return write(KEYS.TRANSACTIONS, list);
  }

  function loadFxConfig(defaults) {
    const r = read(KEYS.FX_RATES, defaults, function (d) { return d && d.rates && typeof d.rates === "object"; });
    return r;
  }

  function loadSettings(defaults) {
    const r = read(KEYS.SETTINGS, defaults, function (d) { return d && typeof d === "object" && !Array.isArray(d); });
    // Merge so new settings keys get defaults.
    r.data = Object.assign(clone(defaults), r.data || {});
    if (defaults.providers) r.data.providers = mergeProviders(defaults.providers, r.data.providers);
    return r;
  }

  function mergeProviders(defs, saved) {
    if (!Array.isArray(saved)) return clone(defs);
    return defs.map(function (d) {
      const s = saved.find(function (x) { return x && x.id === d.id; }) || {};
      return Object.assign({}, d, pick(s, ["feePercent", "feeFixed", "enabled"]));
    });
  }

  function pick(o, keys) {
    const out = {};
    keys.forEach(function (k) { if (o[k] !== undefined) out[k] = o[k]; });
    return out;
  }

  function usageBytes() {
    let total = 0;
    try {
      Object.keys(KEYS).forEach(function (k) {
        const v = rawGet(KEYS[k]);
        if (v) total += (KEYS[k].length + v.length) * 2;
      });
    } catch (e) {}
    return total;
  }

  // Same-tab subscribers (other tabs use the native "storage" event).
  const listeners = [];
  function subscribe(fn) {
    listeners.push(fn);
    window.addEventListener("storage", function (e) {
      if (e.key && e.key.indexOf("mcpa_") === 0) fn(e.key, "external");
    });
  }
  function notify(key) {
    listeners.forEach(function (fn) { try { fn(key, "local"); } catch (e) {} });
  }

  function clone(v) {
    return v === undefined ? v : JSON.parse(JSON.stringify(v));
  }

  root.MCPAStorage = {
    KEYS: KEYS,
    isAvailable: isAvailable,
    read: read,
    write: write,
    remove: remove,
    loadTransactions: loadTransactions,
    addTransaction: addTransaction,
    saveTransactions: saveTransactions,
    loadFxConfig: loadFxConfig,
    loadSettings: loadSettings,
    usageBytes: usageBytes,
    subscribe: subscribe,
  };
})(window);
