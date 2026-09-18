import { useEffect, useRef, useState } from "react";
import { formatMoney } from "@/money";

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

export function AnimatedMoney({
  minorUnits,
  currency,
  className,
  animateOnMount = false
}: {
  minorUnits: number;
  currency: string;
  className?: string;
  animateOnMount?: boolean;
}) {
  const [display, setDisplay] = useState(() => {
    if (!animateOnMount || prefersReducedMotion()) {
      return minorUnits;
    }
    return 0;
  });
  const displayRef = useRef(display);

  useEffect(() => {
    const from = displayRef.current;
    const to = minorUnits;

    if (prefersReducedMotion() || from === to) {
      displayRef.current = to;
      setDisplay(to);
      return;
    }

    const duration = 650;
    const start = performance.now();
    let frame = 0;

    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const value = Math.round(from + (to - from) * eased);
      displayRef.current = value;
      setDisplay(value);
      if (progress < 1) {
        frame = requestAnimationFrame(step);
      } else {
        displayRef.current = to;
      }
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [minorUnits]);

  return <span className={className}>{formatMoney(display, currency)}</span>;
}
