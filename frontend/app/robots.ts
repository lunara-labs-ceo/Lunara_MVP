import type { MetadataRoute } from "next"

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: [
          "/dashboard/",
          "/settings/",
          "/sign-in/",
          "/sign-up/",
          "/onboarding/",
          "/api/",
        ],
      },
    ],
    sitemap: "https://lunaralabs.io/sitemap.xml",
  }
}
