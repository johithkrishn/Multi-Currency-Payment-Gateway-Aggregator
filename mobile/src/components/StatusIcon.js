import React from "react";
import { StyleSheet, View } from "react-native";
import { colors } from "../theme";

/**
 * StatusIcon — check / cross glyphs drawn with Views so they render identically
 * on every device (no icon font, no emoji fallback differences).
 */
export default function StatusIcon({ kind = "check", size = 16, color = colors.onAccent, thickness }) {
  const t = thickness || Math.max(2, Math.round(size * 0.14));
  if (kind === "cross") {
    const bar = { position: "absolute", width: size, height: t, borderRadius: t, backgroundColor: color };
    return (
      <View style={{ width: size, height: size, alignItems: "center", justifyContent: "center" }} accessible={false}>
        <View style={[bar, { transform: [{ rotate: "45deg" }] }]} />
        <View style={[bar, { transform: [{ rotate: "-45deg" }] }]} />
      </View>
    );
  }
  // Check mark: an "L" (bottom + right border) rotated 45°.
  return (
    <View style={[styles.box, { width: size, height: size }]} accessible={false}>
      <View
        style={{
          width: size * 0.36,
          height: size * 0.68,
          borderRightWidth: t,
          borderBottomWidth: t,
          borderColor: color,
          transform: [{ rotate: "45deg" }],
          marginTop: -size * 0.12,
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: "center", justifyContent: "center" },
});
