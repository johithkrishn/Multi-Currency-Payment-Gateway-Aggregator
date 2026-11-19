import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Simulator from "../core/payment-simulator";
import { colors, radius, shadow, spacing, touch, type } from "../theme";

const ORDER = ["success", "failure", "rule_based"];

const HELP = {
  success: "Every attempt ends as a simulated success.",
  failure: "Every attempt ends as a simulated failure (provider timeout).",
  rule_based: "Deterministic rules: amounts ending in .13 fail; above 25,000 USD-equivalent fails; otherwise success.",
};

/** Demo / developer control: choose how the simulator decides the outcome. */
export default function OutcomeModeControl({ value, onChange }) {
  return (
    <View>
      <View style={styles.headerRow}>
        <Text style={styles.label}>Demo outcome</Text>
        <View style={styles.devTag}>
          <Text style={styles.devTagText}>DEVELOPER CONTROL</Text>
        </View>
      </View>
      <View style={styles.track} accessibilityRole="radiogroup" accessibilityLabel="Demo outcome, developer control">
        {ORDER.map((id) => {
          const mode = Simulator.OUTCOME_MODES[id];
          const selected = id === value;
          return (
            <Pressable
              key={id}
              onPress={() => onChange(id)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, selected }}
              accessibilityLabel={"Demo outcome: " + mode.label}
              style={[styles.segment, selected && styles.segmentSelected]}
            >
              <Text style={[styles.segmentText, selected && styles.segmentTextSelected]}>{mode.short}</Text>
            </Pressable>
          );
        })}
      </View>
      <Text style={styles.help}>{HELP[value]}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  headerRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: spacing.sm },
  label: { ...type.label },
  devTag: { borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, paddingHorizontal: 6, paddingVertical: 2 },
  devTagText: { fontSize: 10, fontWeight: "700", letterSpacing: 0.8, color: colors.textSecondary },
  track: {
    flexDirection: "row",
    backgroundColor: colors.cardAlt,
    borderRadius: radius.md,
    padding: 4,
    gap: 4,
  },
  segment: {
    flex: 1,
    minHeight: touch.min,
    borderRadius: radius.sm + 1,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "transparent",
  },
  segmentSelected: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primary,
    ...shadow.segment,
  },
  segmentText: { fontSize: 14.5, fontWeight: "600", color: colors.textSecondary },
  segmentTextSelected: { color: colors.text, fontWeight: "700" },
  help: { ...type.caption, marginTop: spacing.sm },
});
