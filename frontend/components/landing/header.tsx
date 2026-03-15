"use client"

import { useState, useRef, useEffect } from "react"
import Link from "next/link"
import { Menu, X, Sun, Moon, ChevronDown, Layers, MessageSquare, PenLine } from "lucide-react"
import { motion, AnimatePresence } from "motion/react"
import { useTheme } from "next-themes"
import { SignedIn, SignedOut, UserButton } from "@clerk/nextjs"
import { Button } from "@/components/ui/button"

const PRODUCT_LINKS = [
  { name: "Atlas", desc: "Schema Intelligence", href: "/product/semantic-layer", icon: Layers, color: "text-blue-500" },
  { name: "Luna", desc: "Data Chat", href: "/product/chat", icon: MessageSquare, color: "text-violet-500" },
  { name: "Quill", desc: "Report Writer", href: "/product/reports", icon: PenLine, color: "text-amber-500" },
]

const NAV_ITEMS = [
  { label: "Pricing", href: "/pricing" },
  { label: "Docs", href: "/docs" },
  { label: "Blog", href: "/blog" },
] as const

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false)
  const [productOpen, setProductOpen] = useState(false)
  const { theme, setTheme } = useTheme()
  const dropdownRef = useRef<HTMLDivElement>(null)

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        dropdownRef.current &&
        !dropdownRef.current.contains(event.target as Node)
      ) {
        setProductOpen(false)
      }
    }
    document.addEventListener("mousedown", handleClickOutside)
    return () => document.removeEventListener("mousedown", handleClickOutside)
  }, [])

  return (
    <header className="sticky top-0 z-50 border-b border-border bg-background/80 backdrop-blur-xl">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Logo */}
        <Link href="/" className="flex items-center gap-2.5">
          <svg width={28} height={28} viewBox="0 0 40 40" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M8 4L18 4L18 26L32 26L32 36L8 36L8 4Z" className="fill-foreground" />
            <path d="M20 8L28 8L28 24L20 24L20 8Z" className="fill-background" />
            <circle cx="30" cy="8" r="2" className="fill-foreground" />
            <circle cx="30" cy="16" r="2" className="fill-foreground" />
            <circle cx="12" cy="32" r="2" className="fill-foreground" />
          </svg>
          <span className="text-lg font-bold uppercase tracking-tight">Lunara</span>
        </Link>

        {/* Desktop nav */}
        <div className="hidden items-center gap-1 md:flex">
          {/* Product dropdown */}
          <div ref={dropdownRef} className="relative">
            <button
              onClick={() => setProductOpen(!productOpen)}
              className="flex items-center gap-1 rounded-md px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              Your Agents
              <ChevronDown
                className={`size-3.5 transition-transform ${productOpen ? "rotate-180" : ""}`}
              />
            </button>

            <AnimatePresence>
              {productOpen && (
                <motion.div
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: 4 }}
                  transition={{ duration: 0.15 }}
                  className="absolute left-0 top-full mt-1 w-72 rounded-lg border border-border bg-card p-2 shadow-lg"
                >
                  {PRODUCT_LINKS.map((link) => (
                    <Link
                      key={link.name}
                      href={link.href}
                      onClick={() => setProductOpen(false)}
                      className="flex items-start gap-3 rounded-md px-3 py-2.5 transition-colors hover:bg-accent"
                    >
                      <link.icon className={`size-5 mt-0.5 shrink-0 ${link.color}`} />
                      <div>
                        <div className="text-sm font-semibold text-foreground">{link.name}</div>
                        <div className="text-xs text-muted-foreground">{link.desc}</div>
                      </div>
                    </Link>
                  ))}
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Regular nav links */}
          {NAV_ITEMS.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="rounded-md px-3.5 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              {link.label}
            </Link>
          ))}
        </div>

        {/* Desktop CTAs */}
        <div className="hidden items-center gap-3 md:flex">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            aria-label="Toggle theme"
            className="size-8 p-0"
          >
            <Sun className="size-4 rotate-0 scale-100 transition-transform dark:-rotate-90 dark:scale-0" />
            <Moon className="absolute size-4 rotate-90 scale-0 transition-transform dark:rotate-0 dark:scale-100" />
          </Button>
          <SignedOut>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/sign-in">Log In</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/sign-up">Get Access</Link>
            </Button>
          </SignedOut>
          <SignedIn>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/dashboard">Dashboard</Link>
            </Button>
            <UserButton />
          </SignedIn>
        </div>

        {/* Mobile hamburger */}
        <button
          className="md:hidden text-foreground"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="size-6" /> : <Menu className="size-6" />}
        </button>
      </nav>

      {/* Mobile menu */}
      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden border-t border-border bg-background md:hidden"
          >
            <div className="flex flex-col gap-1 px-4 py-4">
              {/* Agent links — flattened with header */}
              <span className="px-3 pt-1 pb-1 text-xs font-semibold uppercase tracking-wider text-muted-foreground/60">
                Your Agents
              </span>
              {PRODUCT_LINKS.map((link) => (
                <Link
                  key={link.name}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="flex items-start gap-3 rounded-md px-3 py-2.5 pl-6 transition-colors hover:bg-accent"
                >
                  <link.icon className={`size-5 mt-0.5 shrink-0 ${link.color}`} />
                  <div>
                    <div className="text-sm font-semibold text-foreground">{link.name}</div>
                    <div className="text-xs text-muted-foreground">{link.desc}</div>
                  </div>
                </Link>
              ))}

              {/* Regular nav links */}
              {NAV_ITEMS.map((link) => (
                <Link
                  key={link.label}
                  href={link.href}
                  onClick={() => setMobileOpen(false)}
                  className="rounded-md px-3 py-2.5 text-sm font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
                >
                  {link.label}
                </Link>
              ))}

              <div className="mt-3 flex flex-col gap-2 border-t border-border pt-4">
                <SignedOut>
                  <Button variant="outline" asChild className="w-full">
                    <Link href="/sign-in">Log In</Link>
                  </Button>
                  <Button asChild className="w-full">
                    <Link href="/sign-up">Get Access</Link>
                  </Button>
                </SignedOut>
                <SignedIn>
                  <Button variant="outline" asChild className="w-full">
                    <Link href="/dashboard">Dashboard</Link>
                  </Button>
                </SignedIn>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </header>
  )
}
