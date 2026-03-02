import Link from "next/link"
import { Separator } from "@/components/ui/separator"

const footerLinks = {
  Product: [
    { label: "Platform", href: "#how-it-works" },
    { label: "Agents", href: "#agents" },
    { label: "Pricing", href: "#pricing" },
  ],
  Resources: [
    { label: "Documentation", href: "#" },
    { label: "FAQ", href: "#faq" },
  ],
  Legal: [
    { label: "Privacy Policy", href: "#" },
    { label: "Terms of Service", href: "#" },
  ],
}

export function Footer() {
  return (
    <footer className="border-t border-border bg-card/30">
      <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 gap-8 md:grid-cols-4">
          {/* Brand */}
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="flex items-center gap-2.5">
              <div className="size-6 rounded-md bg-primary" />
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
