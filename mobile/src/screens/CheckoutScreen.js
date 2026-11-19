import React, { useMemo } from "react";
import { KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Currency from "../core/currency";
import AmountField from "../components/AmountField";
import BrandLogo from "../components/BrandLogo";
import CheckoutBottomSheet from "../components/CheckoutBottomSheet";
import CurrencyPicker from "../components/CurrencyPicker";
import FXPreview from "../components/FXPreview";
import OutcomeModeControl from "../components/OutcomeModeControl";
import PrimaryButton from "../components/PrimaryButton";
import ProviderSelector from "../components/ProviderSelector";
import SimulationBanner from "../components/SimulationBanner";
import StatusIcon from "../components/StatusIcon";
import { card, colors, radius, spacing, tabular, type, shadow } from "../theme";

/**
 * MobileCheckoutScreen — amount, currencies, FX preview, provider, demo outcome.
 * "Review Payment" opens the CheckoutBottomSheet (a modal on this screen).
 */
export default function CheckoutScreen({
  form,
  onChange,
  table,
  rates,
  providers,
  attempts,
  sheetOpen,
  onOpenSheet,
  onCloseSheet,
  onComplete,
  reduceMotion,
}) {
  const insets = useSafeAreaInsets();
  const provider = providers.find((p) => p.id === form.providerId) || providers[0];

  // One quote per provider (for the provider cards) — all from the shared core.
  const quotes = useMemo(() => {
    const out = {};
    providers.forEach((p) => {
      out[p.id] = Currency.quote({ amount: form.amount, source: form.source, target: form.target, provider: p, table });
    });
    return out;
  }, [providers, form.amount, form.source, form.target, table]);
  const q = quotes[provider.id];

  const existingRefs = useMemo(() => attempts.map((a) => a.id), [attempts]);
  const swap = () => onChange({ source: form.target, target: form.source });
  const count = attempts.length;

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.topBar}>
          <View style={styles.contentWidth}>
            <View style={styles.brandRow}>
              <View style={styles.logo} accessible={false}>
                <BrandLogo size={40} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.eyebrow}>Payment Gateway Aggregator</Text>
                <Text style={styles.screenTitle} accessibilityRole="header">
                  Checkout
                </Text>
              </View>
            </View>
            <SimulationBanner />
          </View>
        </View>

        <ScrollView
          style={styles.flex}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          <View style={styles.contentWidth}>
            {/* Amount + currencies */}
            <View style={styles.card}>
              <AmountField label="You send" value={form.amount} onChangeText={(amount) => onChange({ amount })} currency={form.source} nativeID="checkout-amount-label" />

              <View style={styles.sectionGap} />
              <CurrencyPicker label="From (source currency)" value={form.source} onChange={(source) => onChange({ source })} />

              <View style={styles.swapRow}>
                <View style={styles.swapLine} />
                <Pressable
                  onPress={swap}
                  accessibilityRole="button"
                  accessibilityLabel="Swap currencies"
                  accessibilityHint={"Makes " + form.target + " the source and " + form.source + " the target."}
                  hitSlop={6}
                  style={({ pressed }) => [styles.swapBtn, pressed && styles.swapBtnPressed]}
                >
                  <Text style={styles.swapGlyph} accessible={false}>
                    ↑↓
                  </Text>
                </Pressable>
                <View style={styles.swapLine} />
              </View>

              <CurrencyPicker label="To (target currency)" value={form.target} onChange={(target) => onChange({ target })} />
            </View>

            <View style={styles.blockGap} />
            <FXPreview quote={q} source={form.source} target={form.target} table={table} rates={rates} />

            <Text style={styles.sectionTitle} accessibilityRole="header">
              Mock provider
            </Text>
            <ProviderSelector
              providers={providers}
              selectedId={provider.id}
              onSelect={(providerId) => onChange({ providerId })}
              quotes={quotes}
              target={form.target}
            />

            <View style={styles.blockGap} />
            <View style={styles.card}>
              <OutcomeModeControl value={form.mode} onChange={(mode) => onChange({ mode })} />
            </View>

            <SessionActivity attempts={attempts} count={count} />
          </View>
        </ScrollView>

        {/* Sticky footer */}
        <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
          <View style={styles.contentWidth}>
            <View style={styles.footerSummary}>
              <Text style={styles.footerLabel}>Total in {form.target}</Text>
              <Text style={styles.footerTotal} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
                {q.ok ? Currency.formatMoney(q.totalDisplay, form.target) : "—"}
              </Text>
            </View>
            <PrimaryButton
              title="Review Payment"
              onPress={onOpenSheet}
              disabled={!q.ok}
              accessibilityHint="Opens the review sheet. You can confirm or go back to checkout from there."
              testID="review-payment"
            />
          </View>
        </View>
      </KeyboardAvoidingView>

      <CheckoutBottomSheet
        visible={sheetOpen}
        onRequestClose={onCloseSheet}
        form={form}
        onChange={onChange}
        table={table}
        fxConfig={rates.fxConfig}
        provider={provider}
        existingRefs={existingRefs}
        onComplete={onComplete}
        reduceMotion={reduceMotion}
      />
    </View>
  );
}

function SessionActivity({ attempts, count }) {
  const recent = attempts.slice(-3).reverse();
  return (
    <View style={styles.activity}>
      <Text style={styles.activityCount} accessibilityLiveRegion="polite">
        {count} simulated {count === 1 ? "attempt" : "attempts"} this session (local to this app)
      </Text>
      {recent.map((a) => {
        const ok = a.status === "SUCCESS";
        return (
          <View
            key={a.id}
            style={styles.activityRow}
            accessible
            accessibilityLabel={(ok ? "Simulated success" : "Simulated failure") + ", " + a.id + ", total " + Currency.formatMoney(a.totalAmount, a.targetCurrency)}
          >
            <View style={[styles.activityIcon, { backgroundColor: ok ? colors.success : colors.error }]}>
              <StatusIcon kind={ok ? "check" : "cross"} size={9} color={colors.onAccent} thickness={2} />
            </View>
            <Text style={styles.activityRef} numberOfLines={1}>
              {a.id}
            </Text>
            <Text style={styles.activityAmount}>{Currency.formatMoney(a.totalAmount, a.targetCurrency)}</Text>
          </View>
        );
      })}
      <Text style={styles.activityNote}>History is kept in memory only and is cleared when the app closes.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  contentWidth: { width: "100%", maxWidth: 560, alignSelf: "center" },
  topBar: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    paddingBottom: spacing.md,
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  brandRow: { flexDirection: "row", alignItems: "center", marginBottom: spacing.md },
  logo: {
    width: 40,
    height: 40,
    borderRadius: 12,
    overflow: "hidden",
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.md,
    ...shadow.logoGlow,
  },
  eyebrow: { ...type.overline, fontSize: 10.5 },
  screenTitle: { ...type.title, fontSize: 24, lineHeight: 30 },
  scrollContent: { paddingHorizontal: spacing.xl, paddingTop: spacing.xl, paddingBottom: spacing.xxxl },
  card: { ...card },
  sectionGap: { height: spacing.xl },
  blockGap: { height: spacing.lg },
  swapRow: { flexDirection: "row", alignItems: "center", marginVertical: spacing.md },
  swapLine: { flex: 1, height: 1, backgroundColor: colors.divider },
  swapBtn: {
    width: 48,
    height: 48,
    borderRadius: 24,
    marginHorizontal: spacing.md,
    backgroundColor: colors.cardAlt,
    borderWidth: 1.5,
    borderColor: colors.primaryBorder,
    alignItems: "center",
    justifyContent: "center",
    ...shadow.card,
  },
  swapBtnPressed: { backgroundColor: colors.primarySoft, transform: [{ rotate: "180deg" }] },
  swapGlyph: { fontSize: 17, fontWeight: "700", color: colors.primary, letterSpacing: -2 },
  sectionTitle: { ...type.heading, marginTop: spacing.xxl, marginBottom: spacing.md },
  activity: { marginTop: spacing.xxl, alignItems: "center", gap: spacing.sm },
  activityCount: { ...type.label, textAlign: "center", ...tabular },
  activityRow: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "stretch",
    backgroundColor: colors.card,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: spacing.md,
    paddingVertical: 10,
    gap: spacing.sm,
  },
  activityIcon: { width: 18, height: 18, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  activityRef: { flex: 1, fontSize: 12.5, color: colors.textSecondary, fontWeight: "600", ...tabular },
  activityAmount: { fontSize: 13.5, fontWeight: "700", color: colors.text, ...tabular },
  activityNote: { ...type.caption, fontSize: 11.5, textAlign: "center" },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    backgroundColor: colors.bgElevated,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    ...shadow.raised,
  },
  footerSummary: { flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", marginBottom: spacing.md },
  footerLabel: { ...type.label },
  footerTotal: { fontSize: 20, fontWeight: "800", color: colors.text, letterSpacing: -0.3, flexShrink: 1, marginLeft: spacing.md, ...tabular },
});
