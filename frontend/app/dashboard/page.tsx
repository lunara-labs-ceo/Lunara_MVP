import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

export default async function DashboardPage() {
  const { userId, orgId } = await auth();
  if (!userId) redirect("/sign-in");

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="text-center space-y-4">
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome to Lunara!
        </h1>
        <p className="text-muted-foreground">
          User ID: {userId}
        </p>
        {orgId && (
          <p className="text-muted-foreground">
            Organization: {orgId}
          </p>
        )}
        <p className="text-sm text-muted-foreground/60">
          Dashboard coming soon. Auth is working.
        </p>
      </div>
    </div>
  );
}
