"use client"

import { Quote } from "lucide-react"
import { Card, CardContent } from "@/components/ui/card"
import { SectionWrapper } from "@/components/shared/section-wrapper"
import { SectionHeader } from "@/components/shared/section-header"
import { ScrollReveal } from "@/components/shared/scroll-reveal"
import { TESTIMONIALS } from "@/lib/constants"

export function Testimonials() {
  return (
    <SectionWrapper id="testimonials">
      <SectionHeader
        badge="Early Feedback"
        title="What Users Are Saying"
        subtitle="Hear from teams already using Lunara to explore their data."
      />

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        {TESTIMONIALS.map((testimonial, i) => (
          <ScrollReveal key={i} delay={i * 0.1}>
            <Card className="h-full transition-all hover:border-primary/20">
              <CardContent className="flex h-full flex-col justify-between p-6">
                <div>
                  <Quote className="mb-4 size-8 text-primary/30" />
                  <blockquote className="text-sm leading-relaxed text-foreground/90">
                    &ldquo;{testimonial.quote}&rdquo;
                  </blockquote>
                </div>
                <div className="mt-6 flex items-center gap-3 border-t border-border pt-4">
                  <div className="size-9 rounded-full bg-primary/10" />
                  <div>
                    <p className="text-sm font-medium">{testimonial.author}</p>
                    <p className="text-xs text-muted-foreground">{testimonial.company}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </ScrollReveal>
        ))}
      </div>
    </SectionWrapper>
  )
}
