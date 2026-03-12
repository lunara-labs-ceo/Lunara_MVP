import type { Metadata } from "next"
import Link from "next/link"
import { Rocket, Shield, Users, MapPin, ArrowRight } from "lucide-react"
import { SectionWrapper } from "@/components/shared/section-wrapper"
import { SectionHeader } from "@/components/shared/section-header"
import { ScrollReveal } from "@/components/shared/scroll-reveal"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = {
  title: "About - Lunara Labs | AI-Powered Data Analytics",
  description:
    "Lunara Labs is building the future of data analytics with AI agents. Founded in Toronto, Canada.",
}

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const values = [
  {
    icon: Rocket,
    title: "Ship Fast",
    description: "We move quickly and ship real features to real users.",
  },
  {
    icon: Shield,
    title: "Data First",
    description: "Your data stays in your database. Always.",
  },
  {
    icon: Users,
    title: "Human-in-the-Loop",
    description: "AI proposes, humans approve. Full control.",
  },
]

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function AboutPage() {
  return (
    <>
      {/* ── Hero ────────────────────────────────────────────── */}
      <SectionWrapper className="py-24 md:py-32">
        <SectionHeader
          badge="ABOUT"
          title="Making Data Accessible to Everyone"
          subtitle="Lunara is an AI-powered analytics platform that lets anyone explore data, generate reports, and get answers — without writing a single line of SQL."
        />
      </SectionWrapper>

      {/* ── Mission ─────────────────────────────────────────── */}
      <SectionWrapper>
        <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Left — mission text */}
          <ScrollReveal direction="left">
            <div>
              <h3 className="mb-6 text-3xl font-semibold tracking-tight md:text-4xl">
                Our Mission
              </h3>
              <div className="space-y-4 text-base leading-relaxed text-muted-foreground">
                <p>
                  We believe everyone in an organization should be able to
                  access and understand their data. Not just the SQL experts.
                  Not just the data team. Everyone.
                </p>
                <p>
                  Lunara&apos;s AI agents bridge the gap between raw data and
                  actionable insights by building a semantic layer that gives AI
                  the context it needs to generate accurate queries.
                </p>
              </div>
            </div>
          </ScrollReveal>

          {/* Right — value cards */}
          <div className="flex flex-col gap-4">
            {values.map((value, i) => {
              const Icon = value.icon
              return (
                <ScrollReveal key={value.title} delay={i * 0.1} direction="right">
                  <Card className="group relative overflow-hidden transition-all hover:border-primary/30 hover:glow-blue">
                    <CardContent className="flex items-start gap-4 p-6">
                      <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 transition-colors group-hover:bg-primary/15">
                        <Icon className="size-6 text-primary" />
                      </div>
                      <div>
                        <h4 className="mb-1 text-lg font-semibold">
                          {value.title}
                        </h4>
                        <p className="text-sm leading-relaxed text-muted-foreground">
                          {value.description}
                        </p>
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
        </div>
      </SectionWrapper>

      {/* ── Team ────────────────────────────────────────────── */}
      <SectionWrapper>
        <SectionHeader badge="TEAM" title="Built by" />

        <ScrollReveal>
          <div className="mx-auto max-w-md">
            <Card className="group relative overflow-hidden transition-all hover:border-primary/30 hover:glow-blue">
              <CardContent className="p-6 md:p-8">
                <div className="mb-4 flex size-14 items-center justify-center rounded-full bg-primary/10 text-xl font-semibold text-primary">
                  SS
                </div>
                <h3 className="text-xl font-semibold">Shyam Sarma</h3>
                <p className="mt-1 text-sm font-medium text-primary">
                  Founder &amp; CEO
                </p>
                <div className="mt-2 flex items-center gap-1.5 text-sm text-muted-foreground">
                  <MapPin className="size-3.5" />
                  Toronto, Canada
                </div>
                <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
                  Building Lunara to democratize data analytics with AI agents.
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
          </div>
        </ScrollReveal>
      </SectionWrapper>

      {/* ── Contact CTA ─────────────────────────────────────── */}
      <SectionWrapper className="pb-28 md:pb-36">
        <ScrollReveal>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
              Want to learn more?
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              We&apos;d love to hear from you. Reach out with questions about the
              product, pricing, or partnerships.
            </p>
            <div className="mt-8">
              <Button size="lg" asChild>
                <Link href="/contact">
                  Get in Touch
                  <ArrowRight className="ml-1 size-4" />
                </Link>
              </Button>
            </div>
          </div>
        </ScrollReveal>
      </SectionWrapper>
    </>
  )
}
