/**
 * Multi-Currency Payment Gateway Aggregator — mobile companion (Expo Go).
 * EDUCATIONAL SIMULATION: nothing contacts a real provider, no real money moves.
 *
 * Navigation is deliberately tiny: exactly two screens held in state
 * ("checkout" | "result"), plus the review bottom sheet, which is a modal that
 * belongs to the checkout screen. Android hardware back:
 *   - result screen → back to checkout (values kept)
 *   - review sheet  → handled by the sheet's Modal onRequestClose (closes it)
 *
 * Session history (`attempts`) is IN MEMORY ONLY and local to this app instance.
 */
import React, { useCallback, useEffect, useState } from "react";
import { BackHandler } from "react-native";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import Currency from "./src/core/currency";
import useReduceMotion from "./src/hooks/useReduceMotion";
import useLiveRates from "./src/hooks/useLiveRates";
import CheckoutScreen from "./src/screens/CheckoutScreen";
import PaymentResultScreen from "./src/screens/PaymentResultScreen";

const INITIAL_FORM = {
  amount: "100",
  source: "USD",
  target: "INR",
  providerId: Currency.DEFAULT_PROVIDERS[0].id,
  mode: "rule_based",
};

export default function App() {
  const rates = useLiveRates(); // live reference rates (with demo fallback) or the demo table
  const providers = Currency.DEFAULT_PROVIDERS;
  const reduceMotion = useReduceMotion();

  const [screen, setScreen] = useState("checkout"); // "checkout" | "result"
  const [form, setForm] = useState(INITIAL_FORM);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [attempts, setAttempts] = useState([]); // in-memory session history
  const [lastTx, setLastTx] = useState(null);

  const updateForm = useCallback((patch) => setForm((f) => ({ ...f, ...patch })), []);

  const handleComplete = useCallback((tx) => {
    setAttempts((list) => list.concat(tx));
    setLastTx(tx);
    setSheetOpen(false);
    setScreen("result");
  }, []);

  const backToCheckout = useCallback(() => {
    setSheetOpen(false);
    setScreen("checkout");
  }, []);

  const retry = useCallback(() => {
    setScreen("checkout");
    setSheetOpen(true); // same values, straight back into review
  }, []);

  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (screen === "result") {
        backToCheckout();
        return true;
      }
      return false; // checkout: default behaviour (sheet back is handled by its Modal)
    });
    return () => sub.remove();
  }, [screen, backToCheckout]);

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      {screen === "result" && lastTx ? (
        <PaymentResultScreen tx={lastTx} onBack={backToCheckout} onRetry={retry} reduceMotion={reduceMotion} />
      ) : (
        <CheckoutScreen
          form={form}
          onChange={updateForm}
          table={rates.table}
          rates={rates}
          providers={providers}
          attempts={attempts}
          sheetOpen={sheetOpen}
          onOpenSheet={() => setSheetOpen(true)}
          onCloseSheet={() => setSheetOpen(false)}
          onComplete={handleComplete}
          reduceMotion={reduceMotion}
        />
      )}
    </SafeAreaProvider>
  );
}
