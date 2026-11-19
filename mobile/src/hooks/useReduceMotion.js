import { useEffect, useState } from "react";
import { AccessibilityInfo } from "react-native";

/** true when the OS "Reduce motion" / "Remove animations" setting is on. */
export default function useReduceMotion() {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => alive && setReduce(!!v))
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", (v) => setReduce(!!v));
    return () => {
      alive = false;
      if (sub && sub.remove) sub.remove();
    };
  }, []);
  return reduce;
}
