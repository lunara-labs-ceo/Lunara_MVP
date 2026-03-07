"use client";

import { useState, useCallback, useEffect, useRef } from "react";

interface UseResizeOptions {
  direction: "horizontal" | "vertical";
  initialSize: number;
  minSize: number;
  maxSize: number;
  /** When true, negates the drag delta so that dragging toward smaller coordinates increases size. Useful for right-side or bottom panels. */
  reverse?: boolean;
}

export function useResize({ direction, initialSize, minSize, maxSize, reverse = false }: UseResizeOptions) {
  const [size, setSize] = useState(initialSize);
  const [isDragging, setIsDragging] = useState(false);
  const startPos = useRef(0);
  const startSize = useRef(0);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setIsDragging(true);
      startPos.current = direction === "horizontal" ? e.clientY : e.clientX;
      startSize.current = size;
    },
    [direction, size]
  );

  useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const currentPos = direction === "horizontal" ? e.clientY : e.clientX;
      const rawDelta = currentPos - startPos.current;
      const delta = reverse ? -rawDelta : rawDelta;
      const newSize = Math.min(maxSize, Math.max(minSize, startSize.current + delta));
      setSize(newSize);
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    document.body.style.userSelect = "none";
    document.body.style.cursor = direction === "horizontal" ? "row-resize" : "col-resize";

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, direction, minSize, maxSize, reverse]);

  return { size, isDragging, handleMouseDown };
}
