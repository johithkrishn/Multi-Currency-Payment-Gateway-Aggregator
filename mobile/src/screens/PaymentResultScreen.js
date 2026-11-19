import React, { useEffect, useRef } from "react";
import { Animated, Easing, ScrollView, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Currency from "../core/currency";
import Simulator from "../core/payment-simulator";
import PrimaryButton from "../components/PrimaryButton";
import StatusIcon from "../components/StatusIcon";
import StatusTimeline from "../components/StatusTimeline";
import { directionText, formatAmountCode, formatDateTime } from "../format";
import { card, colors, radius, shadow, spacing, tabular, type, NATIVE_DRIVER } from "../theme";

/**
 * PaymentResultScreen — immutable snapshot of one simulated attempt.
 * Success/failure is conveyed by icon + heading text, not colour alone.
 */
export default function PaymentResultScreen({ tx, onBack, onRetry, reduceMotion }) {
  const insets = useSafeAreaInsets();
  const ok = tx.status === "SUCCESS";
  const tone = ok ? colors.success : colors.error;
  const toneSoft = ok ? colors.successSoft : colors.errorSoft;

  const appear = useRef(new Animated.Value(reduceMotion ? 1 : 0)).current;
  useEffect(() => {
    if (reduceMotion) {
      appear.setValue(1);
      return;
    }
    Animated.timing(appear, { toValue: 1, duration: 420, easing: Easing.out(Easing.back(1.4)), useNativeDriver: NATIVE_DRIVER }).start();
  }, [appear, reduceMotion, tx.id]);

  const heroStyle = {
    opacity: appear.interpolate({ inputRange: [0, 1], outputRange: [0, 1], extrapolate: "clamp" }),
    transform: [{ scale: appear.interpolate({ inputRange: [0, 1], outputRange: [0.86, 1] }) }],
  };
  const bodyStyle = {
    opacity: appear.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.4, 1], extrapolate: "clamp" }),
    transform: [{ translateY: appear.interpolate({ inputRange: [0, 1], outputRange: [16, 0] }) }],
  };

  const heading = ok ? "Simulated payment successful" : "Simulated payment failed";
  const mode = Simulator.OUTCOME_MODES[tx.outcomeMode];

  return (
    <View style={[styles.screen, { paddingTop: insets.top }]}>
      <ScrollView contentContainerStyle={styles.scrollContent}>
        <View style={styles.contentWidth}>
          <View style={styles.badgeRow}>
            <View style={styles.simBadge} accessibilityLabel="Simulated transaction">
              <Text style={styles.simBadgeText}>SIMULATED</Text>
            </View>
          </View>

          <Animated.View style={[styles.hero, heroStyle]}>
            <View style={[styles.iconHalo, { backgroundColor: toneSoft }]}>
              <View style={[styles.iconCircle, { backgroundColor: tone }]}>
                <StatusIcon kind={ok ? "check" : "cross"} size={34} color={colors.onAccent} thickness={5} />
              </View>
            </View>
            <Text style={[styles.heading, { color: tone }]} accessibilityRole="header" accessibilityLiveRegion="polite">
              {heading}
            </Text>
            <Text style={styles.total} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
              {Currency.formatMoney(tx.totalAmount, tx.targetCurrency)}
            </Text>
            <Text style={styles.subtext}>
              {ok ? "The mock flow completed. No real payment was processed." : "The mock flow ended in a simulated failure. No real payment was attempted."}
            </Text>
          </Animated.View>

          <Animated.View style={bodyStyle}>
            {!ok ? (
              <View style={styles.failureBox} accessibilityRole="alert">
                <Text style={styles.failureTitle}>Failure reason</Text>
                <Text style={styles.failureText}>{tx.failureReason}</Text>
                <Text style={styles.failureCode}>{tx.failureCode}</Text>
              </View>
            ) : null}

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Transaction details</Text>
              <Detail label="Reference" value={tx.id} selectable mono />
              <Detail label="Provider" value={tx.providerName} />
              <Detail label="Source amount" value={formatAmountCode(tx.sourceAmount, tx.sourceCurrency)} />
              <Detail label={tx.rateLabel} value={directionText(tx.exchangeRate, tx.sourceCurrency, tx.targetCurrency)} />
              <Detail label="Converted amount" value={Currency.formatMoney(tx.convertedAmount, tx.targetCurrency)} />
              <Detail label={"Fee (" + tx.feePercent + "%)"} value={Currency.formatMoney(tx.feeAmount, tx.feeCurrency)} />
              <Detail label="Total" value={Currency.formatMoney(tx.totalAmount, tx.targetCurrency)} strong />
              <Detail label="Timestamp" value={formatDateTime(tx.createdAt)} />
              <Detail label="Outcome mode" value={mode ? mode.label : tx.outcomeMode} />
              <Detail label="Outcome rule" value={tx.outcomeRule} last />
            </View>

            <View style={styles.card}>
              <Text style={styles.cardTitle}>Status timeline</Text>
              <StatusTimeline entries={tx.timeline} reduceMotion />
            </View>

            <Text style={styles.disclaimer}>
              {/^Live/.test(tx.rateLabel || "")
                ? "Live reference rate (" + tx.rateSource + ") — real market data, not an executable quote."
                : Currency.DEFAULT_FX_CONFIG.disclaimer}{" "}
              Mock provider — no real payment will be processed.
            </Text>
          </Animated.View>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: Math.max(insets.bottom, spacing.md) }]}>
        <View style={[styles.contentWidth, styles.actions]}>
          {!ok ? (
            <PrimaryButton
              title="Retry"
              onPress={onRetry}
              accessibilityHint="Returns to checkout with the same values and reopens the review sheet."
            />
          ) : null}
          <PrimaryButton
            title="Back to Checkout"
            variant={ok ? "primary" : "secondary"}
            onPress={onBack}
            accessibilityHint="Returns to checkout. Your previous values are kept."
          />
        </View>
      </View>
    </View>
  );
}

function Detail({ label, value, strong, selectable, mono, last }) {
  return (
    <View style={[styles.detail, last && styles.detailLast]} accessible accessibilityLabel={label + ": " + value}>
      <Text style={styles.detailLabel}>{label}</Text>
      <Text style={[styles.detailValue, strong && styles.detailStrong, mono && styles.mono]} selectable={selectable}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  contentWidth: { width: "100%", maxWidth: 560, alignSelf: "center" },
  scrollContent: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl, paddingTop: spacing.md },
  badgeRow: { alignItems: "center", marginBottom: spacing.lg },
  simBadge: {
    backgroundColor: colors.simBg,
    borderColor: colors.simBorder,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  simBadgeText: { color: colors.simText, fontSize: 11.5, fontWeight: "800", letterSpacing: 1.2 },
  hero: { alignItems: "center", marginBottom: spacing.xxl },
  iconHalo: { width: 104, height: 104, borderRadius: 52, alignItems: "center", justifyContent: "center", marginBottom: spacing.lg },
  iconCircle: { width: 72, height: 72, borderRadius: 36, alignItems: "center", justifyContent: "center" },
  heading: { ...type.title, fontSize: 26, lineHeight: 32, textAlign: "center" },
  total: { ...type.display, marginTop: spacing.sm },
  subtext: { ...type.body, color: colors.textSecondary, textAlign: "center", marginTop: spacing.sm, maxWidth: 340 },
  failureBox: {
    backgroundColor: colors.errorSoft,
    borderColor: colors.errorBorder,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: spacing.lg,
    marginBottom: spacing.lg,
  },
  failureTitle: { ...type.label, color: colors.error },
  failureText: { ...type.bodyStrong, color: colors.text, marginTop: spacing.xs },
  failureCode: { ...type.caption, marginTop: spacing.xs, letterSpacing: 0.4, ...tabular },
  card: { ...card, marginBottom: spacing.lg },
  cardTitle: { ...type.heading, marginBottom: spacing.sm },
  detail: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: spacing.md,
    paddingVertical: 11,
    borderBottomWidth: 1,
    borderBottomColor: colors.divider,
  },
  detailLast: { borderBottomWidth: 0 },
  detailLabel: { ...type.body, color: colors.textSecondary, flexShrink: 0, maxWidth: "45%" },
  detailValue: { ...type.bodyStrong, flexShrink: 1, textAlign: "right", ...tabular },
  detailStrong: { fontSize: 17, fontWeight: "800" },
  mono: { fontSize: 13.5, letterSpacing: 0.3 },
  disclaimer: { ...type.caption, textAlign: "center", marginTop: spacing.xs },
  footer: {
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.md,
    backgroundColor: colors.bgElevated,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    ...shadow.raised,
  },
  actions: { gap: spacing.sm },
});
