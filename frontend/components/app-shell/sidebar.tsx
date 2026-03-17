"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useParams } from "next/navigation";
import {
  Database,
  TableProperties,
  Layers,
  MessageSquare,
  FileBarChart,
  FolderOpen,
  Plus,
  ChevronLeft,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeft,
  Sun,
  Moon,
  Settings,
  Zap,
} from "lucide-react";
import { UserButton, useOrganization } from "@clerk/nextjs";
import { useTheme } from "next-themes";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { useBilling } from "@/hooks/use-billing";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useProjects } from "@/hooks/use-projects";

interface NavItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
}

function getProjectNavItems(projectId: string): NavItem[] {
  return [
    {
      label: "Data Sources",
      href: `/dashboard/${projectId}/data-sources`,
      icon: Database,
    },
    {
      label: "Schema",
      href: `/dashboard/${projectId}/schema`,
      icon: TableProperties,
    },
    {
      label: "Semantic Layer",
      href: `/dashboard/${projectId}/semantic`,
      icon: Layers,
    },
    {
      label: "Chat",
      href: `/dashboard/${projectId}/chat`,
      icon: MessageSquare,
    },
    {
      label: "Reports",
      href: `/dashboard/${projectId}/reports`,
      icon: FileBarChart,
    },
  ];
}

function LunaraLogo({ collapsed }: { collapsed: boolean }) {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5">
      <svg
        width={24}
        height={24}
        viewBox="0 0 40 40"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
      >
        <path
          d="M8 4L18 4L18 26L32 26L32 36L8 36L8 4Z"
          className="fill-sidebar-foreground"
        />
        <path
          d="M20 8L28 8L28 24L20 24L20 8Z"
          className="fill-sidebar"
        />
        <circle cx="30" cy="8" r="2" className="fill-sidebar-foreground" />
        <circle cx="30" cy="16" r="2" className="fill-sidebar-foreground" />
        <circle cx="12" cy="32" r="2" className="fill-sidebar-foreground" />
      </svg>
      {!collapsed && (
        <span className="text-sm font-bold uppercase tracking-tight text-sidebar-foreground">
          Lunara
        </span>
      )}
    </Link>
  );
}

function SidebarHeader({
  collapsed,
  onToggle,
}: {
  collapsed: boolean;
  onToggle: () => void;
}) {
  return (
    <div
      className={cn(
        "flex h-14 items-center border-b border-sidebar-border shrink-0",
        collapsed ? "justify-center px-2" : "justify-between px-4"
      )}
    >
      <LunaraLogo collapsed={collapsed} />
      <Button
        variant="ghost"
        size="icon-sm"
        onClick={onToggle}
        className="text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        {collapsed ? (
          <PanelLeft className="size-4" />
        ) : (
          <PanelLeftClose className="size-4" />
        )}
      </Button>
    </div>
  );
}

function SidebarProjects({ collapsed }: { collapsed: boolean }) {
  const { projects } = useProjects();
  const pathname = usePathname();
  const params = useParams();
  const activeProjectId = params?.projectId as string | undefined;

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-1 px-2 py-3">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href="/dashboard"
                className={cn(
                  "flex size-8 items-center justify-center rounded-md transition-colors",
                  pathname === "/dashboard"
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                )}
              >
                <LayoutDashboard className="size-4" />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">Projects</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <Separator className="my-1 bg-sidebar-border" />

        <TooltipProvider>
          {projects.slice(0, 5).map((project) => (
            <Tooltip key={project.id}>
              <TooltipTrigger asChild>
                <Link
                  href={`/dashboard/${project.id}/data-sources`}
                  className={cn(
                    "flex size-8 items-center justify-center rounded-md text-xs font-medium transition-colors",
                    activeProjectId === project.id
                      ? "bg-sidebar-accent text-sidebar-accent-foreground"
                      : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                  )}
                >
                  {project.name.charAt(0).toUpperCase()}
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right">{project.name}</TooltipContent>
            </Tooltip>
          ))}
        </TooltipProvider>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 px-3 py-3">
      <div className="flex items-center justify-between px-2 mb-1">
        <span className="text-xs font-medium uppercase tracking-wider text-sidebar-foreground/50">
          Projects
        </span>
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Link href="/dashboard">
                <Button
                  variant="ghost"
                  size="icon-xs"
                  className="text-sidebar-foreground/50 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                >
                  <Plus className="size-3" />
                </Button>
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">New project</TooltipContent>
          </Tooltip>
        </TooltipProvider>
      </div>

      {projects.length === 0 ? (
        <p className="px-2 text-xs text-sidebar-foreground/40">
          No projects yet
        </p>
      ) : (
        projects.map((project) => (
          <Link
            key={project.id}
            href={`/dashboard/${project.id}/data-sources`}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
              activeProjectId === project.id
                ? "bg-sidebar-accent text-sidebar-accent-foreground font-medium"
                : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
            )}
          >
            <FolderOpen className="size-4 shrink-0" />
            <span className="truncate">{project.name}</span>
          </Link>
        ))
      )}
    </div>
  );
}

function SidebarProjectNav({
  projectId,
  collapsed,
}: {
  projectId: string;
  collapsed: boolean;
}) {
  const pathname = usePathname();
  const navItems = getProjectNavItems(projectId);

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-1 px-2 py-3">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                href="/dashboard"
                className="flex size-8 items-center justify-center rounded-md text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors"
              >
                <ChevronLeft className="size-4" />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right">All projects</TooltipContent>
          </Tooltip>
        </TooltipProvider>

        <Separator className="my-1 bg-sidebar-border" />

        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          return (
            <TooltipProvider key={item.href}>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Link
                    href={item.href}
                    className={cn(
                      "flex size-8 items-center justify-center rounded-md transition-colors",
                      isActive
                        ? "bg-sidebar-primary text-sidebar-primary-foreground"
                        : "text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
                    )}
                  >
                    <item.icon className="size-4" />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right">{item.label}</TooltipContent>
              </Tooltip>
            </TooltipProvider>
          );
        })}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1 px-3 py-3">
      <Link
        href="/dashboard"
        className="flex items-center gap-2 rounded-md px-2 py-1.5 text-sm text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent/50 transition-colors mb-1"
      >
        <ChevronLeft className="size-4" />
        <span>All projects</span>
      </Link>

      <Separator className="mb-2 bg-sidebar-border" />

      {navItems.map((item) => {
        const isActive = pathname.startsWith(item.href);
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-2.5 rounded-md px-2 py-1.5 text-sm transition-colors",
              isActive
                ? "bg-sidebar-primary text-sidebar-primary-foreground font-medium"
                : "text-sidebar-foreground/70 hover:text-sidebar-foreground hover:bg-sidebar-accent/50"
            )}
          >
            <item.icon className="size-4 shrink-0" />
            <span>{item.label}</span>
          </Link>
        );
      })}
    </div>
  );
}

function SidebarFooter({ collapsed }: { collapsed: boolean }) {
  const { organization } = useOrganization();
  const { theme, setTheme } = useTheme();
  const { credits, totalCredits, plan, isPro, isLoading: billingLoading } = useBilling();
  const creditPercent = totalCredits > 0 ? Math.round((credits / totalCredits) * 100) : 0;
  const isLow = credits <= 10;

  if (collapsed) {
    return (
      <div className="flex flex-col items-center gap-2 border-t border-sidebar-border px-2 py-3 shrink-0">
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
                className="text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent"
                aria-label="Toggle theme"
              >
                <Sun className="size-4 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" />
                <Moon className="absolute size-4 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="right">Toggle theme</TooltipContent>
          </Tooltip>
        </TooltipProvider>
        <UserButton
          afterSignOutUrl="/"
          appearance={{
            elements: { avatarBox: "size-7" },
          }}
        />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2 border-t border-sidebar-border px-4 py-3 shrink-0">
      {/* Credit usage */}
      {!billingLoading && (
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <span className={cn("text-xs font-medium", isLow ? "text-destructive" : "text-sidebar-foreground/60")}>
              <Zap className="inline size-3 mr-0.5" />
              {credits} / {totalCredits} credits
            </span>
            <span className="text-[10px] uppercase tracking-wider text-sidebar-foreground/40">
              {plan}
            </span>
          </div>
          <div className="h-1 rounded-full bg-sidebar-accent overflow-hidden">
            <div
              className={cn(
                "h-full rounded-full transition-all",
                isLow ? "bg-destructive" : "bg-primary"
              )}
              style={{ width: `${creditPercent}%` }}
            />
          </div>
          {!isPro ? (
            <Link
              href="/dashboard/settings/billing"
              className="flex items-center justify-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs font-semibold text-background transition-opacity hover:opacity-90"
            >
              <Zap className="size-3" />
              Upgrade to Pro
            </Link>
          ) : (
            <Link
              href="/dashboard/settings/billing"
              className="text-[10px] font-medium text-muted-foreground hover:text-foreground"
            >
              Manage billing
            </Link>
          )}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2.5 min-w-0">
          <UserButton
            afterSignOutUrl="/"
            appearance={{
              elements: { avatarBox: "size-7" },
            }}
          />
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-sidebar-foreground">
              {organization?.name ?? "Personal"}
            </p>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon-sm"
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="text-sidebar-foreground/60 hover:text-sidebar-foreground hover:bg-sidebar-accent shrink-0"
          aria-label="Toggle theme"
        >
          <Sun className="size-4 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" />
          <Moon className="absolute size-4 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
        </Button>
      </div>
    </div>
  );
}

export function Sidebar() {
  const [collapsed, setCollapsed] = useState(false);
  const params = useParams();
  const projectId = params?.projectId as string | undefined;

  return (
    <aside
      className={cn(
        "flex h-full flex-col border-r border-sidebar-border bg-sidebar text-sidebar-foreground transition-[width] duration-200",
        collapsed ? "w-14" : "w-60"
      )}
    >
      <SidebarHeader
        collapsed={collapsed}
        onToggle={() => setCollapsed((prev) => !prev)}
      />

      <ScrollArea className="flex-1">
        {projectId ? (
          <SidebarProjectNav projectId={projectId} collapsed={collapsed} />
        ) : (
          <SidebarProjects collapsed={collapsed} />
        )}
      </ScrollArea>

      <SidebarFooter collapsed={collapsed} />
    </aside>
  );
}
