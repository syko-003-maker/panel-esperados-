"use client";

import type { ReactNode } from "react";
import { MotionConfig, motion, useReducedMotion, type HTMLMotionProps } from "motion/react";
import { cn } from "@/lib/utils";

export const STAFF_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];

export function StaffMotionProvider({ children }: { children: ReactNode }) {
  return (
    <MotionConfig
      reducedMotion="user"
      transition={{ duration: 0.24, ease: STAFF_EASE }}
    >
      {children}
    </MotionConfig>
  );
}

type MotionSurfaceProps = Omit<HTMLMotionProps<"div">, "children"> & {
  children: ReactNode;
  delay?: number;
};

export function MotionSection({ children, className, delay = 0, ...props }: MotionSurfaceProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial={shouldReduceMotion ? false : { opacity: 0, y: 14 }}
      animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
      transition={shouldReduceMotion ? undefined : { duration: 0.34, ease: STAFF_EASE, delay }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function MotionCard({ children, className, delay = 0, ...props }: MotionSurfaceProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      className={className}
      initial={shouldReduceMotion ? false : { opacity: 0, y: 10 }}
      animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
      whileHover={shouldReduceMotion ? undefined : { y: -2, scale: 1.002 }}
      transition={shouldReduceMotion ? undefined : { duration: 0.26, ease: STAFF_EASE, delay }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function MotionListItem({ children, className, delay = 0, ...props }: MotionSurfaceProps) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      className={cn("will-change-transform", className)}
      initial={shouldReduceMotion ? false : { opacity: 0, y: 8 }}
      animate={shouldReduceMotion ? undefined : { opacity: 1, y: 0 }}
      whileHover={shouldReduceMotion ? undefined : { y: -1 }}
      transition={shouldReduceMotion ? undefined : { duration: 0.22, ease: STAFF_EASE, delay }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function MotionButtonFrame({ children, className }: { children: ReactNode; className?: string }) {
  const shouldReduceMotion = useReducedMotion();

  return (
    <motion.div
      className={cn("inline-flex", className)}
      whileHover={shouldReduceMotion ? undefined : { scale: 1.015, y: -1 }}
      whileTap={shouldReduceMotion ? undefined : { scale: 0.985 }}
      transition={shouldReduceMotion ? undefined : { duration: 0.18, ease: STAFF_EASE }}
    >
      {children}
    </motion.div>
  );
}