import React, { useEffect, useRef } from "react";
import { Animated, Easing, StyleSheet, Text, View } from "react-native";
import Simulator from "../core/payment-simulator";
import { formatTime } from "../format";
import { colors, spacing, tabular, type, NATIVE_DRIVER } from "../theme";
import StatusIcon from "./StatusIcon";

/**
 * StatusTimeline — the simulated state machine
 *   CREATED → AUTHORIZING → PROCESSING → SUCCESS | FAILED
 *
 * Props
 *   entries      timeline entries already reached [{ state, label, at }]
 *   running      true while the simulation is in progress (last entry pulses)
 *   showPending  render the not-yet-reached steps as hollow placeholders
 */
export default function StatusTimeline({ entries = [], running = false, showPending = false, reduceMotion = false }) {
  const rows = entries.map((e) => ({ ...e, reached: true }));
  if (showPending) {
    const reachedStates = new Set(entries.map((e) => e.state));
    Simulator.STATES.forEach((s) => {
      if (!reachedStates.has(s)) rows.push({ state: s, label: Simulator.STATE_LABELS[s], reached: false });
    });
    const hasOutcome = entries.some((e) => e.state === "SUCCESS" || e.state === "FAILED");
    if (!hasOutcome) rows.push({ state: "OUTCOME", label: "Simulated outcome", reached: false });
  }

  return (
    <View accessibilityRole="list" accessibilityLabel="Simulation status timeline">
      {rows.map((row, i) => {
        const isLast = i === rows.length - 1;
        const isActive = running && row.reached && i === entries.length - 1;
        return (
          <TimelineRow
            key={row.state + i}
            row={row}
            isLast={isLast}
            isActive={isActive}
            nextReached={!isLast && rows[i + 1].reached}
            reduceMotion={reduceMotion}
          />
        );
      })}
    </View>
  );
}

function TimelineRow({ row, isLast, isActive, nextReached, reduceMotion }) {
  const pulse = useRef(new Animated.Value(0)).current;
  const appear = useRef(new Animated.Value(row.reached ? 0 : 1)).current;

  useEffect(() => {
    if (!row.reached) return;
    if (reduceMotion) {
      appear.setValue(1);
      return;
    }
    Animated.timing(appear, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: NATIVE_DRIVER }).start();
  }, [row.reached, reduceMotion, appear]);

  useEffect(() => {
    if (!isActive || reduceMotion) {
      pulse.stopAnimation();
      pulse.setValue(0);
      return;
    }
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 650, useNativeDriver: NATIVE_DRIVER }),
        Animated.timing(pulse, { toValue: 0, duration: 650, useNativeDriver: NATIVE_DRIVER }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, [isActive, reduceMotion, pulse]);

  const isSuccess = row.state === "SUCCESS";
  const isFailed = row.state === "FAILED";
  const dotColor = !row.reached ? colors.card : isFailed ? colors.error : isSuccess ? colors.success : colors.primary;
  const status = !row.reached ? "pending" : isActive ? "in progress" : isFailed ? "failed" : "done";

  return (
    <Animated.View
      style={[styles.row, { opacity: appear }]}
      accessible
      accessibilityLabel={row.label + ", " + status + (row.at ? ", at " + formatTime(row.at) : "")}
    >
      <View style={styles.rail}>
        <View style={[styles.dot, { backgroundColor: dotColor }, !row.reached && styles.dotPending]}>
          {isActive ? (
            <Animated.View
              style={[
                styles.pulse,
                {
                  opacity: pulse.interpolate({ inputRange: [0, 1], outputRange: [0.5, 0] }),
                  transform: [{ scale: pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.9] }) }],
                },
              ]}
            />
          ) : null}
          {row.reached && !isActive ? <StatusIcon kind={isFailed ? "cross" : "check"} size={11} color={colors.onAccent} thickness={2} /> : null}
          {isActive ? <View style={styles.activeCore} /> : null}
        </View>
        {!isLast ? <View style={[styles.line, nextReached && styles.lineReached]} /> : null}
      </View>
      <View style={styles.content}>
        <Text style={[styles.label, !row.reached && styles.labelPending, isFailed && { color: colors.error }, isSuccess && { color: colors.success }]}>
          {row.label}
        </Text>
        <Text style={styles.meta}>
          {row.state === "OUTCOME" ? "SUCCESS | FAILED" : row.state}
          {row.at ? "  ·  " + formatTime(row.at) : ""}
        </Text>
      </View>
    </Animated.View>
  );
}

const DOT = 22;

const styles = StyleSheet.create({
  row: { flexDirection: "row", minHeight: 52 },
  rail: { width: DOT, alignItems: "center", marginRight: spacing.md },
  dot: { width: DOT, height: DOT, borderRadius: DOT / 2, alignItems: "center", justifyContent: "center" },
  dotPending: { borderWidth: 2, borderColor: colors.handle },
  activeCore: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.onAccent },
  pulse: { position: "absolute", width: DOT, height: DOT, borderRadius: DOT / 2, backgroundColor: colors.primary },
  line: { flex: 1, width: 2, backgroundColor: colors.border, marginVertical: 3, borderRadius: 1 },
  lineReached: { backgroundColor: colors.primary },
  content: { flex: 1, paddingBottom: spacing.md },
  label: { ...type.bodyStrong, lineHeight: 22 },
  labelPending: { color: colors.textFaint, fontWeight: "500" },
  meta: { ...type.caption, fontSize: 12, letterSpacing: 0.3, ...tabular },
});
