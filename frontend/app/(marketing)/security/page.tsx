import type { Metadata } from "next"
import Link from "next/link"
import {
  Shield,
  Lock,
  UserCheck,
  Monitor,
  Server,
  Database,
  KeyRound,
  Brain,
  Box,
  Eye,
  RefreshCw,
  ArrowRight,
  ArrowDown,
  Mail,
} from "lucide-react"
import { cn } from "@/lib/utils"
import { SectionWrapper } from "@/components/shared/section-wrapper"
import { SectionHeader } from "@/components/shared/section-header"
import { ScrollReveal } from "@/components/shared/scroll-reveal"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = {
  title: "Security - Lunara | Your Data Stays Yours",
  description:
    "Lunara never stores your raw data. Queries run against your database using your credentials. Encrypted connections, human-in-the-loop control, and SOC 2 compliant infrastructure.",
}

const corePrinciples = [
  {
    icon: Shield,
    title: "Zero Data Storage",
    description:
      "Lunara never stores your raw data. Every query runs directly against your database using your own credentials. Results are displayed in your browser and never persisted on our servers.",
  },
  {
    icon: Lock,
    title: "Encrypted Credentials",
    description:
      "Your database connection strings are encrypted with AES/Fernet encryption before storage. Credentials are only decrypted at query time and never logged or exposed.",
  },
  {
    icon: UserCheck,
    title: "Human-in-the-Loop",
    description:
      "No query ever runs without your explicit approval. AI generates SQL, you review it, you decide when to execute. You are always in control.",
  },
]

const securityFeatures = [
  {
    icon: KeyRound,
    title: "Authentication",
    description:
      "Powered by Clerk with SOC 2 Type II compliance. Enterprise-grade auth with SSO, MFA, and session management.",
  },
  {
    icon: Server,
    title: "Infrastructure",
    description:
      "Hosted on Render with Supabase (SOC 2 compliant) for metadata storage. Your data warehouse stays in your own infrastructure.",
  },
  {
    icon: Brain,
    title: "AI Privacy",
    description:
      "Google Gemini analyzes your schema structure \u2014 table names, column types, relationships. It never sees your actual data rows.",
  },
  {
    icon: Box,
    title: "Sandbox Isolation",
    description:
      "Report code execution runs in isolated GCP sandboxes with automatic TTL cleanup. No persistent access to your systems.",
  },
  {
    icon: Eye,
    title: "Transparency",
    description:
      "See exactly what SQL will run before it executes. Full chain-of-thought visibility into agent reasoning.",
  },
  {
    icon: RefreshCw,
    title: "No Vendor Lock-in",
    description:
      "Your semantic layer model is exportable. Your data never leaves your warehouse. Cancel anytime with zero data loss.",
  },
]

const flowSteps = [
  {
    icon: Monitor,
    label: "Your Browser",
    description: "Chat interface, SQL editor, results viewer",
  },
  {
    icon: Server,
    label: "Lunara API",
    description: "AI agents, semantic layer, query routing",
  },
  {
    icon: Database,
    label: "Your Database",
    description: "Your data stays here. Always.",
  },
]

const flowArrows = [
  { label: "Natural language questions", direction: "forward" as const },
  { label: "Generated SQL (after your approval)", direction: "forward" as const },
]

const flowReturn = "Query results (not stored)"

export default function SecurityPage() {
  return (
    <>
      {/* ── Hero ────────────────────────────────────────────── */}
      <SectionWrapper className="py-24 md:py-32">
        <SectionHeader
          badge="SECURITY"
          title="Your Data Stays Yours"
          subtitle="Lunara is designed so your data never leaves your infrastructure. We provide the AI \u2014 you keep full control."
        />
      </SectionWrapper>

      {/* ── Core Principles ─────────────────────────────────── */}
      <SectionWrapper>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {corePrinciples.map((principle, i) => {
            const Icon = principle.icon
            return (
              <ScrollReveal key={principle.title} delay={i * 0.1}>
                <Card className="group relative h-full overflow-hidden transition-all hover:border-primary/30 hover:glow-blue">
                  <CardContent className="p-6 md:p-8">
                    <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-primary/10 transition-colors group-hover:bg-primary/15">
                      <Icon className="size-6 text-primary" />
                    </div>
                    <h3 className="mb-2 text-xl font-semibold">
                      {principle.title}
                    </h3>
                    <p className="text-sm leading-relaxed text-muted-foreground">
                      {principle.description}
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

      {/* ── Architecture / Data Flow ────────────────────────── */}
      <SectionWrapper>
        <SectionHeader
          badge="ARCHITECTURE"
          title="How Your Data Flows"
        />

        {/* Desktop: horizontal flow */}
        <ScrollReveal>
          <div className="hidden md:block">
            <div className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-0">
              {/* Step 1 – Browser */}
              <FlowBox
                icon={Monitor}
                label={flowSteps[0].label}
                description={flowSteps[0].description}
              />

              {/* Arrow 1 */}
              <FlowArrowHorizontal
                topLabel={flowArrows[0].label}
                bottomLabel={flowReturn}
                showReturn
              />

              {/* Step 2 – API */}
              <FlowBox
                icon={Server}
                label={flowSteps[1].label}
                description={flowSteps[1].description}
              />

              {/* Arrow 2 */}
              <FlowArrowHorizontal
                topLabel={flowArrows[1].label}
                bottomLabel={flowReturn}
                showReturn={false}
              />

              {/* Step 3 – Database */}
              <FlowBox
                icon={Database}
                label={flowSteps[2].label}
                description={flowSteps[2].description}
                highlight
              />
            </div>

            {/* Return path label spanning full width */}
            <div className="mt-4 flex items-center justify-center gap-2 text-sm text-muted-foreground">
              <ArrowRight className="size-4 rotate-180 text-primary/50" />
              <span>Query results flow back to your browser (not stored on our servers)</span>
              <ArrowRight className="size-4 rotate-180 text-primary/50" />
            </div>
          </div>
        </ScrollReveal>

        {/* Mobile: vertical flow */}
        <ScrollReveal>
          <div className="flex flex-col items-center gap-0 md:hidden">
            {flowSteps.map((step, i) => {
              const Icon = step.icon
              const isLast = i === flowSteps.length - 1
              return (
                <div key={step.label} className="flex w-full max-w-sm flex-col items-center">
                  <div
                    className={cn(
                      "w-full rounded-xl border bg-card p-6 text-center",
                      isLast && "border-primary/30 bg-primary/5"
                    )}
                  >
                    <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-xl bg-primary/10">
                      <Icon className="size-6 text-primary" />
                    </div>
                    <h4 className="mb-1 text-lg font-semibold">{step.label}</h4>
                    <p className="text-sm text-muted-foreground">
                      {step.description}
                    </p>
                  </div>
                  {!isLast && (
                    <div className="flex flex-col items-center py-3">
                      <span className="mb-1 text-xs text-muted-foreground">
                        {flowArrows[i].label}
                      </span>
                      <ArrowDown className="size-5 text-primary/50" />
                    </div>
                  )}
                </div>
              )
            })}
            <div className="mt-4 text-center text-sm text-muted-foreground">
              <ArrowDown className="mx-auto mb-1 size-4 rotate-180 text-primary/50" />
              Query results flow back (not stored)
            </div>
          </div>
        </ScrollReveal>
      </SectionWrapper>

      {/* ── Security Features Grid ──────────────────────────── */}
      <SectionWrapper>
        <SectionHeader
          badge="FEATURES"
          title="Security at Every Layer"
        />

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {securityFeatures.map((feature, i) => {
            const Icon = feature.icon
            return (
              <ScrollReveal key={feature.title} delay={i * 0.08}>
                <Card className="group relative h-full overflow-hidden transition-all hover:border-primary/30 hover:glow-blue">
                  <CardContent className="p-6 md:p-8">
                    <div className="mb-4 flex size-12 items-center justify-center rounded-xl bg-primary/10 transition-colors group-hover:bg-primary/15">
                      <Icon className="size-6 text-primary" />
                    </div>
                    <h3 className="mb-2 text-lg font-semibold">
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

      {/* ── Contact CTA ─────────────────────────────────────── */}
      <SectionWrapper className="pb-28">
        <ScrollReveal>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="mb-4 text-3xl font-semibold tracking-tight md:text-4xl">
              Have security questions?
            </h2>
            <p className="mb-8 text-lg leading-relaxed text-muted-foreground">
              We take data security seriously. If you have questions about our
              security practices, architecture, or compliance, we&apos;re happy
              to discuss.
            </p>
            <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
              <Button asChild size="lg">
                <Link href="/contact">Contact Us</Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <a href="mailto:shyamsarma@lunaralabs.ca">
                  <Mail className="size-4" />
                  shyamsarma@lunaralabs.ca
                </a>
              </Button>
            </div>
          </div>
        </ScrollReveal>
      </SectionWrapper>
    </>
  )
}

/* ─── Architecture Flow Sub-components ─────────────────────── */

function FlowBox({
  icon: Icon,
  label,
  description,
  highlight = false,
}: {
  icon: React.ComponentType<{ className?: string }>
  label: string
  description: string
  highlight?: boolean
}) {
  return (
    <div
      className={cn(
        "rounded-xl border bg-card p-6 text-center",
        highlight && "border-primary/30 bg-primary/5"
      )}
    >
      <div className="mx-auto mb-3 flex size-12 items-center justify-center rounded-xl bg-primary/10">
        <Icon className="size-6 text-primary" />
      </div>
      <h4 className="mb-1 text-lg font-semibold">{label}</h4>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  )
}

function FlowArrowHorizontal({
  topLabel,
  bottomLabel,
  showReturn,
}: {
  topLabel: string
  bottomLabel: string
  showReturn: boolean
}) {
  return (
    <div className="flex flex-col items-center gap-2 px-4">
      {/* Forward arrow */}
      <span className="text-xs text-muted-foreground whitespace-nowrap">
        {topLabel}
      </span>
      <div className="flex items-center gap-1">
        <div className="h-px w-12 border-t-2 border-dashed border-primary/30" />
        <ArrowRight className="size-4 text-primary/50" />
      </div>
      {/* Return arrow (only shown on first connector) */}
      {showReturn && (
        <>
          <div className="flex items-center gap-1">
            <ArrowRight className="size-4 rotate-180 text-primary/30" />
            <div className="h-px w-12 border-t-2 border-dashed border-primary/20" />
          </div>
          <span className="text-xs text-muted-foreground/60 whitespace-nowrap">
            {bottomLabel}
          </span>
        </>
      )}
    </div>
  )
}
