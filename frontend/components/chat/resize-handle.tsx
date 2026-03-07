"use client";

import { cn } from "@/lib/utils";

interface ResizeHandleProps {
  direction: "horizontal" | "vertical";
  isDragging: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
}

export function ResizeHandle({
  direction,
  isDragging,
  onMouseDown,
}: ResizeHandleProps) {
  const isVertical = direction === "vertical";

  return (
    <div
      role="separator"
      aria-orientation={isVertical ? "vertical" : "horizontal"}
      onMouseDown={onMouseDown}
      className={cn(
        "relative shrink-0 select-none transition-colors",
        isVertical
          ? "w-[5px] cursor-col-resize"
          : "h-[5px] cursor-row-resize",
        // center line
        "after:absolute after:content-['']",
        isVertical
          ? "after:left-[2px] after:top-0 after:h-full after:w-px"
          : "after:top-[2px] after:left-0 after:w-full after:h-px",
        // colors
        isDragging
          ? "after:bg-primary bg-primary/10"
          : "after:bg-border hover:after:bg-primary/30 hover:bg-primary/5"
      )}
    />
  );
}
