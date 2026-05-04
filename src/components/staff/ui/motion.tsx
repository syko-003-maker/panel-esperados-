"use client";

import type { ReactNode } from "react";
import {
  MotionConfig,
  motion,
  type HTMLMotionProps,
  type Variants,
} from "motion/react";
import { cn } from "@/lib/utils";

// Easing premium (cubic-bezier doux, accélération maîtrisée)
export const STAFF_EASE: [number, number, number, number] = [0.22, 1, 0.36, 1];
export const STAFF_EASE_OUT: [number, number, number, number] = [0.16, 1, 0.3, 1];

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
      whileHover={{ y: -2 }}
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
      whileHover={{ y: -1, scale: 1.02 }}
      whileTap={{ y: 0, scale: 0.98 }}
      transition={{ duration: 0.18, ease: STAFF_EASE }}
    >
      {children}
    </motion.div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Scroll-triggered reveal : fade + translateY au moment où l'élément
 * entre dans le viewport. `once: true` garantit qu'on ne rejoue pas.
 * ──────────────────────────────────────────────────────────────────────── */

const fadeInVariants: Variants = {
  hidden: { opacity: 0, y: 14 },
  visible: { opacity: 1, y: 0 },
};

export function MotionFadeIn({
  children,
  className,
  delay = 0,
  amount = 0.15,
  ...props
}: MotionSurfaceProps & { amount?: number }) {
  return (
    <motion.div
      className={className}
      variants={fadeInVariants}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount }}
      transition={{ duration: 0.42, ease: STAFF_EASE_OUT, delay }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Stagger grid : enfants apparaissent en cascade quand le parent entre
 * dans le viewport. À utiliser pour grilles de cartes (membres, sanctions…)
 * ──────────────────────────────────────────────────────────────────────── */

const staggerParent: Variants = {
  hidden: {},
  visible: {
    transition: { staggerChildren: 0.04, delayChildren: 0.05 },
  },
};

const staggerChild: Variants = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0 },
};

export function MotionStaggerGrid({
  children,
  className,
  amount = 0.08,
  ...props
}: MotionSurfaceProps & { amount?: number }) {
  return (
    <motion.div
      className={className}
      variants={staggerParent}
      initial="hidden"
      whileInView="visible"
      viewport={{ once: true, amount }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

export function MotionStaggerItem({ children, className, ...props }: MotionSurfaceProps) {
  return (
    <motion.div
      className={cn("will-change-transform", className)}
      variants={staggerChild}
      transition={{ duration: 0.34, ease: STAFF_EASE_OUT }}
      {...props}
    >
      {children}
    </motion.div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────
 * Page transition : fade-in à chaque navigation. À monter dans le layout
 * staff au-dessus de {children}.
 * ──────────────────────────────────────────────────────────────────────── */

export function MotionPageTransition({
  children,
  pathname,
}: {
  children: ReactNode;
  pathname: string;
}) {
  return (
    <motion.div
      key={pathname}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.32, ease: STAFF_EASE_OUT }}
    >
      {children}
    </motion.div>
  );
}
