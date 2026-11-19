import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Easing } from "react-native";
import Svg, { Circle, Defs, LinearGradient, Path, RadialGradient, Rect, Stop } from "react-native-svg";
import useReduceMotion from "../hooks/useReduceMotion";

/**
 * PayBridge mark (same as the web logo): a suspension bridge with a gold coin
 * travelling across the arch — money crossing between currencies.
 * The coin loops along the arch; it rests at the top when Reduce Motion is on.
 */
const AnimatedCircle = Animated.createAnimatedComponent(Circle);

// Arch: cubic Bézier P0(9,27) P1(13,13) P2(27,13) P3(31,27) in a 40×40 box.
function bezier(t) {
  const u = 1 - t;
  const x = u * u * u * 9 + 3 * u * u * t * 13 + 3 * u * t * t * 27 + t * t * t * 31;
  const y = u * u * u * 27 + 3 * u * u * t * 13 + 3 * u * t * t * 13 + t * t * t * 27;
  return { x, y };
}

export default function BrandLogo({ size = 40 }) {
  const reduce = useReduceMotion();
  const progress = useRef(new Animated.Value(0.5)).current;

  const { inputRange, xs, ys } = useMemo(() => {
    const steps = 24;
    const input = [];
    const x = [];
    const y = [];
    for (let i = 0; i <= steps; i++) {
      const p = bezier(i / steps);
      input.push(i / steps);
      x.push(p.x);
      y.push(p.y);
    }
    return { inputRange: input, xs: x, ys: y };
  }, []);

  useEffect(() => {
    if (reduce) {
      progress.setValue(0.5);
      return undefined;
    }
    progress.setValue(0);
    const loop = Animated.loop(
      Animated.timing(progress, { toValue: 1, duration: 2800, easing: Easing.inOut(Easing.cubic), useNativeDriver: false })
    );
    loop.start();
    return () => loop.stop();
  }, [reduce, progress]);

  const cx = progress.interpolate({ inputRange, outputRange: xs });
  const cy = progress.interpolate({ inputRange, outputRange: ys });

  return (
    <Svg width={size} height={size} viewBox="0 0 40 40" accessible={false}>
      <Defs>
        <LinearGradient id="pbBg" x1="0" y1="0" x2="1" y2="1">
          <Stop offset="0" stopColor="#60A5FA" />
          <Stop offset="0.45" stopColor="#2563EB" />
          <Stop offset="1" stopColor="#1E3A8A" />
        </LinearGradient>
        <RadialGradient id="pbShine" cx="0.25" cy="0.15" r="0.8">
          <Stop offset="0" stopColor="#FFFFFF" stopOpacity="0.45" />
          <Stop offset="0.6" stopColor="#FFFFFF" stopOpacity="0" />
        </RadialGradient>
      </Defs>
      <Rect width="40" height="40" rx="12" fill="url(#pbBg)" />
      <Rect width="40" height="40" rx="12" fill="url(#pbShine)" />
      <Path d="M14 18.8V27M20 16.6V27M26 18.8V27" stroke="#FFFFFF" strokeOpacity={0.5} strokeWidth={1.6} strokeLinecap="round" />
      <Path d="M6.5 27.5H33.5" stroke="#FFFFFF" strokeOpacity={0.75} strokeWidth={2.2} strokeLinecap="round" />
      <Path d="M9 27 C 13 13, 27 13, 31 27" fill="none" stroke="#FFFFFF" strokeWidth={3.2} strokeLinecap="round" />
      <AnimatedCircle cx={cx} cy={cy} r={2.7} fill="#FCD34D" stroke="#FFFFFF" strokeWidth={1} />
    </Svg>
  );
}
