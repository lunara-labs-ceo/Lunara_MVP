"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentProps,
  type ReactNode,
} from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { Shimmer } from "./shimmer";

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

interface ReasoningContextValue {
  isStreaming: boolean;
  isOpen: boolean;
  setIsOpen: (open: boolean) => void;
  duration: number | undefined;
}

const ReasoningContext = createContext<ReasoningContextValue>({
  isStreaming: false,
  isOpen: false,
  setIsOpen: () => {},
  duration: undefined,
});

export function useReasoning() {
  return useContext(ReasoningContext);
}

// ---------------------------------------------------------------------------
// Reasoning (root)
// ---------------------------------------------------------------------------

interface ReasoningProps extends Omit<ComponentProps<"div">, "children"> {
  isStreaming?: boolean;
  defaultOpen?: boolean;
  duration?: number;
  children: ReactNode;
}

export function Reasoning({
  isStreaming = false,
  defaultOpen = true,
  duration,
  children,
  className,
  ...props
}: ReasoningProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const [hasEverStreamed, setHasEverStreamed] = useState(false);
  const [hasAutoClosed, setHasAutoClosed] = useState(false);
  const startTimeRef = useRef<number | null>(null);
  const [elapsed, setElapsed] = useState<number | undefined>(duration);

  // Track streaming start time
  useEffect(() => {
    if (isStreaming) {
      setHasEverStreamed(true);
      setHasAutoClosed(false);
      if (!startTimeRef.current) {
        startTimeRef.current = Date.now();
      }
    } else if (startTimeRef.current) {
      setElapsed(Math.round((Date.now() - startTimeRef.current) / 1000));
      startTimeRef.current = null;
    }
  }, [isStreaming]);

  // Auto-open when streaming starts
  useEffect(() => {
    if (isStreaming && !isOpen) {
      setIsOpen(true);
    }
  }, [isStreaming, isOpen]);

  // Auto-close 1s after streaming ends
  useEffect(() => {
    if (hasEverStreamed && !isStreaming && isOpen && !hasAutoClosed) {
      const timer = setTimeout(() => {
        setIsOpen(false);
        setHasAutoClosed(true);
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [isStreaming, isOpen, hasAutoClosed, hasEverStreamed]);

  return (
    <ReasoningContext.Provider
      value={{ isStreaming, isOpen, setIsOpen, duration: elapsed }}
    >
      <Collapsible open={isOpen} onOpenChange={setIsOpen}>
        <div
          className={cn(
            "rounded-lg border bg-muted/30 transition-colors",
            isStreaming && "border-primary/20",
            className
          )}
          {...props}
        >
          {children}
        </div>
      </Collapsible>
    </ReasoningContext.Provider>
  );
}

// ---------------------------------------------------------------------------
// ReasoningTrigger
// ---------------------------------------------------------------------------

interface ReasoningTriggerProps extends ComponentProps<"button"> {
  getThinkingMessage?: (
    isStreaming: boolean,
    duration?: number
  ) => ReactNode;
}

function defaultThinkingMessage(
  isStreaming: boolean,
  duration?: number
): ReactNode {
  if (isStreaming) {
    return <Shimmer className="text-xs font-medium">Thinking...</Shimmer>;
  }
  if (duration != null && duration > 0) {
    return (
      <span className="text-xs font-medium text-muted-foreground">
        Thought for {duration}s
      </span>
    );
  }
  return (
    <span className="text-xs font-medium text-muted-foreground">
      Reasoning
    </span>
  );
}

export function ReasoningTrigger({
  getThinkingMessage,
  className,
  ...props
}: ReasoningTriggerProps) {
  const { isStreaming, isOpen, duration } = useReasoning();
  const messageFn = getThinkingMessage ?? defaultThinkingMessage;

  return (
    <CollapsibleTrigger asChild>
      <button
        className={cn(
          "flex w-full items-center gap-2 px-3 py-2 text-left transition-colors hover:bg-muted/50 rounded-t-lg",
          !isOpen && "rounded-b-lg",
          className
        )}
        {...props}
      >
        <div className="flex items-center gap-2 flex-1">
          {isStreaming && (
            <span className="relative flex size-2">
              <span className="absolute inline-flex size-full animate-ping rounded-full bg-primary/60" />
              <span className="relative inline-flex size-2 rounded-full bg-primary" />
            </span>
          )}
          {messageFn(isStreaming, duration)}
        </div>
        <ChevronDown
          className={cn(
            "size-3.5 text-muted-foreground transition-transform duration-200",
            isOpen && "rotate-180"
          )}
        />
      </button>
    </CollapsibleTrigger>
  );
}

// ---------------------------------------------------------------------------
// ReasoningContent
// ---------------------------------------------------------------------------

interface ReasoningContentProps extends ComponentProps<"div"> {
  children: string;
}

export function ReasoningContent({
  children,
  className,
  ...props
}: ReasoningContentProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const { isStreaming } = useReasoning();

  // Auto-scroll to bottom during streaming
  const scrollToBottom = useCallback(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, []);

  useEffect(() => {
    if (isStreaming) {
      scrollToBottom();
    }
  }, [children, isStreaming, scrollToBottom]);

  return (
    <CollapsibleContent>
      <div
        ref={scrollRef}
        className={cn(
          "max-h-48 overflow-y-auto border-t border-border/50 px-3 py-2",
          className
        )}
        {...props}
      >
        <div className="whitespace-pre-wrap text-xs leading-relaxed text-muted-foreground font-mono">
          {children}
          {isStreaming && (
            <span className="inline-block ml-0.5 w-1.5 h-3.5 bg-primary/60 animate-pulse" />
          )}
        </div>
      </div>
    </CollapsibleContent>
  );
}
