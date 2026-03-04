"use client";

import { useState } from "react";
import { Loader2, CheckCircle2, XCircle } from "lucide-react";
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

interface ConnectionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
  onSuccess: () => void;
}

interface FormState {
  name: string;
  host: string;
  port: string;
  database: string;
  username: string;
  password: string;
}

const INITIAL_FORM: FormState = {
  name: "",
  host: "",
  port: "5432",
  database: "postgres",
  username: "postgres",
  password: "",
};

type FeedbackStatus = "idle" | "testing" | "test-success" | "test-error" | "saving" | "save-error";

export function ConnectionDialog({
  open,
  onOpenChange,
  projectId,
  onSuccess,
}: ConnectionDialogProps) {
  const { fetchApi } = useApiClient();
  const [form, setForm] = useState<FormState>(INITIAL_FORM);
  const [status, setStatus] = useState<FeedbackStatus>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  function updateField(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    // Clear any previous error when user edits
    if (status === "test-error" || status === "save-error") {
      setStatus("idle");
      setErrorMessage("");
    }
  }

  function resetDialog() {
    setForm(INITIAL_FORM);
    setStatus("idle");
    setErrorMessage("");
  }

  function handleOpenChange(nextOpen: boolean) {
    if (!nextOpen) {
      resetDialog();
    }
    onOpenChange(nextOpen);
  }

  function buildPayload() {
    return {
      name: form.name.trim(),
      host: form.host.trim(),
      port: parseInt(form.port, 10) || 5432,
      database: form.database.trim(),
      username: form.username.trim(),
      password: form.password,
    };
  }

  function validate(): string | null {
    if (!form.name.trim()) return "Connection name is required.";
    if (!form.host.trim()) return "Host is required.";
    if (!form.password) return "Password is required.";
    return null;
  }

  async function handleTestConnection() {
    const validationError = validate();
    if (validationError) {
      setStatus("test-error");
      setErrorMessage(validationError);
      return;
    }

    setStatus("testing");
    setErrorMessage("");

    try {
      const result = await fetchApi<{ id: string; status: string }>(
        `/api/v1/connections?project_id=${encodeURIComponent(projectId)}`,
        {
          method: "POST",
          body: JSON.stringify(buildPayload()),
        }
      );

      if (result.status === "connected") {
        setStatus("test-success");
        // Clean up the test connection — it was created just to test
        try {
          await fetchApi(`/api/v1/connections/${result.id}`, {
            method: "DELETE",
          });
        } catch {
          // Swallow delete error — test result is what matters
        }
      } else {
        setStatus("test-error");
        setErrorMessage(
          "Connection test failed. Please check your credentials and try again."
        );
        // Clean up the failed connection record
        try {
          await fetchApi(`/api/v1/connections/${result.id}`, {
            method: "DELETE",
          });
        } catch {
          // Swallow
        }
      }
    } catch (err) {
      setStatus("test-error");
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "An unexpected error occurred while testing the connection."
      );
    }
  }

  async function handleSaveConnection() {
    const validationError = validate();
    if (validationError) {
      setStatus("save-error");
      setErrorMessage(validationError);
      return;
    }

    setStatus("saving");
    setErrorMessage("");

    try {
      const result = await fetchApi<{ id: string; status: string }>(
        `/api/v1/connections?project_id=${encodeURIComponent(projectId)}`,
        {
          method: "POST",
          body: JSON.stringify(buildPayload()),
        }
      );

      if (result.status === "connected") {
        resetDialog();
        onOpenChange(false);
        onSuccess();
      } else {
        setStatus("save-error");
        setErrorMessage(
          "Connection was saved but the test failed. Check your credentials."
        );
        // Still refresh the list since the record was created
        onSuccess();
      }
    } catch (err) {
      setStatus("save-error");
      setErrorMessage(
        err instanceof Error
          ? err.message
          : "Failed to save the connection. Please try again."
      );
    }
  }

  const isBusy = status === "testing" || status === "saving";

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Connect PostgreSQL</DialogTitle>
          <DialogDescription>
            Enter your database credentials. Works with any PostgreSQL database
            including Supabase, Neon, and Railway.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-4 py-2">
          {/* Connection Name */}
          <div className="grid gap-2">
            <Label htmlFor="conn-name">Connection Name</Label>
            <Input
              id="conn-name"
              placeholder="My Supabase DB"
              value={form.name}
              onChange={(e) => updateField("name", e.target.value)}
              disabled={isBusy}
            />
          </div>

          {/* Host */}
          <div className="grid gap-2">
            <Label htmlFor="conn-host">Host</Label>
            <Input
              id="conn-host"
              placeholder="db.xxx.supabase.co"
              value={form.host}
              onChange={(e) => updateField("host", e.target.value)}
              disabled={isBusy}
            />
          </div>

          {/* Port + Database — side by side */}
          <div className="grid grid-cols-2 gap-3">
            <div className="grid gap-2">
              <Label htmlFor="conn-port">Port</Label>
              <Input
                id="conn-port"
                type="number"
                placeholder="5432"
                value={form.port}
                onChange={(e) => updateField("port", e.target.value)}
                disabled={isBusy}
              />
            </div>
            <div className="grid gap-2">
              <Label htmlFor="conn-database">Database</Label>
              <Input
                id="conn-database"
                placeholder="postgres"
                value={form.database}
                onChange={(e) => updateField("database", e.target.value)}
                disabled={isBusy}
              />
            </div>
          </div>

          {/* Username */}
          <div className="grid gap-2">
            <Label htmlFor="conn-username">Username</Label>
            <Input
              id="conn-username"
              placeholder="postgres"
              value={form.username}
              onChange={(e) => updateField("username", e.target.value)}
              disabled={isBusy}
            />
          </div>

          {/* Password */}
          <div className="grid gap-2">
            <Label htmlFor="conn-password">Password</Label>
            <Input
              id="conn-password"
              type="password"
              placeholder="Your database password"
              value={form.password}
              onChange={(e) => updateField("password", e.target.value)}
              disabled={isBusy}
            />
          </div>

          {/* Feedback messages */}
          {status === "test-success" && (
            <div className="flex items-center gap-2 rounded-md bg-emerald-500/10 px-3 py-2 text-sm text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-4 shrink-0" />
              Connection successful! You can now save this connection.
            </div>
          )}

          {(status === "test-error" || status === "save-error") &&
            errorMessage && (
              <div className="flex items-start gap-2 rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
                <XCircle className="size-4 mt-0.5 shrink-0" />
                <span>{errorMessage}</span>
              </div>
            )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={handleTestConnection}
            disabled={isBusy}
          >
            {status === "testing" && (
              <Loader2 className="size-4 animate-spin" />
            )}
            Test Connection
          </Button>
          <Button onClick={handleSaveConnection} disabled={isBusy}>
            {status === "saving" && (
              <Loader2 className="size-4 animate-spin" />
            )}
            Save Connection
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
