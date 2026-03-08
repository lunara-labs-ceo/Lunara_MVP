"use client";

import { useMemo } from "react";
import { Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MessageResponse } from "@/components/ai-elements/message";
import type { ReportItem } from "@/types/report";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface ReportContentItemProps {
  item: ReportItem;
  onDelete: (id: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ReportContentItem({ item, onDelete }: ReportContentItemProps) {
  return (
    <div className="group relative">
      {/* Delete button — visible on hover */}
      <Button
        variant="ghost"
        size="icon-xs"
        className="absolute -right-2 -top-2 opacity-0 transition-opacity group-hover:opacity-100"
        onClick={() => onDelete(item.id)}
      >
        <Trash2 className="size-3" />
        <span className="sr-only">Delete item</span>
      </Button>

      {/* Title (shown for all types except chart, which handles its own caption) */}
      {item.title && item.type !== "chart" && (
        <h3 className="mb-2 text-sm font-medium text-foreground">
          {item.title}
        </h3>
      )}

      {/* Content by type */}
      <ItemContent item={item} />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Content renderer
// ---------------------------------------------------------------------------

function ItemContent({ item }: { item: ReportItem }) {
  switch (item.type) {
    case "html":
      return <HtmlContent content={item.content} />;
    case "text":
      return <TextContent content={item.content} />;
    case "chart":
      return <ChartContent content={item.content} title={item.title} />;
    case "table":
      return <TableContent content={item.content} />;
    default:
      return null;
  }
}

// ---------------------------------------------------------------------------
// HTML content
// ---------------------------------------------------------------------------

function HtmlContent({ content }: { content: string }) {
  return (
    <div
      dangerouslySetInnerHTML={{ __html: content }}
      className={
        "prose prose-sm dark:prose-invert max-w-none " +
        "[&_img]:my-4 [&_img]:rounded-lg [&_img]:border [&_img]:border-border " +
        "[&_figcaption]:mt-2 [&_figcaption]:text-center [&_figcaption]:text-xs [&_figcaption]:text-muted-foreground"
      }
    />
  );
}

// ---------------------------------------------------------------------------
// Text content (rendered as markdown via Streamdown)
// ---------------------------------------------------------------------------

function TextContent({ content }: { content: string }) {
  return <MessageResponse>{content}</MessageResponse>;
}

// ---------------------------------------------------------------------------
// Chart content
// ---------------------------------------------------------------------------

function ChartContent({
  content,
  title,
}: {
  content: string;
  title: string | null;
}) {
  const src = content.startsWith("data:")
    ? content
    : `data:image/png;base64,${content}`;

  return (
    <figure className="flex flex-col items-center gap-2">
      <img
        src={src}
        alt={title || "Chart"}
        className="max-w-full rounded-lg border border-border"
        loading="lazy"
      />
      {title && (
        <figcaption className="text-center text-xs text-muted-foreground">
          {title}
        </figcaption>
      )}
    </figure>
  );
}

// ---------------------------------------------------------------------------
// Table content
// ---------------------------------------------------------------------------

const MAX_TABLE_ROWS = 50;

function TableContent({ content }: { content: string }) {
  const parsed = useMemo(() => {
    try {
      const data = JSON.parse(content);
      if (Array.isArray(data) && data.length > 0 && typeof data[0] === "object") {
        return data as Record<string, unknown>[];
      }
      return null;
    } catch {
      return null;
    }
  }, [content]);

  if (!parsed) {
    return (
      <pre className="overflow-x-auto rounded bg-muted p-3 text-xs">
        {content}
      </pre>
    );
  }

  const headers = Object.keys(parsed[0]);
  const totalRows = parsed.length;
  const rows = parsed.slice(0, MAX_TABLE_ROWS);

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            {headers.map((header) => (
              <th
                key={header}
                className="border-b bg-muted/50 px-3 py-2 text-left text-xs font-medium text-muted-foreground"
              >
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, rowIdx) => (
            <tr key={rowIdx}>
              {headers.map((header) => (
                <td
                  key={header}
                  className="border-b border-border px-3 py-2"
                >
                  {String(row[header] ?? "")}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {totalRows > MAX_TABLE_ROWS && (
        <p className="mt-2 text-center text-xs text-muted-foreground">
          Showing {MAX_TABLE_ROWS} of {totalRows} rows
        </p>
      )}
    </div>
  );
}
