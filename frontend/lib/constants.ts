// Landing page content data — all copy centralized here

export const NAV_LINKS = [
  { label: "Platform", href: "#how-it-works" },
  { label: "Agents", href: "#agents" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
] as const

export const MARQUEE_ITEMS = [
  "Natural Language to SQL",
  "AI Semantic Agents",
  "AI Report Agents",
  "Agentic Analytics",
  "Human-in-the-Loop",
  "BigQuery Native",
  "Zero-Code Setup",
] as const

export const HOW_IT_WORKS_STEPS = [
  {
    step: 1,
    title: "Connect",
    description: "Plug in your BigQuery warehouse with a single credential upload.",
    icon: "Database" as const,
  },
  {
    step: 2,
    title: "Build Semantic Layer",
    description: "AI analyzes your schema — tables, columns, relationships, business logic.",
    icon: "Brain" as const,
  },
  {
    step: 3,
    title: "Chat With Data",
    description: "Ask questions in plain English. Get production-grade SQL instantly.",
    icon: "MessageSquare" as const,
  },
  {
    step: 4,
    title: "Generate Reports",
    description: "Get AI-generated charts, insights, and narrative summaries.",
    icon: "BarChart3" as const,
  },
] as const

export const AGENTS = [
  {
    number: "01",
    name: "Semantic Agent",
    description:
      "Connect your BigQuery warehouse and the Semantic Agent automatically analyzes your schema — tables, columns, relationships, and business logic. It generates a semantic layer that gives every future query the context it needs.",
    features: [
      "Auto-discovers table relationships and join paths",
      "Maps columns to business-friendly descriptions",
      "You review and approve before anything runs",
    ],
    image: "/images/semantic-agent.png",
    imageAlt: "Semantic Agent — AI Analysis Output",
    imagePosition: "left" as const,
  },
  {
    number: "02",
    name: "SQL Agent",
    description:
      "Ask questions in plain English. The SQL Agent uses your semantic layer to generate accurate, optimized SQL — complete with the right joins, filters, and aggregations. You run it when you're ready.",
    features: [
      "Natural language to SQL in seconds",
      "Looks up column values, date ranges, and stats automatically",
      "You control when queries execute — never runs without approval",
    ],
    image: "/images/sql-agent-chat.png",
    imageAlt: "SQL Agent — Chat & Generated Query",
    imagePosition: "right" as const,
  },
  {
    number: "03",
    name: "Report Agent",
    description:
      'Tell it what you need — "Scout the top players in the market" — and the Report Agent runs the analysis, generates charts, and writes a narrative summary. Two AI agents work together: one analyzes, one reports.',
    features: [
      "AI-generated charts and data visualizations",
      "Written narrative with key insights and trends",
      "Two-agent pipeline: Analyst Agent + Reporter Agent",
    ],
    image: "/images/report-agent-output.png",
    imageAlt: "Report Agent — Generated Report with Charts",
    imagePosition: "left" as const,
  },
] as const

export const FEATURES = [
  {
    title: "Human-in-the-Loop",
    description: "AI proposes, you approve. Full control over every query that runs against your data.",
    icon: "ShieldCheck" as const,
    span: "col-span-1 md:col-span-2",
  },
  {
    title: "Semantic Context",
    description: "Your agent understands business logic, not just column names. Queries are accurate from day one.",
    icon: "Layers" as const,
    span: "col-span-1",
  },
  {
    title: "Natural Language SQL",
    description: "Ask in English, get production-grade SQL with the right joins, filters, and aggregations.",
    icon: "MessageSquareCode" as const,
    span: "col-span-1",
  },
  {
    title: "Auto-Generated Charts",
    description: "From data to visualization in one prompt. Bar charts, line graphs, and more — generated automatically.",
    icon: "BarChart3" as const,
    span: "col-span-1 md:col-span-2",
  },
] as const

export const STATS = [
  { value: "< 5 min", label: "From connect to first query" },
  { value: "7", label: "AI tools per agent" },
  { value: "0", label: "Lines of SQL required" },
  { value: "100%", label: "Human-in-the-loop control" },
] as const

export const TESTIMONIALS = [
  {
    quote: "We went from spending hours writing SQL to getting answers in seconds. The semantic layer is the game changer — our agents actually understand our data model.",
    author: "Data Lead",
    company: "Early Access User",
  },
  {
    quote: "The report agent saved us an entire week of manual analysis. It generated charts and narrative that were ready to share with leadership.",
    author: "Analytics Manager",
    company: "Beta Tester",
  },
  {
    quote: "Finally, a tool that doesn't require everyone to know SQL. Our product managers can self-serve their own data questions now.",
    author: "Head of Engineering",
    company: "Early Access User",
  },
] as const

export const PRICING_TIERS = [
  {
    name: "Early Access",
    price: "Free",
    description: "Everything you need to start exploring your data with AI agents.",
    features: [
      "3 AI Agents (Semantic, SQL, Report)",
      "BigQuery connection",
      "Unlimited natural language queries",
      "AI-generated reports & charts",
      "Chat history & saved queries",
    ],
    cta: "Get Started",
    highlighted: false,
  },
  {
    name: "Pro",
    price: "Coming Soon",
    description: "For teams that need collaboration, governance, and scale.",
    features: [
      "Everything in Early Access",
      "Team collaboration & sharing",
      "Multiple data warehouse connections",
      "Custom semantic layer editing",
      "API access & integrations",
      "Priority support",
    ],
    cta: "Join Waitlist",
    highlighted: true,
  },
] as const

export const FAQ_ITEMS = [
  {
    question: "What data warehouses does Lunara support?",
    answer:
      "Currently, Lunara supports Google BigQuery. Support for Snowflake, Databricks, and PostgreSQL is on the roadmap.",
  },
  {
    question: "Is my data secure?",
    answer:
      "Yes. Lunara never stores your raw data. Queries run directly against your warehouse using your own credentials. We only store the semantic layer metadata and chat history.",
  },
  {
    question: "Do I need to know SQL?",
    answer:
      "Not at all. Lunara's SQL Agent generates production-grade SQL from plain English questions. You can review and edit the SQL before running it, but it's not required.",
  },
  {
    question: "How does the semantic layer work?",
    answer:
      "When you connect your warehouse, the Semantic Agent analyzes your schema — tables, columns, relationships, and data types. It generates a business-friendly model that the other agents use for context. You can review and edit it before anything runs.",
  },
  {
    question: 'What does "Early Access" include?',
    answer:
      "Early Access gives you full access to all three AI agents, BigQuery connectivity, unlimited queries, and report generation — completely free. We're looking for feedback from real users to shape the product.",
  },
  {
    question: "Can I self-host Lunara?",
    answer:
      "Not yet, but self-hosted deployment is on our roadmap for the Pro tier. For now, Lunara runs as a managed service.",
  },
] as const
