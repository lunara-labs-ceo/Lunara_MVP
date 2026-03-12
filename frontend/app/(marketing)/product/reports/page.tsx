import type { Metadata } from "next"
import Link from "next/link"
import {
  FileText,
  BarChart3,
  PenLine,
  BookOpen,
  ArrowRight,
  Brain,
  Code,
  ShieldCheck,
  Cpu,
  Sparkles,
  Check,
  Workflow,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { SectionWrapper } from "@/components/shared/section-wrapper"
import { SectionHeader } from "@/components/shared/section-header"
import { ScrollReveal } from "@/components/shared/scroll-reveal"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export const metadata: Metadata = {
  title: "Report Builder - Lunara | AI-Generated Reports & Charts",
  description:
    "Tell Lunara what you need. The Report Agent runs analysis, generates charts, and writes narrative summaries. Two AI agents work together.",
}

/* ---------- Data ---------- */

const pipelineSteps = [
  {
    agent: "Analyst Agent",
    icon: Brain,
    color: "text-primary",
    bgColor: "bg-primary/10",
    tasks: [
      "Understands your request and breaks it into sub-analyses",
      "Generates SQL queries for each data need",
      "Runs queries against your warehouse",
      "Creates charts using matplotlib in a secure sandbox",
    ],
  },
  {
    agent: "Reporter Agent",
    icon: PenLine,
    color: "text-primary",
    bgColor: "bg-primary/10",
    tasks: [
      "Takes the Analyst's results and structures a report",
      "Writes narrative analysis with key findings",
      "Highlights trends and actionable insights",
      "Organizes sections with charts, captions, and notes",
    ],
  },
]

const outputCards = [
  {
    icon: BarChart3,
    title: "Charts",
    description:
      "Bar charts, line graphs, and more — generated with matplotlib in an isolated sandbox. Publication-ready visuals that tell the story at a glance.",
  },
  {
    icon: PenLine,
    title: "Narrative",
    description:
      "Written analysis with key findings, trends, and actionable insights. Not just numbers — context that explains what the data means for your business.",
  },
  {
    icon: BookOpen,
    title: "Structured Report",
    description:
      "Title, summary, sections, charts with captions, and notes. A complete document ready to share with stakeholders.",
  },
]

const sandboxFeatures = [
  "Chart code runs in isolated GCP sandboxes — no access to your production systems",
  "Each execution gets a fresh environment with automatic cleanup",
  "Python, matplotlib, and pandas available for complex visualizations",
  "Your data stays secure — sandbox outputs only include rendered charts",
]

/* ---------- Page ---------- */

export default function ReportsPage() {
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
            Reports
          </Badge>

          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl xl:text-7xl">
            From Question to Report{" "}
            <span className="text-primary">in One Prompt</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground md:text-xl">
            Tell the Report Agent what you need. It runs the analysis,
            generates charts, and writes a narrative summary — all
            automatically.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Button size="lg" asChild>
              <Link href="/sign-up">
                Generate a Report
                <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <a href="mailto:shyamsarma@lunaralabs.ca">Book a Demo</a>
            </Button>
          </div>
        </div>
      </section>

      {/* ─── Two-Agent Pipeline ─── */}
      <SectionWrapper className="border-t border-border">
        <SectionHeader
          badge="Two-Agent Pipeline"
          title="Two Agents. One Report."
          subtitle="The Analyst handles data. The Reporter handles storytelling. Together, they build complete reports."
        />

        <div className="mx-auto max-w-4xl">
          <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
            {pipelineSteps.map((step, stepIndex) => {
              const Icon = step.icon
              return (
                <ScrollReveal
                  key={step.agent}
                  delay={stepIndex * 0.15}
                  direction={stepIndex === 0 ? "left" : "right"}
                >
                  <Card className="group relative h-full overflow-hidden transition-all hover:border-primary/30 hover:glow-blue">
                    <CardContent className="p-6 md:p-8">
                      <div className="mb-5 flex items-center gap-3">
                        <div
                          className={cn(
                            "flex size-12 items-center justify-center rounded-xl transition-colors group-hover:bg-primary/15",
                            step.bgColor
                          )}
                        >
                          <Icon className={cn("size-6", step.color)} />
                        </div>
                        <div>
                          <Badge
                            variant="secondary"
                            className="font-mono text-[10px] uppercase tracking-wider"
                          >
                            Agent {stepIndex + 1}
                          </Badge>
                          <h3 className="text-xl font-semibold">
                            {step.agent}
                          </h3>
                        </div>
                      </div>

                      <div className="space-y-3">
                        {step.tasks.map((task) => (
                          <div key={task} className="flex items-start gap-3">
                            <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10">
                              <Check className="size-3 text-primary" />
                            </div>
                            <span className="text-sm text-muted-foreground">
                              {task}
                            </span>
                          </div>
                        ))}
                      </div>
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

          {/* Flow arrow between agents */}
          <ScrollReveal delay={0.3}>
            <div className="mx-auto mt-8 flex max-w-md items-center gap-4">
              <div className="h-px flex-1 bg-border" />
              <div className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2">
                <Workflow className="size-4 text-primary" />
                <span className="font-mono text-xs text-muted-foreground">
                  Analyst results flow to Reporter
                </span>
              </div>
              <div className="h-px flex-1 bg-border" />
            </div>
          </ScrollReveal>
        </div>
      </SectionWrapper>

      {/* ─── What You Get ─── */}
      <SectionWrapper>
        <SectionHeader
          badge="Output"
          title="What You Get"
          subtitle="Charts, narrative, and structure — a complete report from a single prompt."
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {outputCards.map((card, i) => {
            const Icon = card.icon
            return (
              <ScrollReveal key={card.title} delay={i * 0.1}>
                <Card className="group relative h-full overflow-hidden transition-all hover:border-primary/30 hover:glow-blue">
                  <CardContent className="p-6 md:p-8">
                    <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-primary/10 transition-colors group-hover:bg-primary/15">
                      <Icon className="size-6 text-primary" />
                    </div>
                    <h3 className="mb-2 text-xl font-semibold">
                      {card.title}
                    </h3>
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

      {/* ─── Sandbox Execution ─── */}
      <SectionWrapper className="border-t border-border">
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <ScrollReveal direction="left">
            <Badge
              variant="secondary"
              className="mb-4 font-mono text-xs uppercase tracking-wider text-primary"
            >
              Secure Execution
            </Badge>

            <h2 className="mb-4 text-3xl font-semibold tracking-tight md:text-4xl">
              Sandboxed Chart Generation.{" "}
              <span className="text-primary">Your Data Stays Safe.</span>
            </h2>

            <p className="mb-8 text-lg leading-relaxed text-muted-foreground">
              Chart code runs in isolated GCP sandboxes with automatic
              cleanup. The sandbox has access to Python, matplotlib, and
              pandas — but never to your production systems.
            </p>

            <div className="space-y-3">
              {sandboxFeatures.map((feature) => (
                <div key={feature} className="flex items-start gap-3">
                  <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Check className="size-3 text-primary" />
                  </div>
                  <span className="text-sm text-muted-foreground">
                    {feature}
                  </span>
                </div>
              ))}
            </div>
          </ScrollReveal>

          <ScrollReveal direction="right" delay={0.15}>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {[
                {
                  icon: ShieldCheck,
                  title: "Isolated",
                  desc: "Each chart runs in its own sandbox. No cross-contamination between executions.",
                },
                {
                  icon: Cpu,
                  title: "Auto-Cleanup",
                  desc: "Sandbox environments are automatically destroyed after chart generation completes.",
                },
                {
                  icon: Code,
                  title: "Full Python",
                  desc: "matplotlib, pandas, and numpy available for complex data visualizations.",
                },
                {
                  icon: Sparkles,
                  title: "Publication-Ready",
                  desc: "Charts are styled and formatted for direct use in presentations and reports.",
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
            Generate Your First{" "}
            <span className="text-primary">Report</span>
          </h2>

          <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
            One prompt. Two agents. A complete report with charts,
            narrative, and insights.
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
