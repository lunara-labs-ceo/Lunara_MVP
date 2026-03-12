"use client"

import { Shield, Lock, UserCheck, Database } from "lucide-react"
import { SectionWrapper } from "@/components/shared/section-wrapper"
import { ScrollReveal } from "@/components/shared/scroll-reveal"

const TRUST_ITEMS = [
  { icon: Shield, text: "Your data stays in your database" },
  { icon: Lock, text: "Encrypted credentials" },
  { icon: UserCheck, text: "Human-in-the-loop on every query" },
  { icon: Database, text: "No raw data stored" },
] as const

export function TrustStrip() {
  return (
    <SectionWrapper className="border-y border-border bg-card/50">
      <div className="grid grid-cols-2 gap-8 md:grid-cols-4 md:gap-12">
        {TRUST_ITEMS.map((item, i) => {
          const Icon = item.icon
          return (
            <ScrollReveal key={item.text} delay={i * 0.1}>
              <div className="flex flex-col items-center gap-3 text-center">
                <Icon className="size-6 text-primary" />
                <p className="text-sm text-muted-foreground">{item.text}</p>
              </div>
            </ScrollReveal>
          )
        })}
      </div>
    </SectionWrapper>
  )
}
