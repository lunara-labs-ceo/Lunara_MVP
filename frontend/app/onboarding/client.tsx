"use client";

import { useEffect } from "react";
import { useAuth, CreateOrganization } from "@clerk/nextjs";

export function OnboardingClient() {
  const { orgId, getToken } = useAuth();

  useEffect(() => {
    if (orgId) {
      getToken({ skipCache: true }).then(() => {
        window.location.href = "/dashboard";
      });
    }
  }, [orgId, getToken]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center space-y-6">
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome to Lunara
        </h1>
        <p className="text-muted-foreground">
          Create your organization to get started.
        </p>
        <CreateOrganization
          routing="path"
          path="/onboarding"
          skipInvitationScreen={true}
          afterCreateOrganizationUrl="/dashboard"
        />
      </div>
    </div>
  );
}
