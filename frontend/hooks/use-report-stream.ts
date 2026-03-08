"use client";

import { useState, useCallback, useRef } from "react";
import { useApiClient } from "@/lib/api";
import type {
  ReportMessage,
  ReportItem,
  ReportStreamEvent,
  CodeBlock,
} from "@/types/report";

interface ReportStreamOptions {
  reportId: string;
  artifacts: { title: string; sql: string; data: unknown }[];
  history: ReportMessage[];
}

interface StreamResult {
  fullText: string;
  codeBlocks: CodeBlock[];
  contentItems: ReportItem[];
}

interface UseReportStreamReturn {
  sendPrompt: (
    prompt: string,
    opts: ReportStreamOptions
  ) => Promise<StreamResult>;
  isStreaming: boolean;
  streamingText: string;
  streamingCodeBlocks: CodeBlock[];
  statusText: string;
  abortStream: () => void;
}

export function useReportStream(): UseReportStreamReturn {
  const { fetchApiStream } = useApiClient();
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingText, setStreamingText] = useState("");
  const [streamingCodeBlocks, setStreamingCodeBlocks] = useState<CodeBlock[]>(
    []
  );
  const [statusText, setStatusText] = useState("");

  const abortRef = useRef<AbortController | null>(null);

  const abortStream = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const sendPrompt = useCallback(
    async (prompt: string, opts: ReportStreamOptions): Promise<StreamResult> => {
      const { reportId, artifacts, history } = opts;

      // Reset state
      setIsStreaming(true);
      setStreamingText("");
      setStreamingCodeBlocks([]);
      setStatusText("");

      abortRef.current = new AbortController();

      let fullText = "";
      const codeBlocks: CodeBlock[] = [];
      const contentItems: ReportItem[] = [];

      try {
        const response = await fetchApiStream(
          `/api/v1/reports/${reportId}/generate`,
          {
            method: "POST",
            body: JSON.stringify({
              prompt,
              artifacts,
              history: history.map((m) => ({
                role: m.role,
                content: m.content,
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
          buffer = lines.pop() || "";

          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed || !trimmed.startsWith("data: ")) continue;

            try {
              const event: ReportStreamEvent = JSON.parse(trimmed.slice(6));

              switch (event.type) {
                case "text":
                  fullText += event.content || "";
                  setStreamingText(fullText);
                  break;

                case "status":
                  setStatusText(event.content || "");
                  break;

                case "code": {
                  const block: CodeBlock = {
                    language: event.language || "python",
                    code: event.content || "",
                  };
                  codeBlocks.push(block);
                  setStreamingCodeBlocks([...codeBlocks]);
                  break;
                }

                case "content_item":
                  if (event.item) {
                    contentItems.push(event.item);
                  }
                  break;

                case "done":
                  setStatusText("");
                  break;

                case "error":
                  fullText += `\n\n**Error:** ${event.content}`;
                  setStreamingText(fullText);
                  break;

                case "code_result":
                case "chart":
                  // These are handled via content_item events
                  break;
              }
            } catch {
              // Skip malformed JSON lines
            }
          }
        }
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          const errorMsg =
            err instanceof Error ? err.message : "Stream failed";
          fullText += `\n\n**Error:** ${errorMsg}`;
          setStreamingText(fullText);
        }
      } finally {
        setIsStreaming(false);
        setStatusText("");
        abortRef.current = null;
      }

      return { fullText, codeBlocks, contentItems };
    },
    [fetchApiStream]
  );

  return {
    sendPrompt,
    isStreaming,
    streamingText,
    streamingCodeBlocks,
    statusText,
    abortStream,
  };
}
