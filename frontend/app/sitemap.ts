import type { MetadataRoute } from "next"

export default function sitemap(): MetadataRoute.Sitemap {
  const baseUrl = "https://lunaralabs.io"

  const staticPages = [
    "",
    "/pricing",
    "/security",
    "/about",
    "/contact",
    "/changelog",
    "/blog",
    "/docs",
    "/legal/privacy",
    "/legal/terms",
    "/product/semantic-layer",
    "/product/chat",
    "/product/reports",
  ]

  return staticPages.map((path) => ({
    url: `${baseUrl}${path}`,
    lastModified: new Date(),
    changeFrequency: path === "" ? "weekly" : "monthly",
    priority: path === "" ? 1 : path.startsWith("/product") ? 0.9 : 0.8,
  }))
}
