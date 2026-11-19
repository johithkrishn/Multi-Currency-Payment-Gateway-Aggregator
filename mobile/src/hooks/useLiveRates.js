import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AppState } from "react-native";
import Currency from "../core/currency";
import Live from "../core/live-rates";

/**
 * useLiveRates — which exchange rates the mobile checkout uses right now.
 *
 * "live" (default): real reference rates from the shared live-rates module
 *   (ECB via Frankfurter → ExchangeRate-API → currency-api), re-checked every
 *   5 minutes and whenever the app returns to the foreground. If every source
 *   fails it falls back to the last snapshot from this session, then to the
 *   demo table — and says so.
 * "demo": the illustrative PRD table (same as the web demo defaults).
 *
 * The snapshot is cached in memory for the app session (no extra storage
 * package needed in Expo Go).
 */
export default function useLiveRates() {
  const [source, setSource] = useState("live"); // what the user asked for
  const [snapshot, setSnapshot] = useState(() => Live.getCached());
  const [status, setStatus] = useState("idle"); // idle | loading | ok | error
  const [errors, setErrors] = useState([]);
  const alive = useRef(true);

  useEffect(() => () => { alive.current = false; }, []);

  const refresh = useCallback((force) => {
    if (!force && !Live.needsRefresh(Live.getCached())) return Promise.resolve();
    setStatus("loading");
    return Live.fetchLatest({ timeoutMs: 7000 })
      .then((res) => {
        if (!alive.current) return;
        setSnapshot(res.snapshot);
        setErrors(res.errors);
        setStatus("ok");
      })
      .catch((err) => {
        if (!alive.current) return;
        setErrors((err && err.details) || [String(err)]);
        setSnapshot(Live.getCached());
        setStatus("error");
      });
  }, []);

  // Initial fetch, periodic re-check, and re-check on returning to the app.
  useEffect(() => {
    if (source !== "live") return undefined;
    refresh(false);
    const timer = setInterval(() => refresh(false), Live.REFRESH_AFTER_MS);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh(false);
    });
    return () => {
      clearInterval(timer);
      sub.remove();
    };
  }, [source, refresh]);

  return useMemo(() => {
    const demoConfig = Currency.DEFAULT_FX_CONFIG;
    const demoTable = Currency.buildRateTable(demoConfig);
    const isLive = source === "live" && !!snapshot;
    const fxConfig = isLive ? Live.toFxConfig(snapshot) : demoConfig;
    return {
      source, // "live" | "demo" — the user's choice
      mode: isLive ? "live" : "demo", // what is actually in use
      fallback: source === "live" && !snapshot, // wanted live, using demo
      status,
      errors,
      snapshot,
      fxConfig,
      table: isLive ? Currency.buildRateTable(fxConfig) : demoTable,
      demoTable,
      setSource,
      refresh: () => refresh(true),
    };
  }, [source, snapshot, status, errors, refresh]);
}
