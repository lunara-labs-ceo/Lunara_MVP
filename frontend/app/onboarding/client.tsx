"use client";

import { useEffect, useState, useCallback, type FormEvent } from "react";
import { useAuth, useOrganizationList } from "@clerk/nextjs";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export function OnboardingClient() {
  const { orgId } = useAuth();
  const { createOrganization, setActive, isLoaded } = useOrganizationList();

  const [orgName, setOrgName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState("");

  // If orgId exists (e.g. user navigated here with an active org), go to dashboard
  useEffect(() => {
    if (orgId) {
      window.location.href = "/dashboard";
    }
  }, [orgId]);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!createOrganization || !setActive) return;

      const name = orgName.trim();
      if (!name) {
        setError("Organization name is required.");
        return;
      }

      setIsCreating(true);
      setError("");

      try {
        const org = await createOrganization({ name });
        await setActive({ organization: org.id });

        // setActive succeeded — reload so server-side auth picks up orgId
        // and page.tsx redirects to /dashboard
        window.location.reload();
      } catch (err: unknown) {
        setIsCreating(false);
        if (err instanceof Error) {
          setError(err.message);
        } else {
          setError("Something went wrong. Please try again.");
        }
      }
    },
    [orgName, createOrganization, setActive]
  );

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl tracking-tight">
            Welcome to Lunara
          </CardTitle>
          <CardDescription>
            Create your organization to get started.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form id="create-org-form" onSubmit={handleSubmit}>
            <div className="space-y-2">
              <Label htmlFor="org-name">Organization name</Label>
              <Input
                id="org-name"
                type="text"
                placeholder="e.g. Acme Analytics"
                value={orgName}
                onChange={(e) => {
                  setOrgName(e.target.value);
                  if (error) setError("");
                }}
                disabled={!isLoaded || isCreating}
                autoFocus
              />
              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}
            </div>
          </form>
        </CardContent>
        <CardFooter>
          <Button
            type="submit"
            form="create-org-form"
            size="lg"
            className="w-full"
            disabled={!isLoaded || isCreating || !orgName.trim()}
          >
            {isCreating ? "Creating..." : "Create Organization"}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}
