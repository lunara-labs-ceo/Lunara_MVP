"use client"

import { Button } from "@/components/ui/button"
import { TextEffect } from "@/components/ui/text-effect"

export function CTA() {
  return (
    <section className="relative overflow-hidden border-y border-border py-24 md:py-32">
      {/* Background effects */}
      <div className="bg-grid pointer-events-none absolute inset-0 opacity-50" />
      <div
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            "radial-gradient(ellipse at center, var(--lunara-glow) 0%, transparent 50%)",
        }}
      />

      <div className="relative z-10 mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
        <h2 className="font-serif text-4xl font-normal tracking-tight md:text-6xl lg:text-7xl">
          <TextEffect preset="fade-in-blur" speedReveal={1.1} speedSegment={0.3} per="word">
            Ready to Put Your
          </TextEffect>{" "}
          <TextEffect
            preset="fade-in-blur"
            speedReveal={1.1}
            speedSegment={0.3}
            per="word"
            delay={0.4}
            className="text-primary"
          >
            Data to Work?
          </TextEffect>
        </h2>

        <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
          Join the waitlist and be among the first to try Lunara.
        </p>

        <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
          <Button size="lg" asChild>
            <a href="/login.html">Get Early Access</a>
          </Button>
          <Button variant="outline" size="lg" asChild>
            <a href="mailto:shyamsarma@lunaralabs.ca">Book a Demo</a>
          </Button>
        </div>
      </div>
    </section>
  )
}
