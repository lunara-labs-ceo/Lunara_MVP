import { auth } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";
import { Sidebar } from "@/components/app-shell/sidebar";
import { OrgActivator } from "@/components/app-shell/org-activator";

export const metadata = {
  title: "Dashboard — Lunara",
};

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const { userId } = await auth();
  if (!userId) redirect("/sign-in");

  return (
    <div className="flex h-screen overflow-hidden bg-background">
      <OrgActivator />
      <Sidebar />
      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
