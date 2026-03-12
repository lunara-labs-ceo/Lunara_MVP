import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, ArrowRight, ChevronRight } from "lucide-react"
import { MDXRemote } from "next-mdx-remote/rsc"
import { cn } from "@/lib/utils"
import { SectionWrapper } from "@/components/shared/section-wrapper"
import { getAllDocPages, getDocPage } from "@/lib/mdx"

// Custom MDX components for docs — consistent with blog but tuned for technical content
const mdxComponents = {
  h1: (props: React.ComponentProps<"h1">) => (
    <h1
      className="text-3xl font-semibold tracking-tight mt-10 mb-4 first:mt-0"
      {...props}
    />
  ),
  h2: (props: React.ComponentProps<"h2">) => (
    <h2
      className="text-2xl font-semibold tracking-tight mt-10 mb-4"
      {...props}
    />
  ),
  h3: (props: React.ComponentProps<"h3">) => (
    <h3 className="text-xl font-semibold mt-8 mb-3" {...props} />
  ),
  h4: (props: React.ComponentProps<"h4">) => (
    <h4 className="text-lg font-semibold mt-6 mb-2" {...props} />
  ),
  p: (props: React.ComponentProps<"p">) => (
    <p className="text-muted-foreground leading-relaxed mb-4" {...props} />
  ),
  a: (props: React.ComponentProps<"a">) => (
    <a
      className="text-foreground underline underline-offset-4 hover:text-primary transition-colors"
      target={props.href?.startsWith("http") ? "_blank" : undefined}
      rel={props.href?.startsWith("http") ? "noopener noreferrer" : undefined}
      {...props}
    />
  ),
  ul: (props: React.ComponentProps<"ul">) => (
    <ul className="list-disc pl-6 space-y-2 text-muted-foreground mb-4" {...props} />
  ),
  ol: (props: React.ComponentProps<"ol">) => (
    <ol
      className="list-decimal pl-6 space-y-2 text-muted-foreground mb-4"
      {...props}
    />
  ),
  li: (props: React.ComponentProps<"li">) => (
    <li className="leading-relaxed" {...props} />
  ),
  blockquote: (props: React.ComponentProps<"blockquote">) => (
    <blockquote
      className="border-l-2 border-border pl-4 italic text-muted-foreground my-6"
      {...props}
    />
  ),
  code: (props: React.ComponentProps<"code">) => {
    const isInline = typeof props.children === "string"
    if (isInline) {
      return (
        <code
          className="rounded bg-muted px-1.5 py-0.5 font-mono text-sm text-foreground"
          {...props}
        />
      )
    }
    return <code {...props} />
  },
  pre: (props: React.ComponentProps<"pre">) => (
    <pre
      className="overflow-x-auto rounded-lg border bg-muted p-4 font-mono text-sm mb-4"
      {...props}
    />
  ),
  hr: (props: React.ComponentProps<"hr">) => (
    <hr className="my-8 border-border" {...props} />
  ),
  strong: (props: React.ComponentProps<"strong">) => (
    <strong className="font-semibold text-foreground" {...props} />
  ),
  table: (props: React.ComponentProps<"table">) => (
    <div className="my-6 overflow-x-auto">
      <table className="w-full border-collapse text-sm" {...props} />
    </div>
  ),
  th: (props: React.ComponentProps<"th">) => (
    <th
      className="border border-border bg-muted px-4 py-2 text-left font-semibold"
      {...props}
    />
  ),
  td: (props: React.ComponentProps<"td">) => (
    <td className="border border-border px-4 py-2" {...props} />
  ),
}

export async function generateStaticParams() {
  const docs = getAllDocPages()
  return docs.map((doc) => ({ slug: [doc.slug] }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string[] }>
}): Promise<Metadata> {
  const { slug } = await params
  const docSlug = slug.join("/")
  const doc = getDocPage(docSlug)
  if (!doc) return { title: "Not Found - Lunara Docs" }

  return {
    title: `${doc.title} - Lunara Docs`,
    description: doc.description,
  }
}

export default async function DocPostPage({
  params,
}: {
  params: Promise<{ slug: string[] }>
}) {
  const { slug } = await params
  const docSlug = slug.join("/")
  const doc = getDocPage(docSlug)
  if (!doc) notFound()

  const allDocs = getAllDocPages()
  const currentIndex = allDocs.findIndex((d) => d.slug === docSlug)
  const prevDoc = currentIndex > 0 ? allDocs[currentIndex - 1] : null
  const nextDoc =
    currentIndex < allDocs.length - 1 ? allDocs[currentIndex + 1] : null

  return (
    <SectionWrapper className="pt-32 md:pt-40">
      <div className="mx-auto max-w-7xl">
        <div className="flex gap-12">
          {/* Sidebar */}
          <aside className="hidden lg:block w-64 shrink-0">
            <div className="sticky top-32">
              <Link
                href="/docs"
                className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-6"
              >
                <ArrowLeft className="size-4" />
                All Docs
              </Link>
              <nav className="space-y-1">
                {allDocs.map((d) => (
                  <Link
                    key={d.slug}
                    href={`/docs/${d.slug}`}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                      d.slug === docSlug
                        ? "bg-muted font-medium text-foreground"
                        : "text-muted-foreground hover:bg-muted/50 hover:text-foreground"
                    )}
                  >
                    <ChevronRight
                      className={cn(
                        "size-3.5 shrink-0",
                        d.slug === docSlug
                          ? "text-foreground"
                          : "text-muted-foreground/50"
                      )}
                    />
                    {d.title}
                  </Link>
                ))}
              </nav>
            </div>
          </aside>

          {/* Main content */}
          <div className="min-w-0 flex-1 max-w-3xl">
            {/* Mobile back link */}
            <Link
              href="/docs"
              className="lg:hidden inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
            >
              <ArrowLeft className="size-4" />
              All Docs
            </Link>

            {/* Header */}
            <div className="mb-10">
              <h1 className="text-4xl font-semibold tracking-tight">
                {doc.title}
              </h1>
              {doc.description && (
                <p className="mt-3 text-lg text-muted-foreground">
                  {doc.description}
                </p>
              )}
            </div>

            <hr className="mb-10 border-border" />

            {/* MDX content */}
            <article>
              <MDXRemote source={doc.content} components={mdxComponents} />
            </article>

            {/* Prev / Next navigation */}
            {(prevDoc || nextDoc) && (
              <div className="mt-16 flex items-center justify-between gap-4 border-t pt-8">
                {prevDoc ? (
                  <Link
                    href={`/docs/${prevDoc.slug}`}
                    className="group inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <ArrowLeft className="size-4 group-hover:-translate-x-0.5 transition-transform" />
                    {prevDoc.title}
                  </Link>
                ) : (
                  <div />
                )}
                {nextDoc ? (
                  <Link
                    href={`/docs/${nextDoc.slug}`}
                    className="group inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    {nextDoc.title}
                    <ArrowRight className="size-4 group-hover:translate-x-0.5 transition-transform" />
                  </Link>
                ) : (
                  <div />
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </SectionWrapper>
  )
}
