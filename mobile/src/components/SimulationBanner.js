import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { colors, radius, spacing } from "../theme";

export const SIMULATION_TEXT = "SIMULATION MODE — no real payment is processed";

/** Persistent peach pill reminding the user that this is an educational simulation. */
export default function SimulationBanner({ compact = false }) {
  return (
    <View style={[styles.pill, compact && styles.compact]} accessibilityRole="text" accessibilityLabel="Simulation mode. No real payment is processed.">
      <View style={styles.dot} />
      <Text style={styles.text} numberOfLines={2}>
        {SIMULATION_TEXT}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    backgroundColor: colors.simBg,
    borderColor: colors.simBorder,
    borderWidth: 1,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: 6,
    maxWidth: "100%",
  },
  compact: { paddingVertical: 4 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.simText, marginRight: spacing.sm },
  text: { flexShrink: 1, color: colors.simText, fontSize: 12, fontWeight: "700", letterSpacing: 0.2 },
});
