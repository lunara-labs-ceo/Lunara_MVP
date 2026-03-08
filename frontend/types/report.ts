// ---- Report Messages ----
export interface ReportMessage {
  role: "user" | "assistant";
  content: string;
  codeBlocks?: CodeBlock[] | null;
  timestamp?: string;
}

export interface CodeBlock {
  language: string;
  code: string;
}

// ---- Report Sessions ----
export interface ReportSession {
  id: string;
  project_id: string;
  name: string;
  messages: ReportMessage[];
  created_by?: string | null;
  created_at: string;
  updated_at?: string;
}

// ---- Report Items (Document Canvas) ----
export interface ReportItem {
  id: string;
  report_id: string;
  type: "text" | "html" | "chart" | "table";
  title: string | null;
  content: string;
  position: number;
  created_at: string;
}

// ---- SSE Stream Events ----
export interface ReportStreamEvent {
  type:
    | "text"
    | "status"
    | "code"
    | "code_result"
    | "chart"
    | "content_item"
    | "done"
    | "error";
  content?: string;
  language?: string;
  data?: string;
  item?: ReportItem;
  items_added?: number;
}
