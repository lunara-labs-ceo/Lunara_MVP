"use client"

import Image from "next/image"
import { Check } from "lucide-react"
import { ScrollReveal } from "@/components/shared/scroll-reveal"
import { SectionWrapper } from "@/components/shared/section-wrapper"
import { SectionHeader } from "@/components/shared/section-header"
import { AnimatedGroup } from "@/components/ui/animated-group"
import { Badge } from "@/components/ui/badge"
import { AGENTS } from "@/lib/constants"

export function Agents() {
  return (
    <SectionWrapper id="agents">
      <SectionHeader
        badge="Meet Your Agents"
        title="Three Agents. One Platform."
        subtitle="From raw schema to polished reports — each agent handles a different stage of your analytics workflow."
      />

      <div className="space-y-24 lg:space-y-32">
        {AGENTS.map((agent, index) => {
          const imageLeft = agent.imagePosition === "left"
          return (
            <ScrollReveal key={agent.number}>
              <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
                {/* Image */}
                <div
                  className={`${imageLeft ? "lg:order-1" : "lg:order-2"} order-1`}
                >
                  <div className="group relative overflow-hidden rounded-xl border border-border transition-all hover:glow-blue">
                    <Image
                      src={agent.image}
                      alt={agent.imageAlt}
                      width={720}
                      height={480}
                      className="w-full transition-transform duration-500 group-hover:-translate-y-1"
                      unoptimized
                    />
                  </div>
                </div>

                {/* Text */}
                <div className={`${imageLeft ? "lg:order-2" : "lg:order-1"} order-2`}>
                  <Badge
                    variant="secondary"
                    className="mb-4 font-mono text-xs uppercase tracking-wider text-primary"
                  >
                    {agent.number}
                  </Badge>

                  <h3 className="mb-4 font-serif text-3xl font-normal tracking-tight md:text-4xl">
                    {agent.name}
                  </h3>

                  <p className="mb-6 text-lg leading-relaxed text-muted-foreground">
                    {agent.description}
                  </p>

                  <AnimatedGroup preset="blur-slide" className="space-y-3">
                    {agent.features.map((feature) => (
                      <div key={feature} className="flex items-start gap-3">
                        <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10">
                          <Check className="size-3 text-primary" />
                        </div>
                        <span className="text-sm text-muted-foreground">{feature}</span>
                      </div>
                    ))}
                  </AnimatedGroup>
                </div>
              </div>
            </ScrollReveal>
          )
        })}
      </div>
    </SectionWrapper>
  )
}
