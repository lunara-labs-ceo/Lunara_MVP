"use client";

import { useCallback, useState } from "react";
import { Copy, Check } from "lucide-react";
import {
  Message,
  MessageContent,
  MessageResponse,
  MessageActions,
  MessageAction,
} from "@/components/ai-elements/message";
import { CollapsibleCode } from "./collapsible-code";
import type { ReportMessage, CodeBlock } from "@/types/report";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ReportMessageProps {
  message: ReportMessage;
  isStreaming?: boolean;
  streamingCodeBlocks?: CodeBlock[];
}

// ---------------------------------------------------------------------------
// ReportMessageComponent
// ---------------------------------------------------------------------------

export function ReportMessageComponent({
  message,
  isStreaming = false,
  streamingCodeBlocks,
}: ReportMessageProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(message.content).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [message.content]);

  // User messages
  if (message.role === "user") {
    return (
      <Message from="user">
        <MessageContent>{message.content}</MessageContent>
      </Message>
    );
  }

  // Assistant messages
  const displayContent = message.content;

  // Use streaming code blocks during streaming, otherwise use message code blocks
  const codeBlocks = isStreaming
    ? streamingCodeBlocks ?? []
    : message.codeBlocks ?? [];

  return (
    <Message from="assistant">
      <MessageContent>
        {displayContent && (
          <MessageResponse>{displayContent}</MessageResponse>
        )}
      </MessageContent>

      {/* Code blocks rendered as collapsible sections */}
      {codeBlocks.length > 0 &&
        codeBlocks.map((block, idx) => (
          <CollapsibleCode
            key={idx}
            code={block.code}
            language={block.language}
          />
        ))}

      {/* Action buttons — only shown for completed assistant messages */}
      {!isStreaming && displayContent && (
        <MessageActions>
          <MessageAction
            tooltip={copied ? "Copied!" : "Copy"}
            onClick={handleCopy}
          >
            {copied ? (
              <Check className="size-3.5" />
            ) : (
              <Copy className="size-3.5" />
            )}
          </MessageAction>
        </MessageActions>
      )}
    </Message>
  );
}
