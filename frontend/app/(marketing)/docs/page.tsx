import type { Metadata } from "next"
import Link from "next/link"
import { ArrowRight, FileText } from "lucide-react"
import { Card, CardContent, CardHeader } from "@/components/ui/card"
import { SectionWrapper } from "@/components/shared/section-wrapper"
import { SectionHeader } from "@/components/shared/section-header"
import { ScrollReveal } from "@/components/shared/scroll-reveal"
import { getAllDocPages } from "@/lib/mdx"

export const metadata: Metadata = {
  title: "Documentation - Lunara",
  description:
    "Learn how to connect, explore, and analyze your data with Lunara's AI agents.",
}

export default function DocsIndexPage() {
  const docs = getAllDocPages()

  return (
    <SectionWrapper className="pt-32 md:pt-40">
      <SectionHeader
        badge="DOCS"
        title="Documentation"
        subtitle="Everything you need to get started with Lunara."
      />

      {docs.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-muted-foreground text-lg">
            Documentation is coming soon.
          </p>
        </div>
      ) : (
        <div className="mx-auto max-w-3xl space-y-4">
          {docs.map((doc, i) => (
            <ScrollReveal key={doc.slug} delay={i * 0.08}>
              <Link href={`/docs/${doc.slug}`} className="group block">
                <Card className="transition-colors hover:border-foreground/20">
                  <CardHeader className="flex-row items-center gap-4">
                    <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-muted">
                      <FileText className="size-5 text-muted-foreground" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-lg font-semibold group-hover:text-primary/80 transition-colors">
                        {doc.title}
                      </h3>
                    </div>
                    <ArrowRight className="size-4 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                  </CardHeader>
                  {doc.description && (
                    <CardContent className="-mt-2">
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {doc.description}
                      </p>
                    </CardContent>
                  )}
                </Card>
              </Link>
            </ScrollReveal>
          ))}
        </div>
      )}
    </SectionWrapper>
  )
}
