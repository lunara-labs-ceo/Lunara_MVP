import Link from "next/link"
import { Separator } from "@/components/ui/separator"

const footerLinks = {
  Product: [
    { label: "Semantic Layer", href: "/product/semantic-layer" },
    { label: "Luna", href: "/product/chat" },
    { label: "Reports", href: "/product/reports" },
    { label: "Pricing", href: "/pricing" },
  ],
  Resources: [
    { label: "Documentation", href: "/docs" },
    { label: "Blog", href: "/blog" },
    { label: "Changelog", href: "/changelog" },
    { label: "FAQ", href: "/#faq" },
  ],
  Company: [
    { label: "About", href: "/about" },
    { label: "Security", href: "/security" },
    { label: "Contact", href: "/contact" },
  ],
  Legal: [
    { label: "Privacy Policy", href: "/legal/privacy" },
    { label: "Terms of Service", href: "/legal/terms" },
  ],
}

export function Footer() {
  return (
    <footer className="border-t border-border bg-card/30">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-5">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-2.5">
              <svg width={24} height={24} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
                <path d="M8 4L18 4L18 26L32 26L32 36L8 36L8 4Z" className="fill-foreground" />
                <path d="M20 8L28 8L28 24L20 24L20 8Z" className="fill-background" />
                <circle cx="30" cy="8" r="2" className="fill-foreground" />
                <circle cx="30" cy="16" r="2" className="fill-foreground" />
                <circle cx="12" cy="32" r="2" className="fill-foreground" />
              </svg>
              <span className="text-base font-bold uppercase tracking-tight">Lunara</span>
            </Link>
            <p className="mt-3 text-sm text-muted-foreground">
              Agentic data analytics for modern teams.
            </p>
          </div>

          {/* Link columns */}
          {Object.entries(footerLinks).map(([group, links]) => (
            <div key={group}>
              <h4 className="mb-3 text-sm font-semibold">{group}</h4>
              <ul className="space-y-2">
                {links.map((link) => (
                  <li key={link.label}>
                    <Link
                      href={link.href}
                      className="text-sm text-muted-foreground transition-colors hover:text-foreground"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <Separator className="my-8" />

        <div className="flex flex-col items-center justify-between gap-4 md:flex-row">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span className="font-medium">Lunara Labs Inc.</span>
            <span className="text-muted-foreground/40">|</span>
            <span className="font-mono text-xs">Toronto, Canada</span>
          </div>
          <p className="text-xs text-muted-foreground">
            &copy; {new Date().getFullYear()} Lunara Labs Inc. All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  )
}
