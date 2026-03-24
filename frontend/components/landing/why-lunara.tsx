"use client"

import { X, Check } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { SectionWrapper } from "@/components/shared/section-wrapper"
import { SectionHeader } from "@/components/shared/section-header"
import { ScrollReveal } from "@/components/shared/scroll-reveal"

const COMPARISONS = [
  {
    label: "Traditional BI",
    description: "Powerful but requires SQL expertise and weeks of dashboard setup",
    positive: false,
  },
  {
    label: "Generic AI Chat",
    description: "Generates plausible SQL that silently gets the wrong answer",
    positive: false,
  },
  {
    label: "Lunara",
    description: "Semantic context means accurate queries and reports from day one",
    positive: true,
  },
] as const

export function WhyLunara() {
  return (
    <SectionWrapper id="why-lunara">
      <SectionHeader
        badge="WHY LUNARA"
        title="Why Context Changes Everything"
        subtitle="The gap isn't NL-to-SQL. It's business context."
      />

      <div className="grid grid-cols-1 items-center gap-12 lg:grid-cols-2 lg:gap-16">
        {/* Left — statement */}
        <ScrollReveal direction="left">
          <p className="text-2xl font-semibold leading-snug tracking-tight text-foreground md:text-3xl">
            Every &ldquo;chat with your data&rdquo; tool can generate SQL. The problem
            is they generate the wrong SQL&nbsp;&mdash;&nbsp;because they don&apos;t
            understand your business. Lunara&apos;s semantic layer gives agents the
            context they need: what your metrics mean, how tables relate, which
            filters apply. That&apos;s why queries are accurate from day one.
          </p>
        </ScrollReveal>

        {/* Right — comparison cards */}
        <div className="flex flex-col gap-4">
          {COMPARISONS.map((item, i) => (
            <ScrollReveal key={item.label} delay={i * 0.12} direction="right">
              <Card
                className={`group transition-all ${
                  item.positive
                    ? "border-primary/40 hover:border-primary/60 hover:glow-blue"
                    : "hover:border-primary/30"
                }`}
              >
                <CardContent className="flex items-start gap-4 p-5">
                  <div
                    className={`mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg ${
                      item.positive
                        ? "bg-primary/10 text-primary"
                        : "bg-destructive/10 text-destructive"
                    }`}
                  >
                    {item.positive ? (
                      <Check className="size-4" />
                    ) : (
                      <X className="size-4" />
                    )}
                  </div>
                  <div>
                    <h3 className="text-base font-semibold tracking-tight">
                      {item.label}
                    </h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      {item.description}
                    </p>
                  </div>
                </CardContent>
              </Card>
            </ScrollReveal>
          ))}
        </div>
      </div>
    </SectionWrapper>
  )
}
