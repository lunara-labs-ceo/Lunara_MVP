"use client"

import { Check } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { SectionWrapper } from "@/components/shared/section-wrapper"
import { SectionHeader } from "@/components/shared/section-header"
import { ScrollReveal } from "@/components/shared/scroll-reveal"
import { PRICING_TIERS } from "@/lib/constants"
import { cn } from "@/lib/utils"

export function Pricing() {
  return (
    <SectionWrapper id="pricing">
      <SectionHeader
        badge="Pricing"
        title="Simple, Transparent Pricing"
        subtitle="Start free. Scale when you're ready."
      />

      <div className="mx-auto grid max-w-4xl grid-cols-1 gap-6 md:grid-cols-2">
        {PRICING_TIERS.map((tier, i) => (
          <ScrollReveal key={tier.name} delay={i * 0.15}>
            <Card
              className={cn(
                "relative h-full transition-all",
                tier.highlighted && "border-primary/40 glow-blue"
              )}
            >
              {tier.highlighted && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                  <Badge className="bg-primary text-primary-foreground">Recommended</Badge>
                </div>
              )}
              <CardHeader className="pb-4">
                <CardTitle className="text-xl">{tier.name}</CardTitle>
                <div className="mt-2">
                  <span className="font-serif text-4xl font-normal">{tier.price}</span>
                </div>
                <CardDescription className="mt-2">{tier.description}</CardDescription>
              </CardHeader>
              <CardContent className="flex flex-col gap-6">
                <ul className="space-y-3">
                  {tier.features.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5">
                      <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10">
                        <Check className="size-3 text-primary" />
                      </div>
                      <span className="text-sm text-muted-foreground">{feature}</span>
                    </li>
                  ))}
                </ul>
                <Button
                  variant={tier.highlighted ? "default" : "outline"}
                  className="w-full"
                  asChild
                >
                  <a href="/login.html">{tier.cta}</a>
                </Button>
              </CardContent>
            </Card>
          </ScrollReveal>
        ))}
      </div>
    </SectionWrapper>
  )
}
