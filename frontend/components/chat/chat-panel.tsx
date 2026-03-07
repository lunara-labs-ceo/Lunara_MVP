"use client";

import { useCallback, useMemo } from "react";
import { MessageSquare } from "lucide-react";
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
import { Suggestion, Suggestions } from "@/components/ai-elements/suggestion";
import { ChatMessageComponent } from "@/components/chat/chat-message";
import type { ChatMessage } from "@/types/chat";
import type { ChatStatus } from "ai";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ChatPanelProps {
  messages: ChatMessage[];
  isStreaming: boolean;
  streamingText: string;
  streamingThinking: string;
  isThinkingStreaming: boolean;
  onSendMessage: (message: string) => void;
  onRunSql: (sql: string) => void;
  onStopStreaming?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ChatPanel({
  messages,
  isStreaming,
  streamingText,
  streamingThinking,
  isThinkingStreaming,
  onSendMessage,
  onRunSql,
  onStopStreaming,
}: ChatPanelProps) {
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
  const streamingMessage: ChatMessage | null = useMemo(() => {
    if (!isStreaming) return null;
    if (!streamingText && !streamingThinking) return null;
    return {
      role: "assistant" as const,
      content: streamingText,
      thinking: streamingThinking || null,
      timestamp: new Date().toISOString(),
    };
  }, [isStreaming, streamingText, streamingThinking]);

  return (
    <div className="flex h-full flex-col">
      {/* ---- Conversation area ---- */}
      <Conversation>
        <ConversationContent>
          {!hasMessages ? (
            <ConversationEmptyState>
              <div className="flex flex-col items-center gap-4 px-4">
                <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
                  <MessageSquare className="size-6 text-primary" />
                </div>
                <div className="space-y-1.5 text-center">
                  <h3 className="text-base font-semibold">Hey, I&apos;m Luna</h3>
                  <p className="text-sm text-muted-foreground">
                    Your data analyst. Ask me anything about your database — I&apos;ll explore, write queries, and surface what matters.
                  </p>
                </div>
                <div className="mt-2 flex flex-col gap-2 w-full max-w-[280px]">
                  <Suggestion
                    suggestion="What data do I have?"
                    onClick={handleSuggestionClick}
                  />
                  <Suggestion
                    suggestion="Show me recent trends"
                    onClick={handleSuggestionClick}
                  />
                  <Suggestion
                    suggestion="Find my top performers"
                    onClick={handleSuggestionClick}
                  />
                  <Suggestion
                    suggestion="Any anomalies in the data?"
                    onClick={handleSuggestionClick}
                  />
                </div>
              </div>
            </ConversationEmptyState>
          ) : (
            <>
              {messages.map((msg, idx) => (
                <ChatMessageComponent
                  key={msg.timestamp ?? idx}
                  message={msg}
                  onRunSql={onRunSql}
                />
              ))}

              {/* Streaming message — rendered at the end while streaming */}
              {streamingMessage && (
                <ChatMessageComponent
                  message={streamingMessage}
                  isStreaming
                  isThinkingStreaming={isThinkingStreaming}
                  onRunSql={onRunSql}
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
          <PromptInputTextarea placeholder="Ask about your data..." />
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
          AI can make mistakes. Review generated SQL before running.
        </p>
      </div>
    </div>
  );
}
