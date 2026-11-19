import React, { useRef } from "react";
import { ActivityIndicator, Animated, Pressable, StyleSheet, Text, View } from "react-native";
import { buttonHighlight, colors, radius, shadow, touch, NATIVE_DRIVER } from "../theme";

/**
 * PrimaryButton — "lit-up" press effect built with Animated only:
 *   idle      → slightly dimmed (opacity 0.92)
 *   pressIn   → brightens to full opacity, a soft peach glow fades in behind the
 *               button, a lighter inner highlight appears, and it scales to 0.97
 *   pressOut  → springs back to the idle state
 *
 * variant: "primary" (cream fill, peach glow) | "secondary" (outlined) | "ghost" (text only)
 */
export default function PrimaryButton({
  title,
  onPress,
  disabled = false,
  loading = false,
  variant = "primary",
  accessibilityLabel,
  accessibilityHint,
  style,
  compact = false,
  testID,
}) {
  const press = useRef(new Animated.Value(0)).current;
  const inactive = disabled || loading;
  const isPrimary = variant === "primary";

  const animateTo = (toValue) => {
    Animated.spring(press, {
      toValue,
      useNativeDriver: NATIVE_DRIVER,
      speed: toValue ? 40 : 18,
      bounciness: toValue ? 0 : 6,
    }).start();
  };

  const scale = press.interpolate({ inputRange: [0, 1], outputRange: [1, 0.97] });
  const bodyOpacity = press.interpolate({ inputRange: [0, 1], outputRange: [isPrimary ? 0.92 : 1, 1] });
  const glowOpacity = press.interpolate({ inputRange: [0, 1], outputRange: [0, 1] });

  const containerStyle = [
    styles.base,
    compact && styles.compact,
    isPrimary && styles.primary,
    isPrimary && !inactive && shadow.button,
    variant === "secondary" && styles.secondary,
    variant === "ghost" && styles.ghost,
    inactive && isPrimary && styles.primaryDisabled,
    inactive && variant === "secondary" && styles.secondaryDisabled,
  ];

  const textStyle = [
    styles.text,
    isPrimary ? styles.textPrimary : variant === "secondary" ? styles.textOutline : styles.textSecondary,
    inactive && (isPrimary ? styles.textPrimaryDisabled : styles.textDisabled),
  ];

  return (
    <Pressable
      onPress={inactive ? undefined : onPress}
      onPressIn={() => !inactive && animateTo(1)}
      onPressOut={() => animateTo(0)}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel || title}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      hitSlop={compact ? 6 : 0}
      style={style}
      testID={testID}
    >
      <Animated.View style={{ transform: [{ scale }] }}>
        {isPrimary && !inactive ? (
          <Animated.View pointerEvents="none" style={[styles.glow, shadow.glow, { opacity: glowOpacity }]} />
        ) : null}
        <Animated.View style={[containerStyle, isPrimary && !inactive && { opacity: bodyOpacity }]}>
          {isPrimary && !inactive ? (
            <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.highlightWrap, { opacity: glowOpacity }]}>
              <View style={styles.highlightTop} />
              <View style={styles.highlightCore} />
            </Animated.View>
          ) : null}
          {loading ? (
            <ActivityIndicator color={isPrimary ? colors.text : colors.primary} />
          ) : (
            <Text style={textStyle} numberOfLines={1}>
              {title}
            </Text>
          )}
        </Animated.View>
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: 54,
    borderRadius: radius.md + 2,
    paddingHorizontal: 20,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  compact: { minHeight: touch.min, paddingHorizontal: 14, borderRadius: radius.md },
  primary: { backgroundColor: colors.buttonBg },
  primaryDisabled: { backgroundColor: colors.buttonDisabledBg },
  secondary: { backgroundColor: "transparent", borderWidth: 1, borderColor: colors.outline },
  secondaryDisabled: { opacity: 0.55 },
  ghost: { backgroundColor: "transparent" },
  glow: {
    position: "absolute",
    top: 2,
    bottom: 2,
    left: 6,
    right: 6,
    borderRadius: radius.lg,
    backgroundColor: colors.buttonGlow,
  },
  highlightWrap: {
    borderRadius: radius.md + 2,
    overflow: "hidden",
    ...shadow.buttonInset,
  },
  // Lighter wash across the top half + a soft brighter core: reads as an inner highlight.
  highlightTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: "55%",
    backgroundColor: buttonHighlight.top,
  },
  highlightCore: {
    position: "absolute",
    top: "20%",
    bottom: "20%",
    left: "22%",
    right: "22%",
    borderRadius: radius.pill,
    backgroundColor: buttonHighlight.core,
    // Blurred spread softens the edge so it reads as a radial bloom, not a shape.
    ...shadow.buttonBloom,
  },
  text: { fontSize: 16.5, fontWeight: "700", letterSpacing: 0.1 },
  textPrimary: { color: colors.buttonText },
  textSecondary: { color: colors.primary },
  textOutline: { color: colors.text },
  textPrimaryDisabled: { color: colors.buttonDisabledText },
  textDisabled: { color: colors.textSecondary },
});
