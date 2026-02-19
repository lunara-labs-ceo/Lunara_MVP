import { Button } from '@/components/ui/button'

export default function CallToAction() {
    return (
        <section className="py-16 md:py-32">
            <div className="px-6 lg:px-16">
                <div className="text-center">
                    <h2 className="text-balance text-4xl font-semibold lg:text-5xl">Ready to put your data to work?</h2>
                    <p className="mt-4 text-muted-foreground">Join the waitlist and be among the first to try Lunara.</p>

                    <div className="mt-12 flex flex-wrap justify-center gap-4">
                        <Button asChild size="lg">
                            <a href="/login.html">
                                <span>Get Early Access</span>
                            </a>
                        </Button>
                        <Button asChild size="lg" variant="outline">
                            <a href="/login.html">
                                <span>Book a Demo</span>
                            </a>
                        </Button>
                    </div>
                </div>
            </div>
        </section>
    )
}
