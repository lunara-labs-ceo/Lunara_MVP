import type { Metadata } from "next"
import Link from "next/link"
import { Badge } from "@/components/ui/badge"
import { SectionWrapper } from "@/components/shared/section-wrapper"

export const metadata: Metadata = {
  title: "Terms of Service - Lunara Labs",
  description:
    "Terms of Service for Lunara, the AI-powered data analytics platform.",
}

export default function TermsOfServicePage() {
  return (
    <SectionWrapper className="pt-32 md:pt-40">
      <div className="mx-auto max-w-4xl">
        {/* Hero */}
        <div className="mb-16">
          <Badge variant="secondary" className="mb-6 font-mono text-xs uppercase tracking-wider">
            Legal
          </Badge>
          <h1 className="text-4xl font-semibold tracking-tight sm:text-5xl">
            Terms of Service
          </h1>
          <p className="mt-4 text-muted-foreground">
            Last updated: March 11, 2026
          </p>
        </div>

        {/* Content */}
        <div>
          {/* 1. Acceptance of Terms */}
          <h2 className="text-2xl font-semibold mt-12 mb-4">1. Acceptance of Terms</h2>
          <p className="text-muted-foreground mb-4 leading-relaxed">
            By accessing or using Lunara (the &ldquo;Service&rdquo;), operated by Lunara Labs Inc.
            (&ldquo;Lunara,&rdquo; &ldquo;we,&rdquo; &ldquo;us,&rdquo; or &ldquo;our&rdquo;), you
            agree to be bound by these Terms of Service (&ldquo;Terms&rdquo;). If you do not agree
            to these Terms, you may not use the Service.
          </p>

          {/* 2. Description of Service */}
          <h2 className="text-2xl font-semibold mt-12 mb-4">2. Description of Service</h2>
          <p className="text-muted-foreground mb-4 leading-relaxed">
            Lunara is an AI-powered data analytics platform that connects to your data warehouse
            (such as Google BigQuery), enables natural language interaction with your data through AI
            agents, generates SQL queries, and builds visual reports. The Service is accessible at{" "}
            <Link
              href="https://lunaralabs.io"
              className="text-foreground underline underline-offset-4 hover:text-primary"
            >
              lunaralabs.io
            </Link>
            .
          </p>

          {/* 3. Account Registration */}
          <h2 className="text-2xl font-semibold mt-12 mb-4">3. Account Registration</h2>
          <p className="text-muted-foreground mb-4 leading-relaxed">
            To use the Service, you must create an account. You agree to:
          </p>
          <ul className="list-disc pl-6 space-y-2 text-muted-foreground mb-4">
            <li>Provide accurate, current, and complete information during registration</li>
            <li>Maintain the security of your account credentials</li>
            <li>Promptly notify us of any unauthorized use of your account</li>
            <li>Not create more than one account per individual</li>
          </ul>
          <p className="text-muted-foreground mb-4 leading-relaxed">
            You are responsible for all activity that occurs under your account.
          </p>

          {/* 4. Acceptable Use */}
          <h2 className="text-2xl font-semibold mt-12 mb-4">4. Acceptable Use</h2>
          <p className="text-muted-foreground mb-4 leading-relaxed">
            You agree to use the Service only for lawful purposes and in accordance with these
            Terms. You agree not to:
          </p>
          <ul className="list-disc pl-6 space-y-2 text-muted-foreground mb-4">
            <li>
              Attempt to access other users&apos; data, accounts, or any systems or networks
              connected to the Service without authorization
            </li>
            <li>
              Reverse engineer, decompile, disassemble, or otherwise attempt to derive the source
              code of the Service
            </li>
            <li>
              Use automated tools, bots, scrapers, or similar technologies to access or collect data
              from the Service
            </li>
            <li>Share your account credentials with any third party</li>
            <li>
              Use the Service to store, transmit, or process data in violation of any applicable law
              or regulation
            </li>
            <li>
              Interfere with or disrupt the integrity or performance of the Service
            </li>
          </ul>

          {/* 5. Your Data */}
          <h2 className="text-2xl font-semibold mt-12 mb-4">5. Your Data</h2>
          <p className="text-muted-foreground mb-4 leading-relaxed">
            You retain full ownership of your data, including your natural language queries, semantic
            models, saved SQL queries, and reports created through the Service.
          </p>
          <p className="text-muted-foreground mb-4 leading-relaxed">
            By using the Service, you grant Lunara a limited, non-exclusive license to process your
            schema metadata (table names, column names, data types, and relationships) solely for
            the purpose of providing the Service, including powering AI agents, generating semantic
            layers, and creating SQL queries.
          </p>
          <p className="text-muted-foreground mb-4 leading-relaxed">
            Lunara does not claim ownership of any data in your connected data warehouse. You are
            solely responsible for the data stored in your warehouse and for ensuring that your use
            of the Service complies with any applicable data governance policies.
          </p>

          {/* 6. AI-Generated Content */}
          <h2 className="text-2xl font-semibold mt-12 mb-4">6. AI-Generated Content</h2>
          <p className="text-muted-foreground mb-4 leading-relaxed">
            The Service uses artificial intelligence to generate SQL queries, data analyses, and
            reports. You acknowledge and agree that:
          </p>
          <ul className="list-disc pl-6 space-y-2 text-muted-foreground mb-4">
            <li>
              AI-generated SQL queries and reports are{" "}
              <span className="font-medium text-foreground">suggestions</span> and may contain
              errors or inaccuracies
            </li>
            <li>
              You are responsible for reviewing and approving all generated queries before execution
              against your database
            </li>
            <li>
              Lunara is not liable for the accuracy, completeness, or consequences of AI-generated
              content
            </li>
            <li>
              The Service employs a human-in-the-loop design where you maintain full control over
              which queries are executed
            </li>
          </ul>

          {/* 7. Service Availability */}
          <h2 className="text-2xl font-semibold mt-12 mb-4">7. Service Availability</h2>
          <p className="text-muted-foreground mb-4 leading-relaxed">
            We strive to maintain high availability of the Service, but we do not guarantee
            uninterrupted access. You acknowledge that:
          </p>
          <ul className="list-disc pl-6 space-y-2 text-muted-foreground mb-4">
            <li>
              The Service may experience downtime for maintenance, updates, or unforeseen
              circumstances
            </li>
            <li>
              We will make reasonable efforts to provide advance notice of scheduled maintenance
            </li>
            <li>No guaranteed uptime SLA is provided for the free tier of the Service</li>
          </ul>

          {/* 8. Intellectual Property */}
          <h2 className="text-2xl font-semibold mt-12 mb-4">8. Intellectual Property</h2>
          <p className="text-muted-foreground mb-4 leading-relaxed">
            The Service, including its design, features, code, documentation, and trademarks, is
            owned by Lunara Labs Inc. and is protected by applicable intellectual property laws. You
            may not copy, modify, distribute, or create derivative works based on the Service
            without our express written permission.
          </p>
          <p className="text-muted-foreground mb-4 leading-relaxed">
            You retain ownership of all data and content that you create through the Service,
            including semantic models, saved queries, and reports.
          </p>

          {/* 9. Limitation of Liability */}
          <h2 className="text-2xl font-semibold mt-12 mb-4">9. Limitation of Liability</h2>
          <p className="text-muted-foreground mb-4 leading-relaxed">
            TO THE MAXIMUM EXTENT PERMITTED BY APPLICABLE LAW:
          </p>
          <ul className="list-disc pl-6 space-y-2 text-muted-foreground mb-4">
            <li>
              The Service is provided on an &ldquo;AS IS&rdquo; and &ldquo;AS AVAILABLE&rdquo;
              basis without warranties of any kind, whether express or implied
            </li>
            <li>
              Lunara shall not be liable for any indirect, incidental, special, consequential, or
              punitive damages, including but not limited to loss of data, revenue, or business
              opportunities
            </li>
            <li>
              In no event shall our total liability exceed the fees paid by you to Lunara in the
              twelve (12) months preceding the event giving rise to the claim
            </li>
          </ul>

          {/* 10. Termination */}
          <h2 className="text-2xl font-semibold mt-12 mb-4">10. Termination</h2>
          <p className="text-muted-foreground mb-4 leading-relaxed">
            Either party may terminate these Terms at any time:
          </p>
          <ul className="list-disc pl-6 space-y-2 text-muted-foreground mb-4">
            <li>You may delete your account at any time through the platform settings</li>
            <li>
              We may suspend or terminate your account if you violate these Terms or engage in
              activity that harms the Service or other users
            </li>
            <li>
              Upon termination, your data will remain available for export for thirty (30) days,
              after which it will be permanently deleted
            </li>
            <li>
              Sections regarding Limitation of Liability, Intellectual Property, and Governing Law
              survive termination
            </li>
          </ul>

          {/* 11. Changes to Terms */}
          <h2 className="text-2xl font-semibold mt-12 mb-4">11. Changes to Terms</h2>
          <p className="text-muted-foreground mb-4 leading-relaxed">
            We reserve the right to modify these Terms at any time. If we make material changes, we
            will notify you by email or through a prominent notice on the platform at least thirty
            (30) days before the changes take effect. Your continued use of the Service after the
            effective date of any changes constitutes your acceptance of the updated Terms.
          </p>

          {/* 12. Governing Law */}
          <h2 className="text-2xl font-semibold mt-12 mb-4">12. Governing Law</h2>
          <p className="text-muted-foreground mb-4 leading-relaxed">
            These Terms shall be governed by and construed in accordance with the laws of the
            Province of Ontario, Canada, without regard to its conflict of law provisions. Any
            disputes arising under or in connection with these Terms shall be subject to the
            exclusive jurisdiction of the courts located in Toronto, Ontario, Canada.
          </p>

          {/* 13. Contact */}
          <h2 className="text-2xl font-semibold mt-12 mb-4">13. Contact</h2>
          <p className="text-muted-foreground mb-4 leading-relaxed">
            If you have questions about these Terms of Service, please contact us:
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
