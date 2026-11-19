/**
 * theme.js — design tokens ("Dusk": deep indigo-violet night sky, sunset
 * peach/rose glow, lavender highlights, serif headlines).
 * Every colour used in the app comes from here.
 */
import { Platform } from "react-native";

export const colors = {
  // Surfaces
  bg: "#0F0B26", // screen background
  bgElevated: "#1A1145", // sticky footers / top-level chrome
  card: "#1B1446",
  cardAlt: "#241A5A", // inputs, chips, inner panels
  sheet: "#1B1446",
  sheetBorder: "rgba(167, 150, 255, 0.18)",

  // Text
  text: "#F4F1FF",
  textMuted: "#A9A3D1",
  textFaint: "#7C76A8",
  // Legacy aliases kept so component code reads naturally.
  textSecondary: "#A9A3D1",
  textTertiary: "#7C76A8",

  // Primary (selection, focus, links, selected borders)
  primary: "#9D8CFF",
  primarySoft: "rgba(157, 140, 255, 0.16)",
  primaryBorder: "rgba(157, 140, 255, 0.45)",

  // Sunset accents (3-stop gradient: peach → rose → violet)
  peach: "#FFB36B",
  rose: "#F47AA0",
  violet: "#8B7CF6",

  // Status
  success: "#4ADE80",
  successSoft: "rgba(74, 222, 128, 0.12)",
  successBorder: "rgba(74, 222, 128, 0.35)",
  error: "#FB7185",
  errorSoft: "rgba(251, 113, 133, 0.12)",
  errorBorder: "rgba(251, 113, 133, 0.35)",
  warning: "#FBBF24",
  warningSoft: "rgba(251, 191, 36, 0.12)",
  warningBorder: "rgba(251, 191, 36, 0.35)",

  // Simulation pill / badge
  simBg: "rgba(255, 179, 107, 0.12)",
  simBorder: "rgba(255, 179, 107, 0.32)",
  simText: "#FFB36B",

  // Lines
  border: "rgba(167, 150, 255, 0.18)",
  divider: "rgba(167, 150, 255, 0.10)",
  handle: "rgba(167, 150, 255, 0.35)",

  // Buttons
  buttonBg: "#FFF8F0", // cream-white primary button
  buttonText: "#1A1145",
  buttonGlow: "#FFB36B", // peach press glow
  buttonDisabledBg: "rgba(255, 248, 240, 0.25)",
  buttonDisabledText: "rgba(26, 17, 69, 0.6)",
  outline: "rgba(244, 241, 255, 0.35)", // secondary / outline buttons
  outlinePressed: "rgba(244, 241, 255, 0.08)",

  /** Glyphs drawn on top of bright fills (success/error/primary dots). */
  onAccent: "#1A1145",

  backdrop: "rgba(5, 3, 20, 0.7)",
};

export const radius = { sm: 8, md: 12, lg: 16, xl: 24, pill: 999 };

export const spacing = { xxs: 2, xs: 4, sm: 8, md: 12, lg: 16, xl: 20, xxl: 24, xxxl: 32 };

/** Minimum touch target (iOS HIG 44pt / Material 48dp — we use 48 where space allows). */
export const touch = { min: 44, comfortable: 48 };

/** Tabular numerals so amounts line up and don't jitter while typing. */
export const tabular = { fontVariant: ["tabular-nums"] };

/** Platform serif for headlines — no font packages. */
export const serif = Platform.select({ ios: "Georgia", android: "serif", default: "Georgia, serif" });

export const type = {
  display: { fontSize: 34, lineHeight: 40, fontWeight: "700", letterSpacing: -0.8, color: colors.text, ...tabular },
  title: { fontSize: 22, lineHeight: 28, fontWeight: "700", letterSpacing: -0.2, color: colors.text, fontFamily: serif },
  heading: { fontSize: 17, lineHeight: 22, fontWeight: "600", color: colors.text },
  body: { fontSize: 15, lineHeight: 21, color: colors.text },
  bodyStrong: { fontSize: 15, lineHeight: 21, fontWeight: "600", color: colors.text },
  label: { fontSize: 13, lineHeight: 18, fontWeight: "600", color: colors.textMuted, letterSpacing: 0.1 },
  caption: { fontSize: 12.5, lineHeight: 17, color: colors.textMuted },
  overline: { fontSize: 11, lineHeight: 14, fontWeight: "700", letterSpacing: 1.2, color: colors.peach, textTransform: "uppercase" },
};

/**
 * Soft dark / violet shadows (never white). `boxShadow` is supported by React
 * Native's New Architecture (always on in Expo Go) and by react-native-web.
 */
export const shadow = {
  card: { boxShadow: "0px 1px 2px rgba(0, 0, 0, 0.25), 0px 8px 24px rgba(5, 3, 20, 0.35)" },
  raised: { boxShadow: "0px -2px 8px rgba(5, 3, 20, 0.30), 0px -10px 30px rgba(59, 42, 122, 0.25)" },
  button: { boxShadow: "0px 6px 18px rgba(5, 3, 20, 0.45)" },
  glow: { boxShadow: "0px 0px 22px 4px rgba(255, 179, 107, 0.65)" },
  /** Sunset halo behind the brand mark (peach → rose → violet). */
  logoGlow: {
    boxShadow: "0px 0px 14px 1px rgba(255, 179, 107, 0.30), 0px 2px 18px 2px rgba(244, 122, 160, 0.25), 0px 6px 22px 4px rgba(139, 124, 246, 0.35)",
  },
  /** Primary-button inner highlight (shown while pressed). */
  buttonInset: { boxShadow: "inset 0px 1px 0px rgba(255, 255, 255, 0.6), inset 0px 0px 16px rgba(255, 179, 107, 0.35)" },
  buttonBloom: { boxShadow: "0px 0px 22px 12px rgba(255, 179, 107, 0.22)" },
  segment: { boxShadow: "0px 1px 3px rgba(5, 3, 20, 0.45)" },
};

/** Inner-highlight washes for the cream primary button. */
export const buttonHighlight = {
  top: "rgba(255, 255, 255, 0.55)",
  core: "rgba(255, 179, 107, 0.22)",
};

export const card = {
  backgroundColor: colors.card,
  borderRadius: radius.lg,
  borderWidth: 1,
  borderColor: colors.border,
  padding: spacing.lg,
  ...shadow.card,
};

/** Native driver is not available on web — avoid the console warning there. */
export const NATIVE_DRIVER = Platform.OS !== "web";
