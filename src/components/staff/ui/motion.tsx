"use client";

import type { ReactNode } from "react";
import { MotionConfig, motion, type HTMLMotionProps } from "motion/react";
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
  return (
    <motion.div
      className={className}
      transition={{ duration: 0.34, ease: STAFF_EASE, delay }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function MotionCard({ children, className, delay = 0, ...props }: MotionSurfaceProps) {
  return (
    <motion.div
      className={className}
      whileHover={{ y: -2, scale: 1.002 }}
      transition={{ duration: 0.26, ease: STAFF_EASE, delay }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function MotionListItem({ children, className, delay = 0, ...props }: MotionSurfaceProps) {
  return (
    <motion.div
      className={cn("will-change-transform", className)}
      whileHover={{ y: -1 }}
      transition={{ duration: 0.22, ease: STAFF_EASE, delay }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function MotionButtonFrame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <motion.div
      className={cn("inline-flex", className)}
      whileHover={{ scale: 1.015, y: -1 }}
      whileTap={{ scale: 0.985 }}
      transition={{ duration: 0.18, ease: STAFF_EASE }}
    >
      {children}
    </motion.div>
  );
}