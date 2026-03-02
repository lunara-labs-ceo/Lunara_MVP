import { Header } from "@/components/landing/header"
import { Hero } from "@/components/landing/hero"
import { Marquee } from "@/components/landing/marquee"
import { Integrations } from "@/components/landing/integrations"
import { HowItWorks } from "@/components/landing/how-it-works"
import { Agents } from "@/components/landing/agents"
import { FeaturesGrid } from "@/components/landing/features-grid"
import { Stats } from "@/components/landing/stats"
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
        <HowItWorks />
        <Agents />
        <FeaturesGrid />
        <Stats />
        <Testimonials />
        <Pricing />
        <FAQ />
        <CTA />
      </main>
      <Footer />
    </>
  )
}
