import { useEffect, useRef, useState } from "react";
import { formatMoney } from "@/money";

export function AnimatedMoney({
  minorUnits,
  currency,
  className
}: {
  minorUnits: number;
  currency: string;
  className?: string;
}) {
  const [display, setDisplay] = useState(minorUnits);
  const previous = useRef(minorUnits);

  useEffect(() => {
    const from = previous.current;
    const to = minorUnits;
    previous.current = minorUnits;

    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)"
    ).matches;
    if (reduceMotion || from === to) {
      setDisplay(to);
      return;
    }

    const duration = 650;
    const start = performance.now();
    let frame = 0;

    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(from + (to - from) * eased));
      if (progress < 1) {
        frame = requestAnimationFrame(step);
      }
    };

    frame = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frame);
  }, [minorUnits]);

  return <span className={className}>{formatMoney(display, currency)}</span>;
}
