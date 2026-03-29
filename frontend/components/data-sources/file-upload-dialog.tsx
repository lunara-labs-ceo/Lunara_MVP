"use client";

import { useCallback, useState } from "react";
import {
  Upload,
  FileSpreadsheet,
  Loader2,
  CheckCircle2,
  XCircle,
  ChevronLeft,
} from "lucide-react";
import { useApiClient } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface FileUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  onSuccess: () => void;
}

interface ColumnPreview {
  name: string;
  inferred_type: string;
  pandas_dtype: string;
  sample_values: string[];
}

interface PreviewResponse {
  file_name: string;
  columns: ColumnPreview[];
  row_count: number;
  detected_encoding: string;
}

interface ColumnOverride {
  name: string;
  type: string;
}

const PG_TYPES = [
  "TEXT",
  "BIGINT",
  "INTEGER",
  "SMALLINT",
  "DOUBLE PRECISION",
  "REAL",
  "BOOLEAN",
  "TIMESTAMPTZ",
  "DATE",
];

type Step = "select" | "preview" | "uploading" | "done" | "error";

export function FileUploadDialog({
  open,
  onOpenChange,
  projectId,
  onSuccess,
}: FileUploadDialogProps) {
  const { uploadFile } = useApiClient();

  const [step, setStep] = useState<Step>("select");
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewResponse | null>(null);
  const [columns, setColumns] = useState<ColumnOverride[]>([]);
  const [tableName, setTableName] = useState("");
  const [errorMessage, setErrorMessage] = useState("");
  const [resultMessage, setResultMessage] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  // -- Reset --
  function resetDialog() {
    setStep("select");
    setFile(null);
    setPreview(null);
    setColumns([]);
    setTableName("");
    setErrorMessage("");
    setResultMessage("");
    setIsDragging(false);
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) resetDialog();
    onOpenChange(nextOpen);
  }

  // -- File selection --
  function validateFile(f: File): string | null {
    if (!f.name.toLowerCase().endsWith(".csv")) {
      return "Only CSV files are supported.";
    }
    if (f.size > 10 * 1024 * 1024) {
      return "File exceeds the 10MB limit.";
    }
    return null;
  }

  function handleFileSelect(f: File) {
    const error = validateFile(f);
    if (error) {
      setErrorMessage(error);
      setStep("error");
      return;
    }
    setFile(f);
    setErrorMessage("");
    handlePreview(f);
  }

  // -- Preview --
  async function handlePreview(selectedFile: File) {
    setStep("uploading");
    setErrorMessage("");

    const formData = new FormData();
    formData.append("file", selectedFile);
    formData.append("delimiter", ",");

    try {
      const data = await uploadFile<PreviewResponse>(
        "/api/v1/uploads/preview",
        formData
      );
      setPreview(data);
      setColumns(
        data.columns.map((col) => ({
          name: col.name,
          type: col.inferred_type,
        }))
      );
      // Default table name from file name (without extension)
      const defaultName = selectedFile.name.replace(/\.csv$/i, "");
      setTableName(defaultName);
      setStep("preview");
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to preview file."
      );
      setStep("error");
    }
  }

  // -- Column type override --
  function updateColumnType(index: number, newType: string) {
    setColumns((prev) =>
      prev.map((col, i) => (i === index ? { ...col, type: newType } : col))
    );
  }

  // -- Confirm upload --
  async function handleConfirm() {
    if (!file || !tableName.trim()) return;

    setStep("uploading");
    setErrorMessage("");

    const formData = new FormData();
    formData.append("file", file);
    formData.append("project_id", projectId);
    formData.append("table_name", tableName.trim());
    formData.append("columns_json", JSON.stringify(columns));
    formData.append("encoding", preview?.detected_encoding || "utf-8");
    formData.append("delimiter", ",");

    try {
      const result = await uploadFile<{
        rows_inserted: number;
        table_name: string;
      }>("/api/v1/uploads/confirm", formData);

      setResultMessage(
        `Successfully uploaded ${result.rows_inserted.toLocaleString()} rows as "${result.table_name}".`
      );
      setStep("done");
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : "Failed to upload file."
      );
      setStep("error");
    }
  }

  // -- Drag and drop handlers --
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) handleFileSelect(droppedFile);
  }, []);

  const isBusy = step === "uploading";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Upload a File</DialogTitle>
          <DialogDescription>
            Upload a CSV file to create a queryable data source. Atlas, Luna,
            and Quill will work with it just like a connected database.
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: File selection */}
        {step === "select" && (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={`flex flex-col items-center justify-center rounded-lg border-2 border-dashed py-12 px-6 text-center transition-colors ${
              isDragging
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-muted-foreground/40"
            }`}
          >
            <Upload className="size-8 text-muted-foreground/40 mb-3" />
            <p className="text-sm font-medium text-muted-foreground">
              Drag and drop a CSV file here
            </p>
            <p className="mt-1 text-xs text-muted-foreground/70">
              or click to browse (max 10MB)
            </p>
            <Button
              variant="outline"
              size="sm"
              className="mt-4"
              onClick={() => {
                const input = document.createElement("input");
                input.type = "file";
                input.accept = ".csv";
                input.onchange = (e) => {
                  const target = e.target as HTMLInputElement;
                  const selected = target.files?.[0];
                  if (selected) handleFileSelect(selected);
                };
                input.click();
              }}
            >
              Browse Files
            </Button>
          </div>
        )}

        {/* Step 2: Schema preview */}
        {step === "preview" && preview && (
          <div className="space-y-4 max-h-96 overflow-y-auto">
            {/* File info */}
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <FileSpreadsheet className="size-4" />
              <span>
                {preview.file_name} &middot;{" "}
                {preview.row_count.toLocaleString()} rows &middot;{" "}
                {preview.columns.length} columns
              </span>
            </div>

            {/* Table name */}
            <div className="grid gap-2">
              <Label htmlFor="table-name">Table Name</Label>
              <Input
                id="table-name"
                value={tableName}
                onChange={(e) => setTableName(e.target.value)}
                placeholder="e.g. sales_data"
              />
              <p className="text-xs text-muted-foreground">
                A timestamp will be appended automatically to avoid conflicts.
              </p>
            </div>

            {/* Column definitions */}
            <div className="space-y-2">
              <Label>Columns &amp; Types</Label>
              <div className="rounded-md border">
                <div className="grid grid-cols-[1fr_150px_1fr] gap-2 px-3 py-2 bg-muted/50 text-xs font-medium text-muted-foreground">
                  <span>Column</span>
                  <span>Type</span>
                  <span>Sample</span>
                </div>
                {columns.map((col, i) => (
                  <div
                    key={col.name}
                    className="grid grid-cols-[1fr_150px_1fr] gap-2 px-3 py-2 border-t items-center"
                  >
                    <span className="text-sm font-mono truncate">
                      {col.name}
                    </span>
                    <Select
                      value={col.type}
                      onValueChange={(val) => updateColumnType(i, val)}
                    >
                      <SelectTrigger className="h-8 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {PG_TYPES.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <span className="text-xs text-muted-foreground truncate">
                      {preview.columns[i]?.sample_values[0] ?? "—"}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Uploading state */}
        {step === "uploading" && (
          <div className="flex flex-col items-center justify-center py-12">
            <Loader2 className="size-8 animate-spin text-primary mb-3" />
            <p className="text-sm text-muted-foreground">
              {file && !preview
                ? "Analyzing file..."
                : "Creating table and inserting data..."}
            </p>
          </div>
        )}

        {/* Success state */}
        {step === "done" && (
          <div className="flex flex-col items-center justify-center py-12">
            <CheckCircle2 className="size-8 text-emerald-500 mb-3" />
            <p className="text-sm font-medium">{resultMessage}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              You can now use Atlas, Luna, and Quill with this data.
            </p>
          </div>
        )}

        {/* Error state */}
        {step === "error" && (
          <div className="flex flex-col items-center justify-center py-8">
            <XCircle className="size-8 text-destructive mb-3" />
            <p className="text-sm text-destructive text-center">
              {errorMessage}
            </p>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          {step === "preview" && (
            <>
              <Button
                variant="outline"
                onClick={() => {
                  setStep("select");
                  setFile(null);
                  setPreview(null);
                }}
              >
                <ChevronLeft className="size-4" />
                Back
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={!tableName.trim()}
              >
                Upload &amp; Create Table
              </Button>
            </>
          )}
          {step === "done" && (
            <Button
              onClick={() => {
                handleOpenChange(false);
                onSuccess();
              }}
            >
              Done
            </Button>
          )}
          {step === "error" && (
            <Button variant="outline" onClick={resetDialog}>
              Try Again
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
