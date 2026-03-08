"use client";

import { useCallback, useMemo } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import {
  PromptInput,
  PromptInputTextarea,
  PromptInputSubmit,
  PromptInputFooter,
  PromptInputTools,
  type PromptInputMessage,
} from "@/components/ai-elements/prompt-input";
import { Suggestion } from "@/components/ai-elements/suggestion";
import { ReportMessageComponent } from "./report-message";
import type { ReportMessage, CodeBlock } from "@/types/report";
import type { ChatStatus } from "ai";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ReportChatPanelProps {
  messages: ReportMessage[];
  isStreaming: boolean;
  streamingText: string;
  streamingCodeBlocks: CodeBlock[];
  statusText: string;
  onSendMessage: (message: string) => void;
  onStopStreaming?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReportChatPanel({
  messages,
  isStreaming,
  streamingText,
  streamingCodeBlocks,
  statusText,
  onSendMessage,
  onStopStreaming,
}: ReportChatPanelProps) {
  // Map isStreaming boolean to ChatStatus for PromptInputSubmit
  const promptStatus: ChatStatus = useMemo(
    () => (isStreaming ? "streaming" : "ready"),
    [isStreaming]
  );

  // Handle form submission from PromptInput
  const handleSubmit = useCallback(
    (msg: PromptInputMessage) => {
      const text = msg.text.trim();
      if (!text) return;
      onSendMessage(text);
    },
    [onSendMessage]
  );

  // Handle suggestion click — send the suggestion text as a message
  const handleSuggestionClick = useCallback(
    (suggestion: string) => {
      onSendMessage(suggestion);
    },
    [onSendMessage]
  );

  const hasMessages = messages.length > 0 || isStreaming;

  // Build the streaming message (shown at the end during active streaming)
  const streamingMessage: ReportMessage | null = useMemo(() => {
    if (!isStreaming) return null;
    if (!streamingText && streamingCodeBlocks.length === 0) return null;
    return {
      role: "assistant" as const,
      content: streamingText,
      codeBlocks: streamingCodeBlocks,
      timestamp: new Date().toISOString(),
    };
  }, [isStreaming, streamingText, streamingCodeBlocks]);

  return (
    <div className="flex h-full flex-col">
      {/* ---- Status indicator ---- */}
      {statusText && isStreaming && (
        <div className="flex items-center gap-1.5 border-b border-border px-3 py-1.5">
          <Loader2 className="size-3 animate-spin text-muted-foreground" />
          <span className="text-xs text-muted-foreground">{statusText}</span>
        </div>
      )}

      {/* ---- Conversation area ---- */}
      <Conversation>
        <ConversationContent>
          {!hasMessages ? (
            <ConversationEmptyState>
              <div className="flex flex-col items-center gap-4 px-4">
                <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
                  <Sparkles className="size-6 text-primary" />
                </div>
                <div className="space-y-1.5 text-center">
                  <h3 className="text-base font-semibold">
                    Hey, I&apos;m your Report Copilot
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    I can help you build reports from your saved data — charts,
                    narratives, executive summaries, and more.
                  </p>
                </div>
                <div className="mt-2 flex flex-col gap-2 w-full max-w-[280px]">
                  <Suggestion
                    suggestion="Summarize my data"
                    onClick={handleSuggestionClick}
                  />
                  <Suggestion
                    suggestion="Create a revenue chart"
                    onClick={handleSuggestionClick}
                  />
                  <Suggestion
                    suggestion="Build an executive report"
                    onClick={handleSuggestionClick}
                  />
                  <Suggestion
                    suggestion="What stories does the data tell?"
                    onClick={handleSuggestionClick}
                  />
                </div>
              </div>
            </ConversationEmptyState>
          ) : (
            <>
              {messages.map((msg, idx) => (
                <ReportMessageComponent
                  key={msg.timestamp ?? idx}
                  message={msg}
                />
              ))}

              {/* Streaming message — rendered at the end while streaming */}
              {streamingMessage && (
                <ReportMessageComponent
                  message={streamingMessage}
                  isStreaming
                  streamingCodeBlocks={streamingCodeBlocks}
                />
              )}
            </>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      {/* ---- Input area ---- */}
      <div className="border-t border-border p-3">
        <PromptInput onSubmit={handleSubmit}>
          <PromptInputTextarea placeholder="Describe the report you want to build..." />
          <PromptInputFooter>
            <PromptInputTools>
              <PromptInputSubmit
                status={promptStatus}
                onStop={onStopStreaming}
              />
            </PromptInputTools>
          </PromptInputFooter>
        </PromptInput>
        <p className="mt-1.5 text-center text-[10px] text-muted-foreground">
          AI can make mistakes. Review generated reports.
        </p>
      </div>
    </div>
  );
}
