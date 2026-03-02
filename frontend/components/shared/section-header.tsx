import { cn } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"

interface SectionHeaderProps {
  badge: string
  title: string
  subtitle?: string
  className?: string
  align?: "center" | "left"
}

export function SectionHeader({ badge, title, subtitle, className, align = "center" }: SectionHeaderProps) {
  return (
    <div className={cn("mb-16", align === "center" && "text-center", className)}>
      <Badge variant="secondary" className="mb-4 font-mono text-xs uppercase tracking-wider">
        <span className="mr-2 inline-block size-1.5 rounded-full bg-primary animate-pulse" />
        {badge}
      </Badge>
      <h2 className="font-serif text-4xl font-normal tracking-tight md:text-5xl lg:text-6xl">{title}</h2>
      {subtitle && (
        <p className="mx-auto mt-4 max-w-2xl text-lg text-muted-foreground">{subtitle}</p>
      )}
    </div>
  )
}
