"use client"

import { Database, Brain, MessageSquare, BarChart3 } from "lucide-react"
import { AnimatedGroup } from "@/components/ui/animated-group"
import { SectionWrapper } from "@/components/shared/section-wrapper"
import { SectionHeader } from "@/components/shared/section-header"
import { HOW_IT_WORKS_STEPS } from "@/lib/constants"

const iconMap = {
  Database,
  Brain,
  MessageSquare,
  BarChart3,
} as const

export function HowItWorks() {
  return (
    <SectionWrapper id="how-it-works">
      <SectionHeader
        badge="How It Works"
        title="Context First, Then Insights"
        subtitle="Most tools start with queries. Lunara starts with understanding your data."
      />

      <AnimatedGroup
        preset="blur-slide"
        className="relative grid grid-cols-1 gap-8 sm:grid-cols-2 lg:grid-cols-4"
      >
        {HOW_IT_WORKS_STEPS.map((step) => {
          const Icon = iconMap[step.icon]
          return (
            <div key={step.step} className="group relative flex flex-col items-center text-center">
              {/* Connecting line (hidden on mobile/last item) */}
              {step.step < 4 && (
                <div className="absolute left-[calc(50%+32px)] top-8 hidden h-px w-[calc(100%-64px)] bg-border lg:block" />
              )}

              {/* Step circle */}
              <div className="relative mb-5 flex size-16 items-center justify-center rounded-2xl border border-border bg-card transition-colors group-hover:border-primary/50 group-hover:bg-primary/5">
                <Icon className="size-7 text-primary" />
                <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-primary font-mono text-[10px] font-bold text-primary-foreground">
                  {step.step}
                </span>
              </div>

              <h3 className="mb-2 text-lg font-semibold">{step.title}</h3>
              <p className="text-sm text-muted-foreground">{step.description}</p>
            </div>
          )
        })}
      </AnimatedGroup>
    </SectionWrapper>
  )
}
