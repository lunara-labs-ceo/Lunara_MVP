"use client"

import { useState, useEffect } from "react"
import Image from "next/image"
import { motion, AnimatePresence } from "motion/react"
import { TextEffect } from "@/components/ui/text-effect"
import { AnimatedGroup } from "@/components/ui/animated-group"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

const slides = [
  { src: "/images/chat-agent.png", alt: "Luna — Lunara Natural Language to SQL", label: "Luna" },
  { src: "/images/reporting-agent.png", alt: "Lunara Report Builder", label: "Report Builder" },
]

export function Hero() {
  const [current, setCurrent] = useState(0)

  useEffect(() => {
    const timer = setInterval(() => setCurrent((c) => (c + 1) % slides.length), 5000)
    return () => clearInterval(timer)
  }, [])

  return (
    <section className="relative overflow-hidden pt-20 pb-0 md:pt-28">
      {/* Background grid + glow */}
      <div className="bg-grid pointer-events-none absolute inset-0" />
      <div
        className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 h-[700px] w-[900px] opacity-50"
        style={{
          background: "radial-gradient(ellipse at center, var(--lunara-glow-bright) 0%, var(--lunara-glow) 40%, transparent 70%)",
        }}
      />

      <div className="relative z-10 mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        {/* Content */}
        <div className="mx-auto max-w-4xl text-center">
          <AnimatedGroup preset="blur-slide" className="flex flex-col items-center">
            <Badge variant="secondary" className="mb-6 font-mono text-xs uppercase tracking-wider">
              <span className="mr-2 inline-block size-1.5 rounded-full bg-primary animate-pulse" />
              Agentic BI for modern data teams
            </Badge>
          </AnimatedGroup>

          <h1 className="text-5xl font-semibold tracking-tight sm:text-6xl lg:text-7xl xl:text-8xl">
            <TextEffect preset="fade-in-blur" speedReveal={1.1} speedSegment={0.3} per="word">
              AI Agents That
            </TextEffect>{" "}
            <TextEffect
              preset="fade-in-blur"
              speedReveal={1.1}
              speedSegment={0.3}
              per="word"
              delay={0.4}
              className="text-primary"
            >
              Actually Understand
            </TextEffect>{" "}
            <TextEffect preset="fade-in-blur" speedReveal={1.1} speedSegment={0.3} per="word" delay={0.7}>
              Your Data.
            </TextEffect>
          </h1>

          <AnimatedGroup preset="blur-slide" className="mt-8 flex flex-col items-center">
            <p className="max-w-2xl text-lg text-muted-foreground md:text-xl">
              Lunara builds a semantic layer on top of your warehouse, so anyone can explore data, generate
              reports, and get answers — all within minutes.
            </p>

            <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
              <Button size="lg" asChild>
                <a href="/sign-up">Get Early Access</a>
              </Button>
              <Button variant="outline" size="lg" asChild>
                <a href="mailto:shyamsarma@lunaralabs.ca">Book a Demo</a>
              </Button>
            </div>
          </AnimatedGroup>
        </div>

        {/* Screenshot carousel with browser chrome */}
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5, ease: [0.21, 0.47, 0.32, 0.98] }}
          className="relative mx-auto mt-16 -mb-32 px-4 sm:px-6 lg:px-8"
        >
          <div className="glow-blue rounded-xl border border-border bg-card overflow-hidden">
            {/* Browser chrome bar */}
            <div className="flex h-10 items-center gap-2 border-b border-border bg-muted/50 px-4">
              <div className="flex gap-1.5">
                <div className="size-3 rounded-full bg-muted-foreground/20" />
                <div className="size-3 rounded-full bg-muted-foreground/20" />
                <div className="size-3 rounded-full bg-muted-foreground/20" />
              </div>
              <div className="ml-4 h-6 w-64 rounded bg-muted" />
            </div>

            {/* Carousel */}
            <div className="relative bg-card">
              <AnimatePresence mode="wait">
                <motion.div
                  key={current}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.6 }}
                >
                  <Image
                    src={slides[current].src}
                    alt={slides[current].alt}
                    width={1920}
                    height={1080}
                    className="w-full h-auto"
                    priority
                    unoptimized
                  />
                </motion.div>
              </AnimatePresence>

              {/* Indicators + label */}
              <div className="flex items-center justify-center gap-2 py-3">
                {slides.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrent(i)}
                    className={`size-2 rounded-full transition-all ${
                      i === current ? "bg-primary w-6" : "bg-muted-foreground/30"
                    }`}
                    aria-label={`Go to slide ${i + 1}`}
                  />
                ))}
                <span className="ml-3 rounded-full bg-muted px-3 py-1 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  {slides[current].label}
                </span>
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
