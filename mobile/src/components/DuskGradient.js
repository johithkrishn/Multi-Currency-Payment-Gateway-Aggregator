import React from "react";
import { StyleSheet } from "react-native";
import Svg, { Defs, LinearGradient, Rect, Stop } from "react-native-svg";
import { colors } from "../theme";

/**
 * DuskGradient — the sunset peach → rose → violet wash, drawn with
 * react-native-svg (no expo-linear-gradient). Purely decorative: fills its
 * parent absolutely and ignores touches. The parent should set
 * `overflow: "hidden"` + a borderRadius to clip it.
 *
 *   variant "wash"  diagonal, low-opacity tint behind content (text stays AA)
 *   variant "bar"   full-strength horizontal strip (e.g. a thin top accent)
 */
export default function DuskGradient({ id, variant = "wash", style }) {
  const bar = variant === "bar";
  return (
    <Svg
      style={[StyleSheet.absoluteFill, style]}
      width="100%"
      height="100%"
      preserveAspectRatio="none"
      pointerEvents="none"
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      <Defs>
        <LinearGradient id={id} x1="0" y1="0" x2="1" y2={bar ? "0" : "1"}>
          <Stop offset="0" stopColor={colors.violet} stopOpacity={bar ? 1 : 0.3} />
          <Stop offset="0.55" stopColor={colors.rose} stopOpacity={bar ? 1 : 0.13} />
          <Stop offset="1" stopColor={colors.peach} stopOpacity={bar ? 1 : 0.17} />
        </LinearGradient>
      </Defs>
      <Rect x="0" y="0" width="100%" height="100%" fill={"url(#" + id + ")"} />
    </Svg>
  );
}
