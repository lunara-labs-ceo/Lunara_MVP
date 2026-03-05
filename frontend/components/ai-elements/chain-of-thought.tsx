"use client";

import { useState, type ComponentProps, type ReactNode } from "react";
import { ChevronDown, DotIcon, type LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

// ---------------------------------------------------------------------------
// ChainOfThought (root)
// ---------------------------------------------------------------------------

interface ChainOfThoughtProps extends Omit<ComponentProps<"div">, "children"> {
  defaultOpen?: boolean;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  children: ReactNode;
}

export function ChainOfThought({
  defaultOpen = false,
  open: controlledOpen,
  onOpenChange,
  children,
  className,
  ...props
}: ChainOfThoughtProps) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isOpen = controlledOpen ?? uncontrolledOpen;
  const setIsOpen = onOpenChange ?? setUncontrolledOpen;

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className={cn("rounded-lg border bg-card", className)} {...props}>
        {children}
      </div>
    </Collapsible>
  );
}

// ---------------------------------------------------------------------------
// ChainOfThoughtHeader
// ---------------------------------------------------------------------------

interface ChainOfThoughtHeaderProps extends ComponentProps<"button"> {
  children?: ReactNode;
}

export function ChainOfThoughtHeader({
  children,
  className,
  ...props
}: ChainOfThoughtHeaderProps) {
  return (
    <CollapsibleTrigger asChild>
      <button
        className={cn(
          "flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium transition-colors hover:bg-muted/50 rounded-lg",
          className
        )}
        {...props}
      >
        <span className="flex-1">{children}</span>
        <ChevronDown className="size-4 text-muted-foreground transition-transform duration-200 data-[state=open]:rotate-180" />
      </button>
    </CollapsibleTrigger>
  );
}

// ---------------------------------------------------------------------------
// ChainOfThoughtContent
// ---------------------------------------------------------------------------

interface ChainOfThoughtContentProps extends ComponentProps<"div"> {
  children: ReactNode;
}

export function ChainOfThoughtContent({
  children,
  className,
  ...props
}: ChainOfThoughtContentProps) {
  return (
    <CollapsibleContent>
      <div
        className={cn("border-t px-4 py-3 space-y-1", className)}
        {...props}
      >
        {children}
      </div>
    </CollapsibleContent>
  );
}

// ---------------------------------------------------------------------------
// ChainOfThoughtStep
// ---------------------------------------------------------------------------

type StepStatus = "complete" | "active" | "pending" | "error";

interface ChainOfThoughtStepProps extends ComponentProps<"div"> {
  icon?: LucideIcon;
  iconClassName?: string;
  label: ReactNode;
  description?: ReactNode;
  status?: StepStatus;
  children?: ReactNode;
}

const stepStatusStyles: Record<StepStatus, string> = {
  active: "text-foreground",
  complete: "text-muted-foreground",
  pending: "text-muted-foreground/40",
  error: "text-destructive",
};

const stepIconStyles: Record<StepStatus, string> = {
  active: "text-primary",
  complete: "text-emerald-500",
  pending: "text-muted-foreground/30",
  error: "text-destructive",
};

export function ChainOfThoughtStep({
  icon: Icon = DotIcon,
  iconClassName,
  label,
  description,
  status = "pending",
  children,
  className,
  ...props
}: ChainOfThoughtStepProps) {
  return (
    <div
      className={cn(
        "flex gap-3 py-2 transition-opacity",
        status === "pending" && "opacity-50",
        className
      )}
      {...props}
    >
      {/* Step icon */}
      <div className="flex shrink-0 pt-0.5">
        <Icon
          className={cn("size-4", stepIconStyles[status], iconClassName)}
        />
      </div>

      {/* Step content */}
      <div className="flex-1 min-w-0 space-y-2">
        <div>
          <p
            className={cn(
              "text-sm font-medium leading-tight",
              stepStatusStyles[status]
            )}
          >
            {label}
          </p>
          {description && (
            <p className="text-xs text-muted-foreground mt-0.5">
              {description}
            </p>
          )}
        </div>

        {/* Nested content (e.g., Reasoning block) */}
        {children && <div className="mt-1">{children}</div>}
      </div>
    </div>
  );
}
