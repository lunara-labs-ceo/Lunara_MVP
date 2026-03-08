"use client";

import { useState, useCallback } from "react";
import { ChevronRight, ChevronDown, Copy, Check } from "lucide-react";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CollapsibleCodeProps {
  code: string;
  language: string;
  defaultExpanded?: boolean;
}

// ---------------------------------------------------------------------------
// CollapsibleCode
// ---------------------------------------------------------------------------

export function CollapsibleCode({
  code,
  language,
  defaultExpanded = false,
}: CollapsibleCodeProps) {
  const [isExpanded, setIsExpanded] = useState(defaultExpanded);
  const [copied, setCopied] = useState(false);

  const handleToggle = useCallback(() => {
    setIsExpanded((prev) => !prev);
  }, []);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(code).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [code]);

  return (
    <div className="mt-2 border border-border rounded-md overflow-hidden">
      <button
        type="button"
        onClick={handleToggle}
        className="flex w-full items-center gap-1.5 px-3 py-2 text-xs text-muted-foreground hover:text-foreground transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="size-3.5" />
        ) : (
          <ChevronRight className="size-3.5" />
        )}
        <span>View generated code</span>
        {language && (
          <span className="ml-auto text-[10px] uppercase opacity-60">
            {language}
          </span>
        )}
      </button>

      {isExpanded && (
        <div className="relative">
          <button
            type="button"
            onClick={handleCopy}
            className="absolute right-2 top-2 flex items-center justify-center size-6 rounded-md bg-background/80 text-muted-foreground hover:text-foreground transition-colors"
            aria-label={copied ? "Copied" : "Copy code"}
          >
            {copied ? (
              <Check className="size-3" />
            ) : (
              <Copy className="size-3" />
            )}
          </button>
          <pre className="bg-muted rounded-b-md p-3 text-xs overflow-x-auto font-mono">
            <code>{code}</code>
          </pre>
        </div>
      )}
    </div>
  );
}
