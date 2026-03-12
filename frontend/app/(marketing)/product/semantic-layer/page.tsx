import type { Metadata } from "next"
import Link from "next/link"
import {
  Database,
  Brain,
  UserCheck,
  Layers,
  BarChart3,
  Clock,
  GitBranch,
  ArrowRight,
  Check,
  Eye,
  Pencil,
  ShieldCheck,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { SectionWrapper } from "@/components/shared/section-wrapper"
import { SectionHeader } from "@/components/shared/section-header"
import { ScrollReveal } from "@/components/shared/scroll-reveal"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export const metadata: Metadata = {
  title: "Semantic Layer - Lunara | AI-Powered Schema Understanding",
  description:
    "Lunara's Semantic Agent automatically analyzes your database schema, discovers relationships, and builds a business-friendly model. Human-in-the-loop review.",
}

/* ---------- Data ---------- */

const steps = [
  {
    step: 1,
    icon: Database,
    title: "Connect",
    description:
      "Link your database. The agent starts analyzing immediately.",
  },
  {
    step: 2,
    icon: Brain,
    title: "Analyze",
    description:
      "AI maps tables, classifies columns (dimensions, measures, time), discovers joins with confidence scores.",
  },
  {
    step: 3,
    icon: UserCheck,
    title: "Review",
    description:
      "You review everything. Edit descriptions, adjust types, approve relationships. Nothing runs until you say so.",
  },
]

const modelCards = [
  {
    icon: Layers,
    title: "Dimensions",
    description:
      "Categorical columns like region, product name, customer segment. The agent identifies the labels that slice your data.",
  },
  {
    icon: BarChart3,
    title: "Measures",
    description:
      "Numeric columns with aggregations — SUM, AVG, COUNT, MIN, MAX, COUNT_DISTINCT. Every metric mapped to its business meaning.",
  },
  {
    icon: Clock,
    title: "Time",
    description:
      "Date and timestamp columns for time-series analysis. The agent detects granularity and common date hierarchies.",
  },
  {
    icon: GitBranch,
    title: "Relationships",
    description:
      "Auto-discovered join paths between tables with confidence levels — high, medium, or low — so you know which connections to trust.",
  },
]

const reviewPoints = [
  "Every column classification is editable — change a dimension to a measure with one click",
  "Add or rewrite business descriptions in plain language",
  "Approve, reject, or adjust discovered relationships",
  "Real-time streaming shows the agent's chain-of-thought as it works",
  "Nothing is saved until you explicitly approve the model",
]

/* ---------- Page ---------- */

export default function SemanticLayerPage() {
  return (
    <>
      {/* ─── Hero ─── */}
      <section className="relative overflow-hidden pt-24 pb-16 md:pt-32 md:pb-24">
        <div className="bg-grid pointer-events-none absolute inset-0" />
        <div
          className="pointer-events-none absolute left-1/2 top-0 -translate-x-1/2 h-[600px] w-[800px] opacity-50"
          style={{
            background:
              "radial-gradient(ellipse at center, var(--lunara-glow-bright) 0%, var(--lunara-glow) 40%, transparent 70%)",
          }}
        />

        <div className="relative z-10 mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <Badge
            variant="secondary"
            className="mb-6 font-mono text-xs uppercase tracking-wider"
          >
            <span className="mr-2 inline-block size-1.5 rounded-full bg-primary animate-pulse" />
            Semantic Layer
          </Badge>

          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl xl:text-7xl">
            Your AI Understands Your Business,{" "}
            <span className="text-primary">Not Just Your Columns</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground md:text-xl">
            The Semantic Agent analyzes your schema, discovers relationships,
            and builds a business-friendly model — so every query gets the
            context it needs.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Button size="lg" asChild>
              <Link href="/sign-up">
                Get Started
                <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <a href="mailto:shyamsarma@lunaralabs.ca">Book a Demo</a>
            </Button>
          </div>
        </div>
      </section>

      {/* ─── Problem Statement ─── */}
      <SectionWrapper className="border-t border-border">
        <ScrollReveal>
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
              Why Generic AI Gets SQL Wrong
            </h2>
            <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
              Generic AI tools generate plausible-looking SQL that is often
              wrong. They see column names but don't understand business
              context. They guess at joins instead of knowing them. They
              can't tell a dimension from a measure.
            </p>
            <p className="mt-4 text-lg leading-relaxed text-muted-foreground">
              Lunara's semantic layer bridges this gap. Before any query is
              generated, the agent already knows what your tables mean, how
              they relate, and how your team defines each metric.
            </p>
          </div>
        </ScrollReveal>
      </SectionWrapper>

      {/* ─── How It Works ─── */}
      <SectionWrapper>
        <SectionHeader
          badge="How It Works"
          title="Three Steps to a Complete Model"
          subtitle="From raw schema to business-ready context in minutes."
        />

        <div className="relative grid grid-cols-1 gap-8 sm:grid-cols-3">
          {steps.map((step, i) => {
            const Icon = step.icon
            return (
              <ScrollReveal key={step.step} delay={i * 0.12}>
                <div className="group relative flex flex-col items-center text-center">
                  {/* Connecting line */}
                  {step.step < 3 && (
                    <div className="absolute left-[calc(50%+32px)] top-8 hidden h-px w-[calc(100%-64px)] bg-border sm:block" />
                  )}

                  <div className="relative mb-5 flex size-16 items-center justify-center rounded-2xl border border-border bg-card transition-colors group-hover:border-primary/50 group-hover:bg-primary/5">
                    <Icon className="size-7 text-primary" />
                    <span className="absolute -right-1 -top-1 flex size-5 items-center justify-center rounded-full bg-primary font-mono text-[10px] font-bold text-primary-foreground">
                      {step.step}
                    </span>
                  </div>

                  <h3 className="mb-2 text-lg font-semibold">{step.title}</h3>
                  <p className="text-sm text-muted-foreground">
                    {step.description}
                  </p>
                </div>
              </ScrollReveal>
            )
          })}
        </div>
      </SectionWrapper>

      {/* ─── What the Semantic Model Contains ─── */}
      <SectionWrapper className="border-t border-border">
        <SectionHeader
          badge="Semantic Model"
          title="What the Model Contains"
          subtitle="Every column classified, every relationship mapped, every metric defined."
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          {modelCards.map((card, i) => {
            const Icon = card.icon
            return (
              <ScrollReveal key={card.title} delay={i * 0.1}>
                <Card className="group relative h-full overflow-hidden transition-all hover:border-primary/30 hover:glow-blue">
                  <CardContent className="p-6 md:p-8">
                    <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-primary/10 transition-colors group-hover:bg-primary/15">
                      <Icon className="size-6 text-primary" />
                    </div>
                    <h3 className="mb-2 text-xl font-semibold">{card.title}</h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {card.description}
                    </p>
                  </CardContent>

                  <div
                    className="pointer-events-none absolute inset-0 opacity-0 transition-opacity group-hover:opacity-100"
                    style={{
                      background:
                        "radial-gradient(ellipse at top right, var(--lunara-glow) 0%, transparent 60%)",
                    }}
                  />
                </Card>
              </ScrollReveal>
            )
          })}
        </div>
      </SectionWrapper>

      {/* ─── Human-in-the-Loop ─── */}
      <SectionWrapper>
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <ScrollReveal direction="left">
            <Badge
              variant="secondary"
              className="mb-4 font-mono text-xs uppercase tracking-wider text-primary"
            >
              Human-in-the-Loop
            </Badge>

            <h2 className="mb-4 text-3xl font-semibold tracking-tight md:text-4xl">
              The AI Proposes.{" "}
              <span className="text-primary">You Approve.</span>
            </h2>

            <p className="mb-8 text-lg leading-relaxed text-muted-foreground">
              Every classification, description, and relationship is
              editable. The Semantic Agent does the heavy lifting, but you
              stay in control at every step.
            </p>

            <div className="space-y-3">
              {reviewPoints.map((point) => (
                <div key={point} className="flex items-start gap-3">
                  <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Check className="size-3 text-primary" />
                  </div>
                  <span className="text-sm text-muted-foreground">{point}</span>
                </div>
              ))}
            </div>
          </ScrollReveal>

          <ScrollReveal direction="right" delay={0.15}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {[
                {
                  icon: Eye,
                  title: "Transparent",
                  desc: "Watch the agent reason in real time with chain-of-thought streaming.",
                },
                {
                  icon: Pencil,
                  title: "Editable",
                  desc: "Change any classification, description, or relationship before saving.",
                },
                {
                  icon: ShieldCheck,
                  title: "Safe",
                  desc: "Nothing is committed to your semantic layer until you explicitly approve.",
                },
                {
                  icon: Brain,
                  title: "Two-Phase",
                  desc: "Phase 1 maps schema. Phase 2 discovers relationships. Review after each.",
                },
              ].map((item) => {
                const Icon = item.icon
                return (
                  <Card
                    key={item.title}
                    className="group transition-all hover:border-primary/30"
                  >
                    <CardContent className="p-5">
                      <div className="mb-3 flex size-10 items-center justify-center rounded-lg bg-primary/10">
                        <Icon className="size-5 text-primary" />
                      </div>
                      <h4 className="mb-1 text-sm font-semibold">
                        {item.title}
                      </h4>
                      <p className="text-xs leading-relaxed text-muted-foreground">
                        {item.desc}
                      </p>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          </ScrollReveal>
        </div>
      </SectionWrapper>

      {/* ─── CTA ─── */}
      <section className="relative overflow-hidden border-y border-border py-24 md:py-32">
        <div className="bg-grid pointer-events-none absolute inset-0 opacity-50" />
        <div
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              "radial-gradient(ellipse at center, var(--lunara-glow) 0%, transparent 50%)",
          }}
        />

        <div className="relative z-10 mx-auto max-w-4xl px-4 text-center sm:px-6 lg:px-8">
          <h2 className="text-4xl font-semibold tracking-tight md:text-5xl lg:text-6xl">
            Start Building Your{" "}
            <span className="text-primary">Semantic Layer</span>
          </h2>

          <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
            Connect your warehouse and let the Semantic Agent do the heavy
            lifting. You review, you approve, you ship.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Button size="lg" asChild>
              <Link href="/sign-up">
                Get Started
                <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <a href="mailto:shyamsarma@lunaralabs.ca">Book a Demo</a>
            </Button>
          </div>
        </div>
      </section>
    </>
  )
}
