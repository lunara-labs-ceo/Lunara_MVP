import type { Metadata } from "next"
import { cn } from "@/lib/utils"
import { SectionWrapper } from "@/components/shared/section-wrapper"
import { SectionHeader } from "@/components/shared/section-header"
import { ScrollReveal } from "@/components/shared/scroll-reveal"
import { Badge } from "@/components/ui/badge"

export const metadata: Metadata = {
  title: "Changelog - Lunara | What's New",
  description:
    "See what's new in Lunara. Product updates, new features, and improvements.",
}

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

interface ChangelogEntry {
  date: string
  version: string
  title: string
  description: string
}

const entries: ChangelogEntry[] = [
  {
    date: "March 2026",
    version: "v0.3.0",
    title: "Website Expansion",
    description:
      "New product pages, pricing, security page, blog, and documentation.",
  },
  {
    date: "March 2026",
    version: "v0.2.0",
    title: "Clerk Authentication",
    description:
      "Migrated to Clerk for enterprise-grade authentication with SSO and organization management.",
  },
  {
    date: "February 2026",
    version: "v0.1.0",
    title: "Initial Launch",
    description:
      "Lunara MVP with Atlas, Luna, and Quill. PostgreSQL support.",
  },
]

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function ChangelogPage() {
  return (
    <>
      {/* ── Hero ────────────────────────────────────────────── */}
      <SectionWrapper className="py-24 md:py-32">
        <SectionHeader
          badge="CHANGELOG"
          title="What's New"
          subtitle="Product updates and new features."
        />
      </SectionWrapper>

      {/* ── Timeline ────────────────────────────────────────── */}
      <SectionWrapper className="pb-28 md:pb-36">
        <div className="mx-auto max-w-2xl">
          <div className="relative border-l-2 border-border pl-8">
            {entries.map((entry, i) => (
              <ScrollReveal key={entry.version} delay={i * 0.1}>
                <div
                  className={cn(
                    "relative pb-12 last:pb-0"
                  )}
                >
                  {/* Dot marker on the timeline */}
                  <div className="absolute -left-[calc(2rem+5px)] top-1 flex size-2.5 items-center justify-center rounded-full bg-primary ring-4 ring-background" />

                  {/* Date + version */}
                  <div className="mb-2 flex flex-wrap items-center gap-3">
                    <span className="text-sm text-muted-foreground">
                      {entry.date}
                    </span>
                    <Badge variant="secondary" className="font-mono text-xs">
                      {entry.version}
                    </Badge>
                  </div>

                  {/* Title + description */}
                  <h3 className="mb-2 text-xl font-semibold">{entry.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {entry.description}
                  </p>
                </div>
              </ScrollReveal>
            ))}
          </div>
        </div>
      </SectionWrapper>
    </>
  )
}
