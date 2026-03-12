import type { Metadata } from "next"
import Link from "next/link"
import { Calendar, Clock, User } from "lucide-react"
import { Badge } from "@/components/ui/badge"
import { Card, CardContent, CardFooter, CardHeader } from "@/components/ui/card"
import { SectionWrapper } from "@/components/shared/section-wrapper"
import { SectionHeader } from "@/components/shared/section-header"
import { ScrollReveal } from "@/components/shared/scroll-reveal"
import { getAllBlogPosts } from "@/lib/mdx"

export const metadata: Metadata = {
  title: "Blog - Lunara",
  description:
    "Insights on agentic analytics, semantic layers, and AI-powered data tools.",
}

export default function BlogIndexPage() {
  const posts = getAllBlogPosts()

  return (
    <SectionWrapper className="pt-32 md:pt-40">
      <SectionHeader
        badge="BLOG"
        title="Insights & Updates"
        subtitle="Thoughts on agentic analytics, semantic layers, and the future of data."
      />

      {posts.length === 0 ? (
        <div className="text-center py-20">
          <p className="text-muted-foreground text-lg">
            No posts yet. Check back soon.
          </p>
        </div>
      ) : (
        <div className="grid gap-8 md:grid-cols-2 lg:grid-cols-3">
          {posts.map((post, i) => (
            <ScrollReveal key={post.slug} delay={i * 0.1}>
              <Link href={`/blog/${post.slug}`} className="group block h-full">
                <Card className="h-full transition-colors hover:border-foreground/20">
                  <CardHeader>
                    <Badge
                      variant="secondary"
                      className="w-fit font-mono text-xs uppercase tracking-wider"
                    >
                      {post.category}
                    </Badge>
                    <h3 className="text-xl font-semibold leading-snug tracking-tight group-hover:text-primary/80 transition-colors">
                      {post.title}
                    </h3>
                  </CardHeader>
                  <CardContent>
                    <p className="text-muted-foreground text-sm leading-relaxed line-clamp-3">
                      {post.excerpt}
                    </p>
                  </CardContent>
                  <CardFooter className="mt-auto">
                    <div className="flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <User className="size-3.5" />
                        {post.author}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Calendar className="size-3.5" />
                        {new Date(post.date).toLocaleDateString("en-US", {
                          month: "short",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Clock className="size-3.5" />
                        {post.readTime}
                      </span>
                    </div>
                  </CardFooter>
                </Card>
              </Link>
            </ScrollReveal>
          ))}
        </div>
      )}
    </SectionWrapper>
  )
}
