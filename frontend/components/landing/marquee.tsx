import { MARQUEE_ITEMS } from "@/lib/constants"

export function Marquee() {
  const items = [...MARQUEE_ITEMS, ...MARQUEE_ITEMS]

  return (
    <section className="relative z-10 border-y border-border bg-card py-4 overflow-hidden">
      <div className="animate-marquee flex whitespace-nowrap">
        {items.map((item, i) => (
          <span key={i} className="flex items-center">
            <span className="px-6 font-mono text-sm uppercase tracking-[0.2em] text-muted-foreground">
              {item}
            </span>
            <span className="text-muted-foreground/40">&#9670;</span>
          </span>
        ))}
      </div>
    </section>
  )
}
