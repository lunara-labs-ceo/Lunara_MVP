import { Header } from "@/components/landing/header"
import { Hero } from "@/components/landing/hero"
import { Marquee } from "@/components/landing/marquee"
import { Integrations } from "@/components/landing/integrations"
import { WhoItsFor } from "@/components/landing/who-its-for"
import { HowItWorks } from "@/components/landing/how-it-works"
import { WhyLunara } from "@/components/landing/why-lunara"
import { Agents } from "@/components/landing/agents"
import { FeaturesGrid } from "@/components/landing/features-grid"
import { Stats } from "@/components/landing/stats"
import { TrustStrip } from "@/components/landing/trust-strip"
import { Testimonials } from "@/components/landing/testimonials"
import { Pricing } from "@/components/landing/pricing"
import { FAQ } from "@/components/landing/faq"
import { CTA } from "@/components/landing/cta"
import { Footer } from "@/components/landing/footer"

export default function Home() {
  return (
    <>
      <Header />
      <main>
        <Hero />
        <Marquee />
        <Integrations />
        <WhoItsFor />
        <HowItWorks />
        <WhyLunara />
        <Agents />
        <FeaturesGrid />
        <Stats />
        <TrustStrip />
        <Testimonials />
        <Pricing />
        <FAQ />
        <CTA />
      </main>
      <Footer />
    </>
  )
}
