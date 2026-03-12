import type { Metadata } from "next"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { SectionWrapper } from "@/components/shared/section-wrapper"

export const metadata: Metadata = {
  title: "Privacy Policy - Lunara Labs",
  description:
    "How Lunara handles your data. We never store your raw data — queries run against your database using your credentials.",
}

export default function PrivacyPolicyPage() {
  return (
    <SectionWrapper className="pt-32 md:pt-40">
      <div className="mx-auto max-w-4xl">
        {/* Hero */}
        <div className="mb-16">
          <Badge variant="secondary" className="mb-6 font-mono text-xs uppercase tracking-wider">
            Legal
          </Badge>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Privacy Policy
          </h1>
          <p className="mt-4 text-muted-foreground">
            Last updated: March 11, 2026
          </p>
        </div>

        {/* Content */}
        <div>
          {/* 1. Introduction */}
          <h2 className="text-2xl font-semibold mt-12 mb-4">1. Introduction</h2>
          <p className="text-muted-foreground mb-4 leading-relaxed">
            Lunara Labs Inc. (&ldquo;Lunara,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;)
            operates the Lunara platform at{" "}
            <Link href="https://lunaralabs.io" className="text-foreground underline underline-offset-4 hover:text-primary">
              lunaralabs.io
            </Link>
            . Lunara is an AI-powered data analytics platform that connects to your data warehouse,
            lets you chat with AI agents to generate SQL queries, and build visual reports.
          </p>
          <p className="text-muted-foreground mb-4 leading-relaxed">
            This Privacy Policy explains how we collect, use, and protect your information when you
            use our platform. By using Lunara, you agree to the practices described in this policy.
          </p>

          {/* 2. Information We Collect */}
          <h2 className="text-2xl font-semibold mt-12 mb-4">2. Information We Collect</h2>

          <h3 className="text-lg font-medium mt-8 mb-3">Account Information</h3>
          <p className="text-muted-foreground mb-4 leading-relaxed">
            When you create an account through our authentication provider (Clerk), we collect:
          </p>
          <ul className="list-disc pl-6 space-y-2 text-muted-foreground mb-4">
            <li>Email address</li>
            <li>Name</li>
            <li>Profile picture (if provided)</li>
            <li>Organization name</li>
          </ul>

          <h3 className="text-lg font-medium mt-8 mb-3">Usage Data</h3>
          <p className="text-muted-foreground mb-4 leading-relaxed">
            We collect information about how you interact with the platform:
          </p>
          <ul className="list-disc pl-6 space-y-2 text-muted-foreground mb-4">
            <li>Pages visited and features used</li>
            <li>Session duration</li>
            <li>Browser type and device information</li>
          </ul>

          <h3 className="text-lg font-medium mt-8 mb-3">Data Source Metadata</h3>
          <p className="text-muted-foreground mb-4 leading-relaxed">
            When you connect a data warehouse, we store:
          </p>
          <ul className="list-disc pl-6 space-y-2 text-muted-foreground mb-4">
            <li>Database connection credentials (encrypted at rest using Fernet/AES encryption)</li>
            <li>Schema information including table names, column names, and data types</li>
          </ul>

          <h3 className="text-lg font-medium mt-8 mb-3">Chat and Report Data</h3>
          <p className="text-muted-foreground mb-4 leading-relaxed">
            When you use the chat agent or report builder, we store:
          </p>
          <ul className="list-disc pl-6 space-y-2 text-muted-foreground mb-4">
            <li>Your natural language queries</li>
            <li>AI-generated SQL queries</li>
            <li>Saved query artifacts (when you explicitly choose to save them)</li>
            <li>Report content and configurations</li>
          </ul>

          {/* 3. Information We Do NOT Collect */}
          <h2 className="text-2xl font-semibold mt-12 mb-4">3. Information We Do NOT Collect</h2>
          <p className="text-muted-foreground mb-4 leading-relaxed">
            We are intentional about what we do not collect or store:
          </p>
          <ul className="list-disc pl-6 space-y-2 text-muted-foreground mb-4">
            <li>
              <span className="font-medium text-foreground">Your actual database data or rows.</span>{" "}
              Query results are streamed directly to your browser and are not stored on our servers.
            </li>
            <li>
              <span className="font-medium text-foreground">Query results</span> are displayed in
              your browser only. They are not persisted unless you explicitly save them as an artifact.
            </li>
            <li>
              <span className="font-medium text-foreground">Raw database credentials in plaintext.</span>{" "}
              All credentials are encrypted before storage and are never accessible in their original form.
            </li>
          </ul>

          {/* 4. How We Use Your Information */}
          <h2 className="text-2xl font-semibold mt-12 mb-4">4. How We Use Your Information</h2>
          <p className="text-muted-foreground mb-4 leading-relaxed">
            We use the information we collect to:
          </p>
          <ul className="list-disc pl-6 space-y-2 text-muted-foreground mb-4">
            <li>
              <span className="font-medium text-foreground">Provide the service:</span> Power the
              AI agents, generate semantic layers, create SQL queries, and build reports based on
              your schema metadata.
            </li>
            <li>
              <span className="font-medium text-foreground">Improve the product:</span> Understand
              usage patterns to improve features, fix bugs, and optimize performance.
            </li>
            <li>
              <span className="font-medium text-foreground">Communicate with you:</span> Send
              service-related notifications, respond to support requests, and provide product
              updates.
            </li>
          </ul>

          {/* 5. Third-Party Services */}
          <h2 className="text-2xl font-semibold mt-12 mb-4">5. Third-Party Services</h2>
          <p className="text-muted-foreground mb-4 leading-relaxed">
            We use the following third-party services to operate Lunara. Each service has its own
            privacy practices:
          </p>
          <ul className="list-disc pl-6 space-y-2 text-muted-foreground mb-4">
            <li>
              <span className="font-medium text-foreground">Clerk</span> &mdash; Authentication and
              session management. Handles your login credentials, email, and profile data. Governed
              by{" "}
              <Link
                href="https://clerk.com/legal/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground underline underline-offset-4 hover:text-primary"
              >
                Clerk&apos;s Privacy Policy
              </Link>
              .
            </li>
            <li>
              <span className="font-medium text-foreground">Supabase</span> &mdash; PostgreSQL
              database for storing project metadata, semantic models, chat history, and report
              sessions. Does not store your raw warehouse data. Governed by{" "}
              <Link
                href="https://supabase.com/privacy"
                target="_blank"
                rel="noopener noreferrer"
                className="text-foreground underline underline-offset-4 hover:text-primary"
              >
                Supabase&apos;s Privacy Policy
              </Link>
              .
            </li>
            <li>
              <span className="font-medium text-foreground">Google Gemini</span> &mdash; Large
              language model that powers our AI agents. Receives schema metadata only (table names,
              column names, data types) for analysis. Your actual data rows are never sent to the
              LLM.
            </li>
            <li>
              <span className="font-medium text-foreground">Render</span> &mdash; Cloud hosting
              platform where the Lunara application is deployed.
            </li>
            <li>
              <span className="font-medium text-foreground">Google Cloud Platform</span> &mdash;
              Provides sandboxed code execution environments for generating report charts and
              visualizations.
            </li>
          </ul>

          {/* 6. Data Security */}
          <h2 className="text-2xl font-semibold mt-12 mb-4">6. Data Security</h2>
          <p className="text-muted-foreground mb-4 leading-relaxed">
            We take the security of your data seriously and implement the following measures:
          </p>
          <ul className="list-disc pl-6 space-y-2 text-muted-foreground mb-4">
            <li>All data is encrypted in transit using TLS/HTTPS</li>
            <li>Database credentials are encrypted at rest using Fernet (AES-128-CBC) encryption</li>
            <li>
              Our infrastructure partners (Supabase, Render, Google Cloud) maintain SOC 2 compliant
              environments
            </li>
            <li>Access to production systems is restricted to authorized personnel only</li>
          </ul>

          {/* 7. Data Retention */}
          <h2 className="text-2xl font-semibold mt-12 mb-4">7. Data Retention</h2>
          <ul className="list-disc pl-6 space-y-2 text-muted-foreground mb-4">
            <li>
              <span className="font-medium text-foreground">Account data</span> is retained for as
              long as your account is active.
            </li>
            <li>
              <span className="font-medium text-foreground">Chat history and artifacts</span> are
              retained until you delete them.
            </li>
            <li>
              <span className="font-medium text-foreground">Connection credentials</span> are
              deleted when you remove the associated data source.
            </li>
            <li>
              Upon account deletion, all associated data is removed within 30 days.
            </li>
          </ul>

          {/* 8. Your Rights */}
          <h2 className="text-2xl font-semibold mt-12 mb-4">8. Your Rights</h2>
          <p className="text-muted-foreground mb-4 leading-relaxed">
            You have the right to:
          </p>
          <ul className="list-disc pl-6 space-y-2 text-muted-foreground mb-4">
            <li>
              <span className="font-medium text-foreground">Access</span> the personal information
              we hold about you.
            </li>
            <li>
              <span className="font-medium text-foreground">Correct</span> any inaccurate
              information in your account.
            </li>
            <li>
              <span className="font-medium text-foreground">Delete</span> your account and all
              associated data.
            </li>
            <li>
              <span className="font-medium text-foreground">Export</span> your semantic models,
              saved queries, and reports.
            </li>
          </ul>
          <p className="text-muted-foreground mb-4 leading-relaxed">
            To exercise any of these rights, contact us at{" "}
            <Link
              href="mailto:shyamsarma@lunaralabs.ca"
              className="text-foreground underline underline-offset-4 hover:text-primary"
            >
              shyamsarma@lunaralabs.ca
            </Link>
            .
          </p>

          {/* 9. Cookies */}
          <h2 className="text-2xl font-semibold mt-12 mb-4">9. Cookies</h2>
          <p className="text-muted-foreground mb-4 leading-relaxed">
            Lunara uses only essential cookies required for authentication and session management,
            provided by Clerk. We do not use marketing cookies, tracking pixels, or third-party
            advertising cookies.
          </p>

          {/* 10. Changes to This Policy */}
          <h2 className="text-2xl font-semibold mt-12 mb-4">10. Changes to This Policy</h2>
          <p className="text-muted-foreground mb-4 leading-relaxed">
            We may update this Privacy Policy from time to time. If we make material changes, we
            will notify you by email or through a notice on the platform. Your continued use of
            Lunara after any changes constitutes your acceptance of the updated policy.
          </p>

          {/* 11. Contact */}
          <h2 className="text-2xl font-semibold mt-12 mb-4">11. Contact</h2>
          <p className="text-muted-foreground mb-4 leading-relaxed">
            If you have questions about this Privacy Policy or how we handle your data, please
            contact us:
          </p>
          <ul className="list-disc pl-6 space-y-2 text-muted-foreground mb-4">
            <li>
              Email:{" "}
              <Link
                href="mailto:shyamsarma@lunaralabs.ca"
                className="text-foreground underline underline-offset-4 hover:text-primary"
              >
                shyamsarma@lunaralabs.ca
              </Link>
            </li>
            <li>Lunara Labs Inc.</li>
            <li>Toronto, Canada</li>
          </ul>
        </div>
      </div>
    </SectionWrapper>
  )
}
