import { Logo } from '@/components/logo'
import Link from 'next/link'

export default function FooterSection() {
    return (
        <footer className="py-16 md:py-24">
            <div className="px-6 lg:px-16">
                <Link
                    href="/"
                    aria-label="go home"
                    className="mx-auto block size-fit">
                    <Logo />
                </Link>

                <div className="my-8 flex flex-wrap justify-center gap-6 text-sm">
                    <a
                        href="/login.html"
                        className="text-muted-foreground hover:text-primary block duration-150">
                        Get Early Access
                    </a>
                    <a
                        href="/login.html"
                        className="text-muted-foreground hover:text-primary block duration-150">
                        Book a Demo
                    </a>
                </div>

                <span className="text-muted-foreground block text-center text-sm">
                    © 2026 Lunara Labs Inc. · Toronto 🇨🇦
                </span>
            </div>
        </footer>
    )
}
