import type { Metadata } from "next"
import { Mail, MapPin, Clock } from "lucide-react"
import { SectionWrapper } from "@/components/shared/section-wrapper"
import { SectionHeader } from "@/components/shared/section-header"
import { ScrollReveal } from "@/components/shared/scroll-reveal"
import { Card, CardContent } from "@/components/ui/card"
import { ContactForm } from "@/components/landing/contact-form"

export const metadata: Metadata = {
  title: "Contact - Lunara Labs",
  description:
    "Get in touch with the Lunara team. Questions about pricing, security, or the product? We'd love to hear from you.",
}

/* ------------------------------------------------------------------ */
/*  Data                                                               */
/* ------------------------------------------------------------------ */

const contactInfo = [
  {
    icon: Mail,
    title: "Email",
    detail: "shyamsarma@lunaralabs.ca",
    href: "mailto:shyamsarma@lunaralabs.ca",
  },
  {
    icon: MapPin,
    title: "Location",
    detail: "Toronto, Canada",
  },
  {
    icon: Clock,
    title: "Response Time",
    detail: "We typically respond within 24 hours",
  },
]

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function ContactPage() {
  return (
    <>
      {/* ── Hero ────────────────────────────────────────────── */}
      <SectionWrapper className="py-24 md:py-32">
        <SectionHeader
          badge="CONTACT"
          title="Get in Touch"
          subtitle="Have questions? We'd love to hear from you."
        />
      </SectionWrapper>

      {/* ── Form + Info ─────────────────────────────────────── */}
      <SectionWrapper className="pb-28 md:pb-36">
        <div className="grid grid-cols-1 items-start gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Left — contact form */}
          <ScrollReveal direction="left">
            <ContactForm />
          </ScrollReveal>

          {/* Right — contact info cards */}
          <div className="flex flex-col gap-4">
            {contactInfo.map((item, i) => {
              const Icon = item.icon
              return (
                <ScrollReveal key={item.title} delay={i * 0.1} direction="right">
                  <Card className="group relative overflow-hidden transition-all hover:border-primary/30 hover:glow-blue">
                    <CardContent className="flex items-start gap-4 p-6">
                      <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-primary/10 transition-colors group-hover:bg-primary/15">
                        <Icon className="size-6 text-primary" />
                      </div>
                      <div>
                        <h4 className="mb-1 text-lg font-semibold">
                          {item.title}
                        </h4>
                        {item.href ? (
                          <a
                            href={item.href}
                            className="text-sm text-primary underline underline-offset-4 hover:text-primary/80"
                          >
                            {item.detail}
                          </a>
                        ) : (
                          <p className="text-sm text-muted-foreground">
                            {item.detail}
                          </p>
                        )}
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
    </>
  )
}
