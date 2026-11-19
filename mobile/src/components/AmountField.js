import React, { useState } from "react";
import { Platform, StyleSheet, Text, TextInput, View } from "react-native";
import Currency from "../core/currency";
import { colors, radius, spacing, tabular, type } from "../theme";

/**
 * AmountField — decimal-pad amount input, validated live with the shared
 * `validateAmount`. The raw text is always kept (never cleared on error) and the
 * exact validation message is shown under the field.
 */
export default function AmountField({ value, onChangeText, currency, label = "Amount", size = "large", autoFocus = false, nativeID }) {
  const [focused, setFocused] = useState(false);
  const validation = Currency.validateAmount(value);
  const error = validation.ok ? null : validation.error;
  const meta = Currency.CURRENCY_META[currency] || { symbol: "", name: currency };
  const large = size === "large";

  return (
    <View>
      <Text style={styles.label} nativeID={nativeID}>
        {label}
      </Text>
      <View
        style={[
          styles.field,
          large ? styles.fieldLarge : styles.fieldSmall,
          focused && styles.fieldFocused,
          error && styles.fieldError,
        ]}
      >
        <Text style={[styles.symbol, large ? styles.symbolLarge : styles.symbolSmall]} accessible={false}>
          {meta.symbol}
        </Text>
        <TextInput
          value={value}
          onChangeText={onChangeText}
          keyboardType="decimal-pad"
          inputMode="decimal"
          returnKeyType="done"
          placeholder="0.00"
          placeholderTextColor={colors.textFaint}
          selectionColor={colors.primary}
          cursorColor={colors.primary}
          autoFocus={autoFocus}
          autoCorrect={false}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          style={[styles.input, large ? styles.inputLarge : styles.inputSmall]}
          accessibilityLabel={label + " in " + currency}
          accessibilityHint={"Enter the amount to send in " + meta.name + ". Up to 2 decimal places."}
          accessibilityLabelledBy={nativeID}
          accessibilityState={{ invalid: !!error }}
          aria-invalid={!!error}
          maxLength={16}
        />
        <View style={styles.codeTag} accessible={false}>
          <Text style={styles.codeText}>{currency}</Text>
        </View>
      </View>
      {error ? (
        <View style={styles.errorRow} accessibilityLiveRegion="polite" accessibilityRole="alert">
          <View style={styles.errorDot}>
            <Text style={styles.errorDotText}>!</Text>
          </View>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { ...type.label, marginBottom: spacing.sm },
  field: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.cardAlt,
    borderRadius: radius.md + 2,
    paddingHorizontal: spacing.lg,
  },
  fieldLarge: { minHeight: 68 },
  fieldSmall: { minHeight: 52 },
  fieldFocused: { borderColor: colors.primary, backgroundColor: colors.cardAlt },
  fieldError: { borderColor: colors.error, backgroundColor: colors.errorSoft },
  symbol: { color: colors.textSecondary, fontWeight: "600", marginRight: spacing.xs },
  symbolLarge: { fontSize: 26 },
  symbolSmall: { fontSize: 18 },
  input: {
    flex: 1,
    color: colors.text,
    fontWeight: "700",
    paddingVertical: spacing.sm,
    minHeight: 44,
    minWidth: 0,
    ...tabular,
    ...Platform.select({ web: { outlineStyle: "none" }, default: {} }),
  },
  inputLarge: { fontSize: 30, letterSpacing: -0.6 },
  inputSmall: { fontSize: 20 },
  codeTag: {
    marginLeft: spacing.sm,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radius.pill,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
  },
  codeText: { fontSize: 12.5, fontWeight: "700", color: colors.textSecondary, letterSpacing: 0.4 },
  errorRow: { flexDirection: "row", alignItems: "flex-start", marginTop: spacing.sm },
  errorDot: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.error,
    alignItems: "center",
    justifyContent: "center",
    marginRight: spacing.sm,
    marginTop: 1,
  },
  errorDotText: { color: colors.onAccent, fontSize: 12, fontWeight: "800", lineHeight: 14 },
  errorText: { flex: 1, fontSize: 14, lineHeight: 20, color: colors.error, fontWeight: "500" },
});
