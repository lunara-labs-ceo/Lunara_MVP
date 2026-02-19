import { Button } from '@/components/ui/button'
import { ChevronRight } from 'lucide-react'

export default function CallToAction() {
    return (
        <section className="bg-background @container py-24">
            <div className="mx-auto max-w-2xl px-6">
                <div className="text-center">
                    <h2 className="text-balance font-serif text-4xl font-medium">Ready to put your data to work?</h2>
                    <p className="text-muted-foreground mx-auto mt-4 max-w-md text-balance">Join the waitlist and be among the first to try Lunara.</p>
                    <div className="mt-6 flex flex-wrap justify-center gap-3">
                        <Button
                            asChild
                            className="pr-1.5">
                            <a href="/login.html">
                                <span>Get Early Access</span>
                                <ChevronRight className="opacity-50" />
                            </a>
                        </Button>
                        <Button
                            variant="outline"
                            asChild>
                            <a href="/login.html">Book a Demo</a>
                        </Button>
                    </div>
                </div>
            </div>
        </section>
    )
}
