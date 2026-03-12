import fs from "fs"
import path from "path"
import matter from "gray-matter"
import readingTime from "reading-time"

const CONTENT_DIR = path.join(process.cwd(), "content")

export interface BlogPost {
  slug: string
  title: string
  date: string
  excerpt: string
  category: string
  author: string
  readTime: string
  content: string
}

export interface DocPage {
  slug: string
  title: string
  description: string
  order: number
  content: string
}

export function getAllBlogPosts(): BlogPost[] {
  const dir = path.join(CONTENT_DIR, "blog")
  if (!fs.existsSync(dir)) return []

  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".mdx"))

  return files
    .map((filename) => {
      const slug = filename.replace(".mdx", "")
      const filePath = path.join(dir, filename)
      const fileContent = fs.readFileSync(filePath, "utf-8")
      const { data, content } = matter(fileContent)
      const stats = readingTime(content)

      return {
        slug,
        title: data.title || "",
        date: data.date || "",
        excerpt: data.excerpt || "",
        category: data.category || "General",
        author: data.author || "Lunara Team",
        readTime: stats.text,
        content,
      }
    })
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
}

export function getBlogPost(slug: string): BlogPost | null {
  const filePath = path.join(CONTENT_DIR, "blog", `${slug}.mdx`)
  if (!fs.existsSync(filePath)) return null

  const fileContent = fs.readFileSync(filePath, "utf-8")
  const { data, content } = matter(fileContent)
  const stats = readingTime(content)

  return {
    slug,
    title: data.title || "",
    date: data.date || "",
    excerpt: data.excerpt || "",
    category: data.category || "General",
    author: data.author || "Lunara Team",
    readTime: stats.text,
    content,
  }
}

export function getAllDocPages(): DocPage[] {
  const dir = path.join(CONTENT_DIR, "docs")
  if (!fs.existsSync(dir)) return []

  const files = fs.readdirSync(dir).filter((f) => f.endsWith(".mdx"))

  return files
    .map((filename) => {
      const slug = filename.replace(".mdx", "")
      const filePath = path.join(dir, filename)
      const fileContent = fs.readFileSync(filePath, "utf-8")
      const { data, content } = matter(fileContent)

      return {
        slug,
        title: data.title || "",
        description: data.description || "",
        order: data.order || 999,
        content,
      }
    })
    .sort((a, b) => a.order - b.order)
}

export function getDocPage(slug: string): DocPage | null {
  const filePath = path.join(CONTENT_DIR, "docs", `${slug}.mdx`)
  if (!fs.existsSync(filePath)) return null

  const fileContent = fs.readFileSync(filePath, "utf-8")
  const { data, content } = matter(fileContent)

  return {
    slug,
    title: data.title || "",
    description: data.description || "",
    order: data.order || 999,
    content,
  }
}
