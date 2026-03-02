"use client"

import { SectionWrapper } from "@/components/shared/section-wrapper"
import { ScrollReveal } from "@/components/shared/scroll-reveal"
import { STATS } from "@/lib/constants"

export function Stats() {
  return (
    <SectionWrapper className="border-y border-border bg-card/50">
      <div className="grid grid-cols-2 gap-8 md:grid-cols-4 md:gap-12">
        {STATS.map((stat, i) => (
          <ScrollReveal key={stat.label} delay={i * 0.1}>
            <div className="text-center">
              <div className="font-serif text-4xl font-normal tracking-tight text-foreground md:text-5xl lg:text-6xl">
                {stat.value}
              </div>
              <p className="mt-2 text-sm text-muted-foreground">{stat.label}</p>
            </div>
          </ScrollReveal>
        ))}
      </div>
    </SectionWrapper>
  )
}
