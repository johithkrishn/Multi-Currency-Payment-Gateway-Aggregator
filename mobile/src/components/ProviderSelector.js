import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Currency from "../core/currency";
import { colors, radius, spacing, tabular, type, shadow } from "../theme";

export const MOCK_PROVIDER_NOTE = "Mock provider — no real payment will be processed.";

/**
 * Pick the lowest-fee provider for the current input. Uses the shared quote()
 * so the comparison is in the same rounded target-currency amounts the user sees;
 * falls back to feePercent when the amount is invalid.
 */
export function lowestFeeProviderId(providers, quotes) {
  let best = null;
  providers.forEach((p) => {
    const q = quotes[p.id];
    const score = q && q.ok ? q.feeDisplay : p.feePercent;
    if (best === null || score < best.score) best = { id: p.id, score };
  });
  return best ? best.id : null;
}

/**
 * ProviderSelector — two radio cards with fee %, estimated fee and total for the
 * current amount (in the target currency) and a "Lowest fee" badge.
 */
export default function ProviderSelector({ providers, selectedId, onSelect, quotes, target }) {
  const lowestId = lowestFeeProviderId(providers, quotes);

  return (
    <View>
      <View style={styles.list} accessibilityRole="radiogroup" accessibilityLabel="Mock payment provider">
        {providers.map((p) => {
          const selected = p.id === selectedId;
          const q = quotes[p.id];
          const valid = q && q.ok;
          const isLowest = p.id === lowestId;
          const feeText = valid ? Currency.formatMoney(q.feeDisplay, target) : "—";
          const totalText = valid ? Currency.formatMoney(q.totalDisplay, target) : "—";
          return (
            <Pressable
              key={p.id}
              onPress={() => onSelect(p.id)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, selected }}
              accessibilityLabel={
                p.name + ". " + p.feePercent + " percent fee. Estimated fee " + feeText + ", total " + totalText + "." + (isLowest ? " Lowest fee." : "")
              }
              accessibilityHint="Selects this mock provider. No real provider is contacted."
              style={({ pressed }) => [styles.card, selected && styles.cardSelected, pressed && styles.cardPressed]}
            >
              <View style={styles.topRow}>
                <View style={[styles.radio, selected && styles.radioSelected]}>{selected ? <View style={styles.radioDot} /> : null}</View>
                <View style={styles.titleWrap}>
                  <View style={styles.nameRow}>
                    <Text style={styles.name}>{p.name}</Text>
                    {isLowest ? (
                      <View style={styles.badge}>
                        <Text style={styles.badgeText}>Lowest fee</Text>
                      </View>
                    ) : null}
                  </View>
                  <Text style={styles.desc}>{p.description}</Text>
                </View>
                <View style={styles.tag}>
                  <Text style={styles.tagText}>{p.tag}</Text>
                </View>
              </View>

              <View style={styles.metrics}>
                <Metric label="Fee" value={p.feePercent + "%"} />
                <Metric label="Est. fee" value={feeText} />
                <Metric label="Est. total" value={totalText} strong />
              </View>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.note}>{MOCK_PROVIDER_NOTE}</Text>
    </View>
  );
}

function Metric({ label, value, strong }) {
  return (
    <View style={styles.metric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, strong && styles.metricStrong]} numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.7}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { gap: spacing.md },
  card: {
    backgroundColor: colors.card,
    borderRadius: radius.lg,
    borderWidth: 1.5,
    borderColor: colors.border,
    padding: spacing.lg,
    ...shadow.card,
  },
  cardSelected: { borderColor: colors.primary, backgroundColor: colors.cardAlt },
  cardPressed: { opacity: 0.9 },
  topRow: { flexDirection: "row", alignItems: "flex-start" },
  radio: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: colors.textFaint,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
    marginRight: spacing.md,
  },
  radioSelected: { borderColor: colors.primary },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.primary },
  titleWrap: { flex: 1 },
  nameRow: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: spacing.sm },
  name: { ...type.bodyStrong, fontSize: 16 },
  badge: {
    backgroundColor: colors.successSoft,
    borderRadius: radius.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderWidth: 1,
    borderColor: colors.successBorder,
  },
  badgeText: { color: colors.success, fontSize: 11.5, fontWeight: "700" },
  desc: { ...type.caption, marginTop: 3 },
  tag: {
    marginLeft: spacing.sm,
    backgroundColor: colors.cardAlt,
    borderRadius: radius.sm,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  tagText: { fontSize: 11, fontWeight: "700", color: colors.textSecondary, letterSpacing: 0.6 },
  metrics: {
    flexDirection: "row",
    marginTop: spacing.md,
    paddingTop: spacing.md,
    borderTopWidth: 1,
    borderTopColor: colors.divider,
    marginLeft: 34,
  },
  metric: { flex: 1 },
  metricLabel: { ...type.caption, fontSize: 11.5 },
  metricValue: { fontSize: 14.5, fontWeight: "600", color: colors.text, marginTop: 2, ...tabular },
  metricStrong: { fontWeight: "700" },
  note: { ...type.caption, marginTop: spacing.md, textAlign: "center" },
});
