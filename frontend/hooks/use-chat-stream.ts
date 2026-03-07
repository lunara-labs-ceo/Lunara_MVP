"use client";

import { useState, useCallback, useRef } from "react";
import { useApiClient } from "@/lib/api";
import type { ChatMessage, ChatStreamEvent, SemanticModel } from "@/types/chat";

interface StreamOptions {
  dataSourceId: string;
  semanticModel: SemanticModel | null;
  sessionId: string | null;
  history: ChatMessage[];
}

interface UseChatStreamReturn {
  sendMessage: (message: string, opts: StreamOptions) => Promise<{
    fullText: string;
    thinkingText: string;
    generatedSql: string | null;
  }>;
  isStreaming: boolean;
  streamingText: string;
  streamingThinking: string;
  isThinkingStreaming: boolean;
  generatedSql: string | null;
  abortStream: () => void;
}

export function useChatStream(): UseChatStreamReturn {
  const { fetchApiStream } = useApiClient();
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [streamingThinking, setStreamingThinking] = useState("");
  const [isThinkingStreaming, setIsThinkingStreaming] = useState(false);
  const [generatedSql, setGeneratedSql] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const abortStream = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const sendMessage = useCallback(
    async (message: string, opts: StreamOptions) => {
      const { dataSourceId, semanticModel, sessionId, history } = opts;

      // Reset state
      setIsStreaming(true);
      setStreamingText("");
      setStreamingThinking("");
      setIsThinkingStreaming(false);
      setGeneratedSql(null);

      abortRef.current = new AbortController();

      let fullText = "";
      let thinkingText = "";
      let sql: string | null = null;

      try {
        const response = await fetchApiStream(
          `/api/v1/chat/query?data_source_id=${dataSourceId}`,
          {
            method: "POST",
            body: JSON.stringify({
              message,
              semantic_model: semanticModel,
              session_id: sessionId,
              history: history.map((m) => ({
                role: m.role,
                content: m.content,
                sql: m.sql || null,
              })),
            }),
            signal: abortRef.current.signal,
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`API ${response.status}: ${errorText}`);
        }

        const reader = response.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          // Keep the last potentially incomplete line in the buffer
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data: ")) continue;

            try {
              const event: ChatStreamEvent = JSON.parse(trimmed.slice(6));

              switch (event.type) {
                case "thinking":
                  thinkingText += event.content || "";
                  setStreamingThinking(thinkingText);
                  setIsThinkingStreaming(true);
                  break;

                case "text":
                  fullText += event.content || "";
                  setStreamingText(fullText);
                  // Once text starts, thinking phase is over
                  setIsThinkingStreaming(false);
                  break;

                case "sql":
                  sql = event.content || null;
                  setGeneratedSql(sql);
                  break;

                case "status":
                  // Route tool-usage status into thinking/reasoning display
                  // (same pattern as Atlas/semantic agent)
                  thinkingText += (thinkingText ? "\n" : "") + (event.content || "");
                  setStreamingThinking(thinkingText);
                  setIsThinkingStreaming(true);
                  break;

                case "done":
                  break;

                case "error":
                  fullText += `\n\n**Error:** ${event.content}`;
                  setStreamingText(fullText);
                  break;
              }
            } catch {
              // Skip malformed JSON lines
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          const errorMsg = err instanceof Error ? err.message : "Stream failed";
          fullText += `\n\n**Error:** ${errorMsg}`;
          setStreamingText(fullText);
        }
      } finally {
        setIsStreaming(false);
        setIsThinkingStreaming(false);
        abortRef.current = null;
      }

      return { fullText, thinkingText, generatedSql: sql };
    },
    [fetchApiStream]
  );

  return {
    sendMessage,
    isStreaming,
    streamingText,
    streamingThinking,
    isThinkingStreaming,
    generatedSql,
    abortStream,
  };
}
