"use client";

import { cn } from "@/lib/utils";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

interface ConnectorCardProps {
  name: string;
  description: string;
  icon: React.ReactNode;
  status: "ready" | "coming-soon";
  onClick?: () => void;
}

export function ConnectorCard({
  name,
  description,
  icon,
  status,
  onClick,
}: ConnectorCardProps) {
  const isReady = status === "ready";

  return (
    <Card
      role={isReady ? "button" : undefined}
      tabIndex={isReady ? 0 : undefined}
      onClick={isReady ? onClick : undefined}
      onKeyDown={
        isReady
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
      className={cn(
        "relative py-8 transition-all duration-200",
        isReady &&
          "cursor-pointer hover:border-primary/30 hover:shadow-md hover:bg-accent/40",
        !isReady && "opacity-50 cursor-not-allowed"
      )}
    >
      {/* Status badge */}
      <div className="absolute top-3 right-3">
        {isReady ? (
          <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:bg-emerald-500/15 dark:text-emerald-400 dark:border-emerald-500/25">
            Ready
          </Badge>
        ) : (
          <Badge variant="secondary" className="text-muted-foreground">
            Coming Soon
          </Badge>
        )}
      </div>

      {/* Card content */}
      <div className="flex flex-col items-center gap-3 px-6 text-center">
        <div
          className={cn(
            "flex h-12 w-12 items-center justify-center rounded-lg",
            isReady
              ? "bg-primary/5 text-primary dark:bg-primary/10"
              : "bg-muted text-muted-foreground"
          )}
        >
          {icon}
        </div>
        <div className="space-y-1">
          <p className="text-sm font-semibold">{name}</p>
          <p className="text-xs text-muted-foreground leading-relaxed">
            {description}
          </p>
        </div>
      </div>
    </Card>
  );
}
