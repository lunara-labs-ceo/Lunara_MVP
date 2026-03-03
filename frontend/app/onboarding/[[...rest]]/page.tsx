import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { OnboardingClient } from "../client";

export default async function OnboardingPage() {
  const { userId, orgId } = await auth();

  if (!userId) redirect("/sign-in");

  // If user already has an active org, skip onboarding
  if (orgId) redirect("/dashboard");

  return <OnboardingClient />;
}
