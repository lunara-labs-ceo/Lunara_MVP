"use client"

import { ShieldCheck, Layers, MessageSquareCode, BarChart3 } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { SectionWrapper } from "@/components/shared/section-wrapper"
import { SectionHeader } from "@/components/shared/section-header"
import { ScrollReveal } from "@/components/shared/scroll-reveal"
import { FEATURES } from "@/lib/constants"

const iconMap = {
  ShieldCheck,
  Layers,
  MessageSquareCode,
  BarChart3,
} as const

export function FeaturesGrid() {
  return (
    <SectionWrapper id="features">
      <SectionHeader
        badge="Platform"
        title="Built for Control and Clarity"
        subtitle="Every feature designed so you stay in charge of your data workflow."
      />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {FEATURES.map((feature, i) => {
          const Icon = iconMap[feature.icon]
          return (
            <ScrollReveal key={feature.title} delay={i * 0.1} className={feature.span}>
              <Card
                className="group relative h-full overflow-hidden transition-all hover:border-primary/30 hover:glow-blue"
              >
                <CardContent className="p-6 md:p-8">
                  <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-primary/10 transition-colors group-hover:bg-primary/15">
                    <Icon className="size-6 text-primary" />
                  </div>
                  <h3 className="mb-2 text-xl font-semibold">{feature.title}</h3>
                  <p className="text-sm leading-relaxed text-muted-foreground">{feature.description}</p>
                </CardContent>

                {/* Subtle gradient overlay on hover */}
                <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100"
                  style={{
                    background: "radial-gradient(ellipse at top right, var(--lunara-glow) 0%, transparent 60%)",
                  }}
                />
              </Card>
            </ScrollReveal>
          )
        })}
      </div>
    </SectionWrapper>
  )
}
