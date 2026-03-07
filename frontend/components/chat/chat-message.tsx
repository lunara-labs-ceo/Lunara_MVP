"use client";

import { useCallback, useState } from "react";
import { Play, Copy, Check } from "lucide-react";
import {
  Message,
  MessageContent,
  MessageResponse,
  MessageActions,
  MessageAction,
} from "@/components/ai-elements/message";
import {
  Reasoning,
  ReasoningContent,
  ReasoningTrigger,
} from "@/components/ai-elements/reasoning";
import type { ChatMessage } from "@/types/chat";

// ---------------------------------------------------------------------------
// Content cleaning — old Supabase messages may have raw JSON payloads
// ---------------------------------------------------------------------------

function cleanContent(raw: string): string {
  if (!raw) return "";

  const trimmed = raw.trim();

  // Attempt to parse raw JSON like {"explanation": "...", "sql_query": "..."}
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed);
      if (typeof parsed === "object" && parsed !== null) {
        // Prefer "explanation" field, fall back to "content" or "message"
        const text =
          parsed.explanation ?? parsed.content ?? parsed.message ?? null;
        if (typeof text === "string" && text.length > 0) {
          return text;
        }
      }
    } catch {
      // Not valid JSON — return as-is
    }
  }

  return raw;
}

// ---------------------------------------------------------------------------
// ChatMessageComponent
// ---------------------------------------------------------------------------

interface ChatMessageProps {
  message: ChatMessage;
  isStreaming?: boolean;
  isThinkingStreaming?: boolean;
  onRunSql?: (sql: string) => void;
}

export function ChatMessageComponent({
  message,
  isStreaming = false,
  isThinkingStreaming = false,
  onRunSql,
}: ChatMessageProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = useCallback(() => {
    const text = cleanContent(message.content);
    navigator.clipboard.writeText(text).then(() => {
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
  const displayContent = cleanContent(message.content);

  return (
    <Message from="assistant">
      <MessageContent>
        {/* Reasoning / thinking block */}
        {message.thinking && (
          <Reasoning isStreaming={isStreaming && isThinkingStreaming}>
            <ReasoningTrigger />
            <ReasoningContent>{message.thinking}</ReasoningContent>
          </Reasoning>
        )}

        {/* Main content rendered with streaming-safe markdown */}
        {displayContent && (
          <MessageResponse>{displayContent}</MessageResponse>
        )}
      </MessageContent>

      {/* Action buttons — only shown for completed assistant messages */}
      {!isStreaming && (
        <MessageActions>
          {message.sql && onRunSql && (
            <MessageAction
              tooltip="Run in Editor"
              onClick={() => onRunSql(message.sql!)}
            >
              <Play className="size-3.5" />
            </MessageAction>
          )}
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
