"use client";

import type { ComponentProps, ElementType } from "react";
import { cn } from "@/lib/utils";
import { motion } from "motion/react";

type ShimmerProps<T extends ElementType = "span"> = ComponentProps<T> & {
  as?: T;
  duration?: number;
};

export function Shimmer<T extends ElementType = "span">({
  as,
  className,
  duration = 2,
  style,
  ...props
}: ShimmerProps<T>) {
  const Component = as ?? "span";

  return (
    <Component
      className={cn("relative inline-block", className)}
      style={{ color: "transparent", ...style }}
      {...props}
    >
      <motion.span
        className="absolute inset-0 bg-gradient-to-r from-muted-foreground/40 via-muted-foreground via-muted-foreground/40 bg-clip-text text-transparent"
        style={{
          backgroundSize: "200% 100%",
          WebkitBackgroundClip: "text",
        }}
        animate={{
          backgroundPosition: ["150% center", "-50% center"],
        }}
        transition={{
          repeat: Infinity,
          duration,
          ease: "linear",
        }}
      >
        {props.children}
      </motion.span>
      {/* Invisible text to preserve layout size */}
      {props.children}
    </Component>
  );
}
