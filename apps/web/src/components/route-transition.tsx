import { motion, useReducedMotion } from "motion/react";
import type { ReactNode } from "react";

export function RouteTransition({
  children,
  routeKey
}: {
  children: ReactNode;
  routeKey: string;
}) {
  const reduce = useReducedMotion();

  return (
    <motion.div
      key={routeKey}
      initial={reduce ? { opacity: 0 } : { opacity: 0, y: 6 }}
      animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0 }}
      transition={{ duration: 0.18, ease: [0.2, 1, 0.2, 1] }}
    >
      {children}
    </motion.div>
  );
}
