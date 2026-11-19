import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import Currency from "../core/currency";
import { colors, radius, spacing, touch, type } from "../theme";

/**
 * CurrencyPicker — a radio group of USD / INR / EUR chips (flag + code).
 */
export default function CurrencyPicker({ label, value, onChange, hint }) {
  return (
    <View>
      {label ? <Text style={styles.label}>{label}</Text> : null}
      <View style={styles.row} accessibilityRole="radiogroup" accessibilityLabel={label}>
        {Currency.SUPPORTED_CURRENCIES.map((code) => {
          const meta = Currency.CURRENCY_META[code];
          const selected = code === value;
          return (
            <Pressable
              key={code}
              onPress={() => onChange(code)}
              accessibilityRole="radio"
              accessibilityState={{ checked: selected, selected }}
              accessibilityLabel={(label ? label + ": " : "") + meta.name + " (" + code + ")"}
              accessibilityHint={hint}
              style={({ pressed }) => [styles.chip, selected && styles.chipSelected, pressed && !selected && styles.chipPressed]}
            >
              <Text style={styles.flag} accessible={false}>
                {meta.flag}
              </Text>
              <Text style={[styles.code, selected && styles.codeSelected]}>{code}</Text>
              {selected ? <View style={styles.dot} /> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  label: { ...type.label, marginBottom: spacing.sm },
  row: { flexDirection: "row", gap: spacing.sm },
  chip: {
    flex: 1,
    minHeight: touch.comfortable,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.cardAlt,
    paddingHorizontal: spacing.sm,
  },
  chipSelected: { borderColor: colors.primary, backgroundColor: colors.primarySoft },
  chipPressed: { backgroundColor: colors.bgElevated },
  flag: { fontSize: 18 },
  code: { fontSize: 15, fontWeight: "600", color: colors.text, letterSpacing: 0.3 },
  codeSelected: { color: colors.text, fontWeight: "700" },
  dot: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.primary, marginLeft: 2 },
});
