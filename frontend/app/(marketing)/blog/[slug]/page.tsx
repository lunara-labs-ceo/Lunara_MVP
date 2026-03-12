import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"
import { ArrowLeft, Calendar, Clock, User } from "lucide-react"
import { MDXRemote } from "next-mdx-remote/rsc"
import { Badge } from "@/components/ui/badge"
import { SectionWrapper } from "@/components/shared/section-wrapper"
import { getAllBlogPosts, getBlogPost } from "@/lib/mdx"

// Custom MDX components for consistent styling
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
  const posts = getAllBlogPosts()
  return posts.map((post) => ({ slug: post.slug }))
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>
}): Promise<Metadata> {
  const { slug } = await params
  const post = getBlogPost(slug)
  if (!post) return { title: "Post Not Found - Lunara" }

  return {
    title: `${post.title} - Lunara Blog`,
    description: post.excerpt,
  }
}

export default async function BlogPostPage({
  params,
}: {
  params: Promise<{ slug: string }>
}) {
  const { slug } = await params
  const post = getBlogPost(slug)
  if (!post) notFound()

  return (
    <SectionWrapper className="pt-32 md:pt-40">
      <div className="mx-auto max-w-3xl">
        {/* Back link */}
        <Link
          href="/blog"
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors mb-8"
        >
          <ArrowLeft className="size-4" />
          Back to Blog
        </Link>

        {/* Header */}
        <div className="mb-12">
          <Badge
            variant="secondary"
            className="mb-4 font-mono text-xs uppercase tracking-wider"
          >
            {post.category}
          </Badge>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl leading-[1.1]">
            {post.title}
          </h1>
          <div className="mt-6 flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              <User className="size-4" />
              {post.author}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Calendar className="size-4" />
              {new Date(post.date).toLocaleDateString("en-US", {
                month: "long",
                day: "numeric",
                year: "numeric",
              })}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Clock className="size-4" />
              {post.readTime}
            </span>
          </div>
        </div>

        {/* Divider */}
        <hr className="mb-10 border-border" />

        {/* MDX content */}
        <article>
          <MDXRemote source={post.content} components={mdxComponents} />
        </article>
      </div>
    </SectionWrapper>
  )
}
