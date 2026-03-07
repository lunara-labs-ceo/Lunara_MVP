// ---- Chat Messages ----
export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  thinking?: string | null;
  sql?: string | null;
  timestamp?: string;
}

// ---- Chat Sessions ----
export interface ChatSession {
  id: string;
  project_id: string;
  name: string;
  messages: ChatMessage[];
  semantic_model_id?: string | null;
  created_by?: string | null;
  created_at: string;
  updated_at?: string;
}

// ---- Artifacts ----
export interface ChatArtifact {
  id: string;
  project_id: string;
  title: string;
  sql: string;
  data: Record<string, unknown>[] | null;
  session_id?: string | null;
  created_by?: string | null;
  created_at: string;
}

// ---- SQL Editor Tabs ----
export interface EditorTab {
  id: number;
  name: string;
  sql: string;
  results: Record<string, unknown>[] | null;
  rowCount: number;
  queryStatus: "ready" | "running" | "complete" | "error";
  errorMessage?: string | null;
}

// ---- SSE Stream Events ----
export interface ChatStreamEvent {
  type: "text" | "thinking" | "sql" | "status" | "done" | "error";
  content?: string;
}

// ---- Semantic Model (for sidebar tree + chat context) ----
export interface SemanticColumn {
  name: string;
  type: string;
  semantic_type?: string;
  description?: string;
}

export interface SemanticTable {
  table_id?: string;
  name: string;
  columns: SemanticColumn[];
}

export interface SemanticModel {
  tables: SemanticTable[];
  relationships?: unknown[];
}

// ---- Query Execution ----
export interface QueryResult {
  success: boolean;
  data?: Record<string, unknown>[];
  error?: string;
}
