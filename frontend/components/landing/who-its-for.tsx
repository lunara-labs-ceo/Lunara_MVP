"use client"

import { BarChart3, Users, Settings } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { SectionWrapper } from "@/components/shared/section-wrapper"
import { SectionHeader } from "@/components/shared/section-header"
import { ScrollReveal } from "@/components/shared/scroll-reveal"

const PERSONAS = [
  {
    title: "Data Analysts",
    description:
      "Stop writing boilerplate SQL. Let AI handle joins and aggregations while you focus on insights.",
    icon: BarChart3,
  },
  {
    title: "Business Users",
    description:
      "Ask questions in plain English. No SQL knowledge required. Get answers in seconds, not days.",
    icon: Users,
  },
  {
    title: "Engineering Leaders",
    description:
      "Give your team self-serve analytics without building internal tools. Ship faster.",
    icon: Settings,
  },
] as const

export function WhoItsFor() {
  return (
    <SectionWrapper id="who-its-for">
      <SectionHeader
        badge="FOR YOU"
        title="Built for Every Data Role"
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {PERSONAS.map((persona, i) => {
          const Icon = persona.icon
          return (
            <ScrollReveal key={persona.title} delay={i * 0.1}>
              <Card className="group h-full transition-all hover:border-primary/30 hover:glow-blue">
                <CardContent className="p-6 md:p-8">
                  <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-primary/10 transition-colors group-hover:bg-primary/15">
                    <Icon className="size-6 text-primary" />
                  </div>
                  <h3 className="mb-2 text-xl font-semibold tracking-tight">
                    {persona.title}
                  </h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">
                    {persona.description}
                  </p>
                </CardContent>
              </Card>
            </ScrollReveal>
          )
        })}
      </div>
    </SectionWrapper>
  )
}
