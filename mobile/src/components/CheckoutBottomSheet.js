import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Animated,
  Easing,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Currency from "../core/currency";
import Simulator from "../core/payment-simulator";
import { directionText, formatAmountCode } from "../format";
import { colors, radius, spacing, tabular, type, shadow, NATIVE_DRIVER } from "../theme";
import AmountField from "./AmountField";
import CurrencyPicker from "./CurrencyPicker";
import PrimaryButton from "./PrimaryButton";
import { MOCK_PROVIDER_NOTE } from "./ProviderSelector";
import StatusTimeline from "./StatusTimeline";

const SIM_LATENCY_MS = 450;
const DISMISS_DRAG = 110;
const DISMISS_VELOCITY = 0.9;

/**
 * CheckoutBottomSheet — a modal sheet attached to the checkout screen (not a
 * separate screen). Built only with RN Modal + Animated + PanResponder so it
 * runs in Expo Go with no extra native modules.
 *
 * Close paths (none of them submit): drag handle down, "Back to Checkout"
 * button, tap on the dimmed backdrop, Android hardware back.
 * Close is ignored while a simulation is running.
 */
export default function CheckoutBottomSheet({
  visible,
  onRequestClose,
  form,
  onChange,
  table,
  fxConfig,
  provider,
  existingRefs,
  onComplete,
  reduceMotion,
}) {
  const { height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [mounted, setMounted] = useState(visible);
  const [phase, setPhase] = useState("review"); // "review" | "processing"
  const [entries, setEntries] = useState([]);
  const [runError, setRunError] = useState(null);

  const translateY = useRef(new Animated.Value(height)).current;
  const backdrop = useRef(new Animated.Value(0)).current;
  const submittingRef = useRef(false);
  const aliveRef = useRef(true);

  const q = useMemo(
    () => Currency.quote({ amount: form.amount, source: form.source, target: form.target, provider, table }),
    [form.amount, form.source, form.target, provider, table]
  );
  const ex = q.ok ? Currency.explain(q) : null;
  const mode = Simulator.OUTCOME_MODES[form.mode] || Simulator.OUTCOME_MODES.rule_based;

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
    };
  }, []);

  // Open / close animation driven by the `visible` prop.
  useEffect(() => {
    if (visible) {
      setMounted(true);
      setPhase("review");
      setEntries([]);
      setRunError(null);
      submittingRef.current = false;
      if (reduceMotion) {
        translateY.setValue(0);
        backdrop.setValue(1);
        return;
      }
      translateY.setValue(height);
      backdrop.setValue(0);
      Animated.parallel([
        Animated.timing(backdrop, { toValue: 1, duration: 220, useNativeDriver: NATIVE_DRIVER }),
        Animated.spring(translateY, { toValue: 0, damping: 26, stiffness: 260, mass: 0.9, useNativeDriver: NATIVE_DRIVER }),
      ]).start();
    } else if (mounted) {
      Keyboard.dismiss();
      if (reduceMotion) {
        setMounted(false);
        return;
      }
      Animated.parallel([
        Animated.timing(backdrop, { toValue: 0, duration: 200, useNativeDriver: NATIVE_DRIVER }),
        Animated.timing(translateY, { toValue: height, duration: 230, easing: Easing.in(Easing.cubic), useNativeDriver: NATIVE_DRIVER }),
      ]).start(() => aliveRef.current && setMounted(false));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const requestClose = () => {
    if (submittingRef.current) return; // never close (or submit) mid-simulation
    onRequestClose();
  };
  const requestCloseRef = useRef(requestClose);
  requestCloseRef.current = requestClose;

  const springBack = () =>
    Animated.spring(translateY, { toValue: 0, damping: 24, stiffness: 300, useNativeDriver: NATIVE_DRIVER }).start();

  const pan = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onMoveShouldSetPanResponder: (_e, g) => !submittingRef.current && g.dy > 4 && Math.abs(g.dy) > Math.abs(g.dx),
      onPanResponderMove: (_e, g) => translateY.setValue(Math.max(0, g.dy)),
      onPanResponderRelease: (_e, g) => {
        if (g.dy > DISMISS_DRAG || g.vy > DISMISS_VELOCITY) {
          if (submittingRef.current) springBack();
          else requestCloseRef.current();
        } else springBack();
      },
      onPanResponderTerminate: springBack,
    })
  ).current;

  const confirm = async () => {
    if (submittingRef.current || !q.ok) return; // double-submit guard
    submittingRef.current = true;
    Keyboard.dismiss();
    setRunError(null);
    setEntries([]);
    setPhase("processing");
    // Freeze the rate source used for this attempt (live rates may refresh meanwhile).
    const snapshot = { quote: q, provider, mode: form.mode, table, fxConfig: fxConfig || Currency.DEFAULT_FX_CONFIG };

    try {
      const result = await Simulator.run(
        {
          mode: snapshot.mode,
          sourceAmount: snapshot.quote.sourceAmount,
          sourceCurrency: snapshot.quote.sourceCurrency,
          table: snapshot.table,
          provider: snapshot.provider,
        },
        {
          latencyMs: reduceMotion ? 150 : SIM_LATENCY_MS,
          onStep: (state) => {
            if (!aliveRef.current) return;
            setEntries((prev) => prev.concat({ state, label: Simulator.STATE_LABELS[state], at: new Date().toISOString() }));
          },
        }
      );
      if (!aliveRef.current) return;
      setEntries(result.timeline);

      const tx = Simulator.buildTransaction({
        id: Simulator.generateReference(snapshot.provider.tag, existingRefs),
        quote: snapshot.quote,
        provider: snapshot.provider,
        outcome: result.outcome,
        mode: snapshot.mode,
        timeline: result.timeline,
        fxConfig: snapshot.fxConfig,
        createdAt: result.timeline[0].at,
      });

      // Let the final step register visually before navigating.
      await new Promise((r) => setTimeout(r, reduceMotion ? 200 : 650));
      if (!aliveRef.current) return;
      onComplete(tx);
    } catch (err) {
      if (!aliveRef.current) return;
      submittingRef.current = false;
      setPhase("review");
      setRunError("The simulation could not be completed. Nothing was processed — please try again.");
    }
  };

  if (!mounted) return null;

  const processing = phase === "processing";
  const sheetMaxHeight = height - insets.top - 12;

  return (
    <Modal
      visible={mounted}
      transparent
      animationType="none"
      onRequestClose={requestClose}
      statusBarTranslucent
      navigationBarTranslucent
      supportedOrientations={["portrait"]}
    >
      <View style={styles.root}>
        <Animated.View style={[StyleSheet.absoluteFill, styles.backdrop, { opacity: backdrop }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={requestClose} accessible={false} importantForAccessibility="no" />
        </Animated.View>

        <KeyboardAvoidingView behavior="padding" style={styles.kav} pointerEvents="box-none">
          <Animated.View
            style={[styles.sheet, { maxHeight: sheetMaxHeight, transform: [{ translateY }] }]}
            accessibilityViewIsModal
            aria-modal
          >
            {/* Drag area: handle + header */}
            <View {...pan.panHandlers} style={styles.dragArea}>
              <View style={styles.handleHit} accessible={false}>
                <View style={styles.handle} />
              </View>
              <View style={styles.headerRow}>
                <View style={styles.headerText}>
                  <Text style={styles.title} accessibilityRole="header">
                    {processing ? "Running simulation…" : "Review payment"}
                  </Text>
                  <Text style={styles.subtitle}>{processing ? "Mock state machine — nothing leaves this device." : "Simulation only — check the details below."}</Text>
                </View>
                <Pressable
                  onPress={requestClose}
                  disabled={processing}
                  accessibilityRole="button"
                  accessibilityLabel="Back to Checkout"
                  accessibilityHint="Closes this review sheet without starting a simulation."
                  accessibilityState={{ disabled: processing }}
                  hitSlop={8}
                  style={({ pressed }) => [styles.closeBtn, pressed && styles.closeBtnPressed, processing && styles.closeBtnDisabled]}
                >
                  <Text style={styles.closeBtnText}>Back to Checkout</Text>
                </Pressable>
              </View>
            </View>

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              keyboardShouldPersistTaps="handled"
              keyboardDismissMode="interactive"
              showsVerticalScrollIndicator={false}
              automaticallyAdjustKeyboardInsets={false}
            >
              {processing ? (
                <ProcessingView entries={entries} quote={q} provider={provider} reduceMotion={reduceMotion} />
              ) : (
                <>
                  <AmountField
                    label="Amount"
                    size="small"
                    value={form.amount}
                    onChangeText={(amount) => onChange({ amount })}
                    currency={form.source}
                    nativeID="sheet-amount-label"
                  />

                  <View style={styles.gap} />
                  <CurrencyPicker
                    label="Target currency"
                    value={form.target}
                    onChange={(target) => onChange({ target })}
                    hint="Updates the exchange rate and converted amount immediately."
                  />

                  <View style={styles.summary} accessibilityLabel="Payment summary">
                    <Row label="You send" value={q.ok ? formatAmountCode(q.sourceAmount, form.source) : "—"} />
                    <Row
                      label={(fxConfig || Currency.DEFAULT_FX_CONFIG).label}
                      value={q.ok ? directionText(q.exchangeRate, form.source, form.target) : "—"}
                    />
                    <Row label="Converted amount" value={q.ok ? Currency.formatMoney(q.convertedDisplay, form.target) : "—"} />
                    <Row
                      label={"Provider fee (" + provider.feePercent + "%)"}
                      value={q.ok ? Currency.formatMoney(q.feeDisplay, form.target) : "—"}
                      caption={ex ? ex.fee : null}
                    />
                    <View style={styles.summaryDivider} />
                    <Row
                      label={"Total in " + form.target}
                      value={q.ok ? Currency.formatMoney(q.totalDisplay, form.target) : "—"}
                      caption={ex ? ex.total : null}
                      strong
                    />
                    <Text style={styles.summaryNote}>Fees are calculated in the target currency ({form.target}).</Text>
                  </View>

                  <View style={styles.infoBlock}>
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>Provider</Text>
                      <Text style={styles.infoValue}>
                        {provider.name} · {provider.tag}
                      </Text>
                    </View>
                    <View style={styles.infoRow}>
                      <Text style={styles.infoLabel}>Demo outcome</Text>
                      <Text style={styles.infoValue}>{mode.label}</Text>
                    </View>
                    <Text style={styles.mockNote}>{MOCK_PROVIDER_NOTE}</Text>
                    <Text style={styles.mockNote}>{(fxConfig || Currency.DEFAULT_FX_CONFIG).disclaimer}</Text>
                  </View>
                </>
              )}
            </ScrollView>

            <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
              {runError ? (
                <Text style={styles.runError} accessibilityRole="alert">
                  {runError}
                </Text>
              ) : null}
              {!processing && !q.ok ? (
                <Text style={styles.footerHint} accessibilityLiveRegion="polite">
                  Fix the amount above to continue.
                </Text>
              ) : null}
              <PrimaryButton
                title="Confirm Simulation"
                onPress={confirm}
                disabled={!q.ok}
                loading={processing}
                accessibilityHint="Runs a local payment simulation. No real payment will be processed."
                testID="confirm-simulation"
              />
            </View>
          </Animated.View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

function Row({ label, value, caption, strong }) {
  return (
    <View style={styles.row} accessible accessibilityLabel={label + ": " + value + (caption ? ". " + caption : "")}>
      <View style={styles.rowTop}>
        <Text style={[styles.rowLabel, strong && styles.rowLabelStrong]}>{label}</Text>
        <Text style={[styles.rowValue, strong && styles.rowValueStrong]}>
          {value}
        </Text>
      </View>
      {caption ? <Text style={styles.rowCaption}>{caption}</Text> : null}
    </View>
  );
}

function ProcessingView({ entries, quote, provider, reduceMotion }) {
  return (
    <View accessibilityLiveRegion="polite">
      <View style={styles.processingCard}>
        <Text style={styles.processingAmount}>{quote.ok ? Currency.formatMoney(quote.totalDisplay, quote.targetCurrency) : ""}</Text>
        <Text style={styles.processingMeta}>
          via {provider.name} · simulated
        </Text>
      </View>
      <StatusTimeline entries={entries} running={entries.length > 0 && entries.length < 4} showPending reduceMotion={reduceMotion} />
      <Text style={styles.processingNote}>Each step is a local, simulated state change. No provider is contacted.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  backdrop: { backgroundColor: colors.backdrop },
  kav: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.sheet,
    borderWidth: 1,
    borderBottomWidth: 0,
    borderColor: colors.sheetBorder,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    width: "100%",
    maxWidth: 560,
    alignSelf: "center",
    ...shadow.raised,
  },
  dragArea: { paddingHorizontal: spacing.xl, paddingBottom: spacing.md },
  handleHit: { alignItems: "center", paddingTop: 10, paddingBottom: 12 },
  handle: { width: 40, height: 5, borderRadius: 3, backgroundColor: colors.handle },
  headerRow: { flexDirection: "row", alignItems: "center", gap: spacing.md },
  headerText: { flex: 1 },
  title: { ...type.title, fontSize: 20 },
  subtitle: { ...type.caption, marginTop: 2 },
  closeBtn: {
    minHeight: 44,
    paddingHorizontal: 12,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.outline,
    backgroundColor: "transparent",
    alignItems: "center",
    justifyContent: "center",
  },
  closeBtnPressed: { backgroundColor: colors.outlinePressed },
  closeBtnDisabled: { opacity: 0.4 },
  closeBtnText: { fontSize: 13.5, fontWeight: "700", color: colors.text },
  scroll: { flexGrow: 0, flexShrink: 1 },
  scrollContent: { paddingHorizontal: spacing.xl, paddingBottom: spacing.lg, paddingTop: spacing.xs },
  gap: { height: spacing.lg },
  summary: {
    marginTop: spacing.xl,
    backgroundColor: colors.cardAlt,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
  },
  row: { paddingVertical: spacing.sm },
  rowTop: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: spacing.md },
  rowLabel: { ...type.body, color: colors.textSecondary, flexShrink: 1, maxWidth: "48%" },
  rowLabelStrong: { color: colors.text, fontWeight: "700" },
  rowValue: { ...type.bodyStrong, ...tabular, flexShrink: 1, textAlign: "right" },
  rowValueStrong: { fontSize: 20, lineHeight: 26, fontWeight: "800", letterSpacing: -0.3 },
  rowCaption: { ...type.caption, fontSize: 12, marginTop: 2, ...tabular },
  summaryDivider: { height: 1, backgroundColor: colors.border, marginVertical: spacing.xs },
  summaryNote: { ...type.caption, fontSize: 12, paddingBottom: spacing.sm },
  infoBlock: { marginTop: spacing.lg, gap: spacing.sm },
  infoRow: { flexDirection: "row", justifyContent: "space-between", gap: spacing.md },
  infoLabel: { ...type.body, color: colors.textSecondary },
  infoValue: { ...type.bodyStrong, flexShrink: 1, textAlign: "right" },
  mockNote: { ...type.caption },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    backgroundColor: colors.sheet,
  },
  footerHint: { ...type.caption, color: colors.error, textAlign: "center", marginBottom: spacing.sm },
  runError: { ...type.caption, color: colors.error, textAlign: "center", marginBottom: spacing.sm },
  processingCard: {
    alignItems: "center",
    paddingVertical: spacing.lg,
    marginBottom: spacing.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.primarySoft,
  },
  processingAmount: { ...type.display, fontSize: 30, color: colors.text },
  processingMeta: { ...type.caption, marginTop: 2 },
  processingNote: { ...type.caption, marginTop: spacing.sm },
});
