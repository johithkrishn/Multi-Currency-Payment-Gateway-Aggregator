import React, { useEffect, useRef } from "react";
import { ActivityIndicator, Animated, Easing, Linking, Pressable, StyleSheet, Text, View } from "react-native";
import Currency from "../core/currency";
import { directionText, formatAmountCode, formatDateTime, formatRateFixed } from "../format";
import { card, colors, radius, spacing, tabular, type } from "../theme";
import DuskGradient from "./DuskGradient";
import useReduceMotion from "../hooks/useReduceMotion";

/**
 * FXPreview — active exchange rate (live reference or demo), direction +
 * inverse, converted amount, and the Live / Demo source switch.
 * `quote` is the result of the shared Currency.quote(); when it is invalid we
 * still show the rate (from the table) but not a converted amount.
 */
export default function FXPreview({ quote, source, target, table, rates }) {
  const rate = Currency.getRate(table, source, target);
  const valid = quote && quote.ok;
  const r = rates || { mode: "demo", source: "demo", fxConfig: Currency.DEFAULT_FX_CONFIG, demoTable: table };
  const cfg = r.fxConfig;
  const isLive = r.mode === "live";

  const demoRate = Currency.getRate(r.demoTable || table, source, target);
  const delta = isLive && rate && demoRate && source !== target ? ((rate - demoRate) / demoRate) * 100 : null;

  return (
    <View style={styles.card} accessible={false}>
      <DuskGradient id="duskHeroWash" />
      <View style={styles.accentBar}>
        <DuskGradient id="duskHeroBar" variant="bar" />
      </View>

      <View style={styles.headerRow}>
        <View style={[styles.rateTag, isLive && styles.rateTagLive]} accessible accessibilityLabel={cfg.label}>
          {isLive ? <LiveDot /> : null}
          <Text style={[styles.rateTagText, isLive && styles.rateTagTextLive]}>
            {isLive ? "Live reference rate" : r.fallback ? "Demo rate · live unavailable" : "Demo exchange rate"}
          </Text>
        </View>
        {rates ? <SourceSwitch value={r.source} onChange={r.setSource} /> : null}
      </View>

      <View accessible accessibilityLabel={buildA11yLabel(valid, quote, rate, source, target, cfg)}>
        <Text style={styles.direction}>{rate ? directionText(rate, source, target) : "No rate available"}</Text>
        {rate ? <Text style={styles.inverse}>{directionText(1 / rate, target, source)}</Text> : null}
        {delta !== null ? (
          <View style={styles.deltaRow}>
            <View style={[styles.deltaChip, delta >= 0 ? styles.deltaUp : styles.deltaDown]}>
              <Text style={[styles.deltaText, { color: delta >= 0 ? colors.success : colors.error }]}>
                {(delta >= 0 ? "▲ +" : "▼ ") + delta.toFixed(2) + "%"}
              </Text>
            </View>
            <Text style={styles.deltaNote}>vs demo table ({formatRateFixed(demoRate)})</Text>
          </View>
        ) : null}
      </View>

      {rates ? <StatusLine rates={r} /> : null}

      <View style={styles.divider} />

      <Text style={styles.convertedLabel}>Converted amount</Text>
      <Text style={styles.converted} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.6}>
        {valid ? Currency.formatMoney(quote.convertedDisplay, target) : "—"}
      </Text>
      {valid ? (
        <Text style={styles.math}>
          {formatAmountCode(quote.sourceAmount, source)} × {formatRateFixed(rate)} = {formatAmountCode(quote.convertedDisplay, target)}
        </Text>
      ) : (
        <Text style={styles.math}>Enter a valid amount to preview the conversion.</Text>
      )}

      <Text style={styles.disclaimer}>{isLive ? cfg.disclaimer : Currency.DEFAULT_FX_CONFIG.disclaimer}</Text>
    </View>
  );
}

/** Two-option Live / Demo switch with comfortable touch targets. */
function SourceSwitch({ value, onChange }) {
  return (
    <View style={styles.switch} accessibilityRole="radiogroup" accessibilityLabel="Exchange-rate source">
      {[
        ["live", "Live"],
        ["demo", "Demo"],
      ].map(([id, label]) => {
        const on = value === id;
        return (
          <Pressable
            key={id}
            onPress={() => onChange(id)}
            accessibilityRole="radio"
            accessibilityState={{ checked: on }}
            accessibilityLabel={id === "live" ? "Use live reference rates" : "Use the demo rate table"}
            hitSlop={6}
            style={({ pressed }) => [styles.switchOpt, on && styles.switchOptOn, pressed && { opacity: 0.8 }]}
          >
            <Text style={[styles.switchText, on && styles.switchTextOn]}>{label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Source, "as of", loading / error state and a Refresh action. */
function StatusLine({ rates }) {
  if (rates.source !== "live") {
    return <Text style={styles.status}>Illustrative PRD table · switch to Live for real reference rates</Text>;
  }
  const snap = rates.snapshot;
  let body;
  if (rates.status === "loading") {
    body = (
      <View style={styles.statusRow}>
        <ActivityIndicator size="small" color={colors.peach} />
        <Text style={styles.status}> Fetching live rates…</Text>
      </View>
    );
  } else if (!snap) {
    body = <Text style={[styles.status, { color: colors.warning }]}>Live sources unreachable — using the demo table</Text>;
  } else {
    body = (
      <Text style={styles.status}>
        <Text style={styles.link} onPress={() => Linking.openURL(snap.sourceUrl)} accessibilityRole="link">
          {snap.sourceShort}
        </Text>
        {" · as of " + formatDateTime(snap.asOf)}
        {rates.status === "error" ? " · last refresh failed" : ""}
      </Text>
    );
  }
  return (
    <View style={styles.statusWrap}>
      <View style={styles.flex}>{body}</View>
      <Pressable
        onPress={rates.refresh}
        disabled={rates.status === "loading"}
        accessibilityRole="button"
        accessibilityLabel="Refresh live rates"
        hitSlop={8}
        style={({ pressed }) => [styles.refresh, pressed && { opacity: 0.7 }]}
      >
        <Text style={styles.refreshText}>↻ Refresh</Text>
      </Pressable>
    </View>
  );
}

/** Pulsing green dot (static when Reduce Motion is on). */
function LiveDot() {
  const reduce = useReduceMotion();
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduce) return undefined;
    const loop = Animated.loop(Animated.timing(pulse, { toValue: 1, duration: 1600, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [reduce, pulse]);
  return (
    <View style={styles.dotWrap}>
      {!reduce ? (
        <Animated.View
          style={[
            styles.dotRing,
            {
              opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.8, 0] }),
              transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.6, 2] }) }],
            },
          ]}
        />
      ) : null}
      <View style={styles.dot} />
    </View>
  );
}

function buildA11yLabel(valid, quote, rate, source, target, cfg) {
  const parts = [cfg.label + "."];
  if (rate) parts.push(directionText(rate, source, target) + ".");
  if (valid) parts.push("Converted amount " + Currency.formatMoney(quote.convertedDisplay, target) + ".");
  parts.push(cfg.disclaimer);
  return parts.join(" ");
}

const styles = StyleSheet.create({
  // Hero card: sunset wash + thin gradient strip on top, clipped to the radius.
  card: { ...card, overflow: "hidden", borderColor: colors.primaryBorder },
  flex: { flex: 1 },
  accentBar: { position: "absolute", top: 0, left: 0, right: 0, height: 3 },
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.md, gap: spacing.sm },
  rateTag: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.primarySoft,
    borderRadius: radius.pill,
    paddingHorizontal: 10,
    paddingVertical: 4,
    flexShrink: 1,
  },
  rateTagLive: { backgroundColor: colors.successSoft, borderWidth: 1, borderColor: colors.successBorder },
  rateTagText: { color: colors.text, fontSize: 12, fontWeight: "700", letterSpacing: 0.2 },
  rateTagTextLive: { color: colors.success },
  dotWrap: { width: 10, height: 10, marginRight: 6, alignItems: "center", justifyContent: "center" },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.success },
  dotRing: { position: "absolute", width: 10, height: 10, borderRadius: 5, borderWidth: 2, borderColor: colors.success },
  switch: { flexDirection: "row", backgroundColor: colors.cardAlt, borderRadius: radius.pill, padding: 3, borderWidth: 1, borderColor: colors.border },
  switchOpt: { minHeight: 32, minWidth: 54, paddingHorizontal: 12, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  switchOptOn: { backgroundColor: colors.primarySoft, borderWidth: 1, borderColor: colors.peach },
  switchText: { color: colors.textMuted, fontWeight: "700", fontSize: 12.5 },
  switchTextOn: { color: colors.text },
  direction: { fontSize: 19, lineHeight: 25, fontWeight: "700", color: colors.text, letterSpacing: -0.2, ...tabular },
  inverse: { ...type.caption, fontSize: 13.5, marginTop: 2, ...tabular },
  deltaRow: { flexDirection: "row", alignItems: "center", marginTop: spacing.sm, gap: 6, flexWrap: "wrap" },
  deltaChip: { borderRadius: radius.pill, paddingHorizontal: 8, paddingVertical: 2, borderWidth: 1 },
  deltaUp: { backgroundColor: colors.successSoft, borderColor: colors.successBorder },
  deltaDown: { backgroundColor: colors.errorSoft, borderColor: colors.errorBorder },
  deltaText: { fontSize: 12, fontWeight: "700", ...tabular },
  deltaNote: { ...type.caption },
  statusWrap: { flexDirection: "row", alignItems: "center", marginTop: spacing.sm, gap: spacing.sm, minHeight: 32 },
  statusRow: { flexDirection: "row", alignItems: "center" },
  status: { ...type.caption },
  link: { color: colors.peach, textDecorationLine: "underline" },
  refresh: { paddingVertical: 6, paddingHorizontal: 4 },
  refreshText: { color: colors.peach, fontWeight: "700", fontSize: 12.5 },
  divider: { height: 1, backgroundColor: colors.divider, marginVertical: spacing.lg },
  convertedLabel: { ...type.overline, marginBottom: spacing.xs },
  converted: { ...type.display },
  math: { ...type.caption, marginTop: spacing.xs, ...tabular },
  disclaimer: {
    ...type.caption,
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    fontStyle: "italic",
  },
});
