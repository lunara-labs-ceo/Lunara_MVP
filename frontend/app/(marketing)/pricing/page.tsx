import type { Metadata } from "next"
import Link from "next/link"
import { Check, X, ArrowRight } from "lucide-react"
import { cn } from "@/lib/utils"
import { SectionWrapper } from "@/components/shared/section-wrapper"
import { SectionHeader } from "@/components/shared/section-header"
import { ScrollReveal } from "@/components/shared/scroll-reveal"
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import {
  Accordion,
  AccordionItem,
  AccordionTrigger,
  AccordionContent,
} from "@/components/ui/accordion"

export const metadata: Metadata = {
  title: "Pricing - Lunara | AI Data Analytics Platform",
  description:
    "Simple, transparent pricing. Start free with 3 AI agents, unlimited queries, and AI-generated reports. Upgrade to Pro for $25/month.",
}

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const FREE_FEATURES = [
  "3 AI Agents — Atlas, Luna & Quill",
  "50 credits / month",
  "1 data warehouse connection",
  "Chat history & saved queries",
  "Editable reports with rich-text editor",
  "Community support",
]

const PRO_FEATURES = [
  "Everything in Free",
  "1,000 credits / month",
  "Multiple warehouse connections",
  "Team collaboration & sharing",
  "Priority support",
  "Annual billing option (save 20%)",
]

interface ComparisonRow {
  feature: string
  free: boolean | string
  pro: boolean | string
}

const COMPARISON_ROWS: ComparisonRow[] = [
  { feature: "AI Agents (Atlas, Luna, Quill)", free: "3", pro: "3" },
  { feature: "Monthly credits", free: "50", pro: "1,000" },
  { feature: "Data warehouse connections", free: "1", pro: "Unlimited" },
  { feature: "Editable reports", free: true, pro: true },
  { feature: "Chat history & saved queries", free: true, pro: true },
  { feature: "Team collaboration", free: false, pro: true },
  { feature: "Priority support", free: false, pro: true },
]

const FAQ_ITEMS = [
  {
    question: "Is there really a free tier?",
    answer:
      "Yes. The free tier gives you 50 credits per month with full access to all three AI agents — Atlas, Luna, and Quill. No credit card required.",
  },
  {
    question: "What are credits?",
    answer:
      "Credits are consumed when you use AI features. A Luna chat query costs 1 credit, Atlas semantic layer generation costs 3 credits, and a Quill report generation costs 5 credits. Credits reset monthly.",
  },
  {
    question: "What happens when I run out of credits?",
    answer:
      "You'll be prompted to upgrade to Pro. Your data, sessions, and reports are never deleted — you just can't generate new AI content until credits reset or you upgrade.",
  },
  {
    question: "Can I cancel anytime?",
    answer:
      "Yes, there are no contracts or cancellation fees. You can downgrade back to the free tier at any time and keep access until the end of your billing period.",
  },
  {
    question: "Do you offer annual billing?",
    answer:
      "Yes! The annual plan is $240/year ($20/month effective) — a 20% savings compared to monthly billing.",
  },
  {
    question: "Need a custom plan?",
    answer:
      "For enterprise pricing, custom integrations, dedicated support, or specific compliance requirements, reach out to us at shyamsarma@lunaralabs.ca and we will put together a plan that fits your needs.",
  },
]

/* ------------------------------------------------------------------ */
/*  Helper                                                             */
/* ------------------------------------------------------------------ */

function FeatureIcon({ included }: { included: boolean }) {
  return (
    <div
      className={cn(
        "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
        included ? "bg-primary/10" : "bg-muted"
      )}
    >
      {included ? (
        <Check className="size-3 text-primary" />
      ) : (
        <X className="size-3 text-muted-foreground" />
      )}
    </div>
  )
}

function CellValue({ value }: { value: boolean | string }) {
  if (typeof value === "string") {
    return <span className="text-sm font-medium">{value}</span>
  }
  return value ? (
    <div className="flex size-5 items-center justify-center rounded-full bg-primary/10">
      <Check className="size-3 text-primary" />
    </div>
  ) : (
    <div className="flex size-5 items-center justify-center rounded-full bg-muted">
      <X className="size-3 text-muted-foreground" />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function PricingPage() {
  return (
    <>
      {/* ---- Hero ---- */}
      <SectionWrapper className="py-24 md:py-32">
        <SectionHeader
          badge="PRICING"
          title="Simple, Transparent Pricing"
          subtitle="Start free. Scale when you're ready."
        />

        {/* ---- Plan Cards ---- */}
        <div className="mx-auto grid max-w-4xl grid-cols-1 gap-8 md:grid-cols-2">
          {/* Free */}
          <ScrollReveal>
            <Card className="group relative h-full transition-all hover:border-primary/30 hover:glow-blue">
              <CardHeader className="pb-4">
                <CardTitle className="text-xl">Free</CardTitle>
                <div className="mt-2">
                  <span className="text-5xl font-semibold">$0</span>
                </div>
                <CardDescription className="mt-2">
                  Everything you need to start exploring your data with AI
                  agents.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-6">
                <ul className="space-y-3">
                  {FREE_FEATURES.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5">
                      <FeatureIcon included />
                      <span className="text-sm text-muted-foreground">
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Button variant="outline" size="lg" className="w-full" asChild>
                  <Link href="/sign-up">
                    Get Started Free
                    <ArrowRight className="ml-1 size-4" />
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          </ScrollReveal>

          {/* Pro (highlighted) */}
          <ScrollReveal delay={0.15}>
            <Card className="group relative h-full border-primary/40 glow-blue transition-all">
              <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                <Badge className="bg-primary text-primary-foreground">
                  Most Popular
                </Badge>
              </div>
              <CardHeader className="pb-4">
                <CardTitle className="text-xl">Pro</CardTitle>
                <div className="mt-2 flex items-baseline gap-1">
                  <span className="text-5xl font-semibold">$25</span>
                  <span className="text-sm text-muted-foreground">/month</span>
                </div>
                <CardDescription className="mt-2">
                  1,000 credits/month. Team collaboration and priority support.
                </CardDescription>
              </CardHeader>
              <CardContent className="flex flex-1 flex-col gap-6">
                <ul className="space-y-3">
                  {PRO_FEATURES.map((feature) => (
                    <li key={feature} className="flex items-start gap-2.5">
                      <FeatureIcon included />
                      <span className="text-sm text-muted-foreground">
                        {feature}
                      </span>
                    </li>
                  ))}
                </ul>
              </CardContent>
              <CardFooter>
                <Button size="lg" className="w-full" asChild>
                  <Link href="/sign-up">
                    Get Started
                    <ArrowRight className="ml-1 size-4" />
                  </Link>
                </Button>
              </CardFooter>
            </Card>
          </ScrollReveal>
        </div>
      </SectionWrapper>

      {/* ---- Feature Comparison ---- */}
      <SectionWrapper>
        <SectionHeader badge="COMPARE" title="Feature Comparison" />

        <ScrollReveal>
          <div className="mx-auto max-w-3xl overflow-x-auto">
            {/* Header row */}
            <div className="grid min-w-[480px] grid-cols-[1fr_100px_100px] items-center gap-4 border-b pb-4">
              <span className="text-sm font-medium text-muted-foreground">
                Feature
              </span>
              <span className="text-center text-sm font-semibold">Free</span>
              <span className="text-center text-sm font-semibold">Pro</span>
            </div>

            {/* Data rows */}
            {COMPARISON_ROWS.map((row) => (
              <div
                key={row.feature}
                className="grid min-w-[480px] grid-cols-[1fr_100px_100px] items-center gap-4 border-b py-4 last:border-b-0"
              >
                <span className="text-sm">{row.feature}</span>
                <div className="flex justify-center">
                  <CellValue value={row.free} />
                </div>
                <div className="flex justify-center">
                  <CellValue value={row.pro} />
                </div>
              </div>
            ))}
          </div>
        </ScrollReveal>
      </SectionWrapper>

      {/* ---- Pricing FAQ ---- */}
      <SectionWrapper>
        <SectionHeader badge="FAQ" title="Pricing Questions" />

        <ScrollReveal>
          <div className="mx-auto max-w-2xl">
            <Accordion type="single" collapsible>
              {FAQ_ITEMS.map((item, i) => (
                <AccordionItem key={i} value={`faq-${i}`}>
                  <AccordionTrigger className="text-left text-base">
                    {item.question}
                  </AccordionTrigger>
                  <AccordionContent className="text-muted-foreground">
                    {item.answer}
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </div>
        </ScrollReveal>
      </SectionWrapper>

      {/* ---- Enterprise CTA ---- */}
      <SectionWrapper className="pb-28 md:pb-36">
        <ScrollReveal>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-semibold tracking-tight md:text-4xl">
              Need something custom?
            </h2>
            <p className="mt-4 text-lg text-muted-foreground">
              Contact us for enterprise pricing, custom integrations, and
              dedicated support.
            </p>
            <div className="mt-8 flex flex-col items-center gap-4">
              <Button variant="outline" size="lg" asChild>
                <Link href="/contact">
                  Contact Sales
                  <ArrowRight className="ml-1 size-4" />
                </Link>
              </Button>
              <p className="text-sm text-muted-foreground">
                Or email us at{" "}
                <a
                  href="mailto:shyamsarma@lunaralabs.ca"
                  className="text-primary underline underline-offset-4 hover:text-primary/80"
                >
                  shyamsarma@lunaralabs.ca
                </a>
              </p>
            </div>
          </div>
        </ScrollReveal>
      </SectionWrapper>
    </>
  )
}
