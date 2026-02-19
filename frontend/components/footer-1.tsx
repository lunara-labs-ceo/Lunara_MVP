import Link from 'next/link'
import { Logo } from '@/components/logo'

export default function Footer() {
    return (
        <footer className="bg-background @container border-t py-12">
            <div className="mx-auto max-w-2xl px-6">
                <div className="flex flex-col items-start gap-4">
                    <Link
                        href="/"
                        className="flex items-center gap-2">
                        <Logo className="h-7 w-auto" />
                    </Link>
                    <p className="text-muted-foreground max-w-xs text-sm">Agentic BI for modern data teams. Connect your warehouse, ask questions, get answers.</p>
                </div>
                <div className="mt-10 flex flex-wrap items-center justify-between gap-4 border-t pt-8">
                    <p className="text-muted-foreground text-sm">© 2026 Lunara Labs Inc. · Toronto 🇨🇦</p>
                    <div className="flex gap-4">
                        <Link
                            href="/login.html"
                            className="text-muted-foreground hover:text-foreground text-sm transition-colors">
                            Get Early Access
                        </Link>
                    </div>
                </div>
            </div>
        </footer>
    )
}
