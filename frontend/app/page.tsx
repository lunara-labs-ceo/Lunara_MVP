import HeroSection from '@/components/hero-section'
import MarqueeStrip from '@/components/MarqueeStrip'
import Features from '@/components/features-1'
import CallToAction from '@/components/call-to-action'
import Footer from '@/components/footer'

export default function Home() {
    return (
        <>
            <HeroSection />
            <MarqueeStrip />
            <Features />
            <CallToAction />
            <Footer />
        </>
    )
}
