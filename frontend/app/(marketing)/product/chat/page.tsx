import type { Metadata } from "next"
import Link from "next/link"
import {
  MessageSquare,
  Search,
  Calendar,
  TrendingUp,
  Table2,
  TextCursorInput,
  Brain,
  ArrowRight,
  Check,
  Code,
  Play,
  Save,
  Layers,
  Eye,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { SectionWrapper } from "@/components/shared/section-wrapper"
import { SectionHeader } from "@/components/shared/section-header"
import { ScrollReveal } from "@/components/shared/scroll-reveal"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"

export const metadata: Metadata = {
  title: "Luna - Lunara | Natural Language to SQL",
  description:
    "Ask questions in plain English. Luna uses your semantic layer to generate accurate, production-grade SQL. Review before you run.",
}

/* ---------- Data ---------- */

const tools = [
  {
    icon: Layers,
    title: "Semantic Context",
    description:
      "Loads your business model for accurate queries. The agent knows your metrics, dimensions, and relationships before writing a single line of SQL.",
  },
  {
    icon: Search,
    title: "Column Value Lookup",
    description:
      "Checks distinct values for precise filtering. No more guessing whether it's 'US', 'USA', or 'United States'.",
  },
  {
    icon: Calendar,
    title: "Date Range Analysis",
    description:
      "Finds min/max dates for time-series queries. The agent knows your data boundaries before constructing WHERE clauses.",
  },
  {
    icon: TrendingUp,
    title: "Column Statistics",
    description:
      "Gets numeric stats to understand distributions. Means, medians, and outliers — so aggregations are meaningful.",
  },
  {
    icon: Table2,
    title: "Table Preview",
    description:
      "Samples rows to verify data structure. The agent checks actual data to confirm assumptions before generating SQL.",
  },
  {
    icon: TextCursorInput,
    title: "Fuzzy Search",
    description:
      "Finds matching values even with typos. Search for 'Califrnia' and the agent knows you mean 'California'.",
  },
]

const conversationFeatures = [
  "Ask follow-up questions without re-explaining context",
  "Refine queries iteratively — the agent remembers what you tried",
  "Explore different angles of the same dataset in one session",
  "ADK session persistence keeps history across turns",
]

const editorFeatures = [
  {
    icon: Code,
    title: "Syntax Highlighting",
    description:
      "Full SQL editor with keyword highlighting, auto-indentation, and formatting.",
  },
  {
    icon: Play,
    title: "Run On Your Terms",
    description:
      "Execute queries when you're ready. The agent generates — you decide when to run.",
  },
  {
    icon: Save,
    title: "Save as Artifacts",
    description:
      "Keep useful queries for later. Build a library of analytics you can revisit anytime.",
  },
]

/* ---------- Page ---------- */

export default function ChatAgentPage() {
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
            Luna
          </Badge>

          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl lg:text-6xl xl:text-7xl">
            Ask Questions in English.{" "}
            <span className="text-primary">Get Production-Grade SQL.</span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground md:text-xl">
            Luna uses your semantic layer to understand context,
            look up values, and generate accurate queries — all from natural
            language.
          </p>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Button size="lg" asChild>
              <Link href="/sign-up">
                Start Chatting
                <ArrowRight className="ml-2 size-4" />
              </Link>
            </Button>
            <Button variant="outline" size="lg" asChild>
              <a href="mailto:shyamsarma@lunaralabs.ca">Book a Demo</a>
            </Button>
          </div>
        </div>
      </section>

      {/* ─── The 6 Tools ─── */}
      <SectionWrapper className="border-t border-border">
        <SectionHeader
          badge="Agent Toolkit"
          title="Six Tools for Accurate SQL"
          subtitle="Before writing SQL, the agent investigates your data. Here's how."
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {tools.map((tool, i) => {
            const Icon = tool.icon
            return (
              <ScrollReveal key={tool.title} delay={i * 0.08}>
                <Card className="group relative h-full overflow-hidden transition-all hover:border-primary/30 hover:glow-blue">
                  <CardContent className="p-6 md:p-8">
                    <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-primary/10 transition-colors group-hover:bg-primary/15">
                      <Icon className="size-6 text-primary" />
                    </div>
                    <h3 className="mb-2 text-xl font-semibold">
                      {tool.title}
                    </h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {tool.description}
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

      {/* ─── Multi-Turn Conversations ─── */}
      <SectionWrapper>
        <div className="grid grid-cols-1 items-center gap-10 lg:grid-cols-2 lg:gap-16">
          <ScrollReveal direction="left">
            <Badge
              variant="secondary"
              className="mb-4 font-mono text-xs uppercase tracking-wider text-primary"
            >
              Multi-Turn
            </Badge>

            <h2 className="mb-4 text-3xl font-semibold tracking-tight md:text-4xl">
              Conversations That{" "}
              <span className="text-primary">Remember Context</span>
            </h2>

            <p className="mb-8 text-lg leading-relaxed text-muted-foreground">
              The agent remembers context across your conversation. Ask
              follow-ups, refine queries, explore different angles — all in
              the same session.
            </p>

            <div className="space-y-3">
              {conversationFeatures.map((feature) => (
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
            {/* Simulated chat interface */}
            <Card className="overflow-hidden">
              <div className="flex h-9 items-center gap-2 border-b border-border bg-muted/50 px-4">
                <MessageSquare className="size-4 text-muted-foreground" />
                <span className="font-mono text-xs text-muted-foreground">
                  Luna
                </span>
              </div>
              <CardContent className="space-y-4 p-5">
                {/* User message */}
                <div className="flex justify-end">
                  <div className="rounded-xl rounded-br-sm bg-primary/10 px-4 py-2.5">
                    <p className="text-sm">
                      What were our top 10 products by revenue last quarter?
                    </p>
                  </div>
                </div>
                {/* Agent thinking */}
                <div className="flex justify-start">
                  <div className="rounded-xl rounded-bl-sm border border-border bg-card px-4 py-2.5">
                    <div className="mb-2 flex items-center gap-2">
                      <Brain className="size-3.5 text-primary" />
                      <span className="font-mono text-[10px] uppercase tracking-wider text-primary">
                        Thinking
                      </span>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Loading semantic context... checking date range for
                      &quot;last quarter&quot;... looking up revenue measure
                      aggregation...
                    </p>
                  </div>
                </div>
                {/* Follow-up */}
                <div className="flex justify-end">
                  <div className="rounded-xl rounded-br-sm bg-primary/10 px-4 py-2.5">
                    <p className="text-sm">
                      Now break that down by region
                    </p>
                  </div>
                </div>
                {/* Agent response */}
                <div className="flex justify-start">
                  <div className="rounded-xl rounded-bl-sm border border-border bg-card px-4 py-2.5">
                    <p className="text-xs text-muted-foreground">
                      Adding region dimension to the existing query. Using
                      the region join path from your semantic model...
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </ScrollReveal>
        </div>
      </SectionWrapper>

      {/* ─── Chain-of-Thought Transparency ─── */}
      <SectionWrapper className="border-t border-border">
        <ScrollReveal>
          <div className="mx-auto max-w-3xl text-center">
            <div className="mx-auto mb-6 flex size-14 items-center justify-center rounded-2xl bg-primary/10">
              <Eye className="size-7 text-primary" />
            </div>

            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
              Watch the Agent Think in Real Time
            </h2>

            <p className="mt-6 text-lg leading-relaxed text-muted-foreground">
              See which tools the agent uses, what context it loads, and how
              it arrives at the SQL. Chain-of-thought streaming means you
              always know why a query looks the way it does — no black box.
            </p>
          </div>
        </ScrollReveal>

        <div className="mx-auto mt-12 max-w-2xl">
          <ScrollReveal delay={0.15}>
            <Card className="overflow-hidden">
              <CardContent className="p-0">
                {[
                  {
                    tool: "get_semantic_context",
                    detail: "Loaded 12 tables, 84 columns, 6 relationships",
                  },
                  {
                    tool: "get_date_range",
                    detail: "orders.created_at: 2024-01-01 to 2025-12-31",
                  },
                  {
                    tool: "lookup_column_values",
                    detail: "products.category: 8 distinct values",
                  },
                  {
                    tool: "generate_sql",
                    detail: "SELECT ... FROM orders JOIN products ... GROUP BY ...",
                  },
                ].map((step, i) => (
                  <div
                    key={step.tool}
                    className={cn(
                      "flex items-start gap-3 px-5 py-3.5",
                      i < 3 && "border-b border-border"
                    )}
                  >
                    <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10">
                      <span className="font-mono text-[9px] font-bold text-primary">
                        {i + 1}
                      </span>
                    </div>
                    <div>
                      <p className="font-mono text-xs font-medium">
                        {step.tool}
                      </p>
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {step.detail}
                      </p>
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </ScrollReveal>
        </div>
      </SectionWrapper>

      {/* ─── Review & Execute ─── */}
      <SectionWrapper>
        <SectionHeader
          badge="SQL Editor"
          title="Review, Edit, Execute"
          subtitle="SQL appears in a full editor. You decide when to run."
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          {editorFeatures.map((feature, i) => {
            const Icon = feature.icon
            return (
              <ScrollReveal key={feature.title} delay={i * 0.1}>
                <Card className="group relative h-full overflow-hidden transition-all hover:border-primary/30 hover:glow-blue">
                  <CardContent className="p-6 md:p-8">
                    <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-primary/10 transition-colors group-hover:bg-primary/15">
                      <Icon className="size-6 text-primary" />
                    </div>
                    <h3 className="mb-2 text-xl font-semibold">
                      {feature.title}
                    </h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {feature.description}
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
            Start Chatting With{" "}
            <span className="text-primary">Your Data</span>
          </h2>

          <p className="mx-auto mt-6 max-w-xl text-lg text-muted-foreground">
            Ask questions in plain English. Get SQL that actually works.
            Review before you run.
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
