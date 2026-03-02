import { cn } from "@/lib/utils"

interface SectionWrapperProps {
  children: React.ReactNode
  className?: string
  id?: string
  fullBleed?: boolean
}

export function SectionWrapper({ children, className, id, fullBleed = false }: SectionWrapperProps) {
  return (
    <section id={id} className={cn("py-20 md:py-28", className)}>
      {fullBleed ? (
        children
      ) : (
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">{children}</div>
      )}
    </section>
  )
}
