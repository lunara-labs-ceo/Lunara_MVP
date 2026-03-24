// Landing page content data — all copy centralized here

export const NAV_LINKS = [
  { label: "Platform", href: "#how-it-works" },
  { label: "Agents", href: "#agents" },
  { label: "Pricing", href: "#pricing" },
  { label: "FAQ", href: "#faq" },
] as const

export const MARQUEE_ITEMS = [
  "Context-First Analytics",
  "One Semantic Layer, Every Agent",
  "Atlas, Luna & Quill",
  "Accurate SQL From Day One",
  "Human-in-the-Loop",
  "Connect Any Warehouse",
  "Self-Serve That Works",
] as const

export const HOW_IT_WORKS_STEPS = [
  {
    step: 1,
    title: "Connect Your Warehouse",
    description: "Point Lunara at your PostgreSQL, Supabase, or any supported warehouse. Done in seconds.",
    icon: "Database" as const,
  },
  {
    step: 2,
    title: "Atlas Builds the Context Layer",
    description: "Atlas analyzes your schema — tables, relationships, business logic — and generates a semantic layer that every agent uses as its source of truth.",
    icon: "Brain" as const,
  },
  {
    step: 3,
    title: "Luna Answers Questions",
    description: "Ask anything in plain English. Because Luna has full business context, the SQL it generates is accurate — with the right joins, filters, and logic.",
    icon: "MessageSquare" as const,
  },
  {
    step: 4,
    title: "Quill Builds Reports",
    description: "Request analysis and Quill delivers charts, trends, and narrative — grounded in the same semantic layer.",
    icon: "BarChart3" as const,
  },
] as const

export const AGENTS = [
  {
    number: "01",
    name: "Atlas",
    description:
      "Atlas analyzes your warehouse — every table, column, relationship, and business rule — and builds a semantic layer that becomes the single source of truth for your entire team. This is the foundation that makes everything else work.",
    features: [
      "Automatically maps your schema to business-friendly definitions",
      "Discovers table relationships and join paths",
      "You review and approve — nothing runs without your sign-off",
    ],
    image: "/images/semantic-agent.png",
    imageAlt: "Atlas — AI Analysis Output",
    imagePosition: "left" as const,
  },
  {
    number: "02",
    name: "Luna",
    description:
      "Ask questions in plain English. Because Luna queries through the semantic layer — not raw tables — the SQL it generates uses the right joins, filters, and business logic. No hallucinated queries.",
    features: [
      "Accurate SQL because it has full business context",
      "Explores column values, date ranges, and stats before writing queries",
      "You control when queries execute — human-in-the-loop always",
    ],
    image: "/images/sql-agent-chat.png",
    imageAlt: "Luna — Chat & Generated Query",
    imagePosition: "right" as const,
  },
  {
    number: "03",
    name: "Quill",
    description:
      "Tell Quill what you need and it delivers — charts, analysis, and written narrative. Two agents work together (one analyzes, one writes), both grounded in your semantic layer.",
    features: [
      "AI-generated charts and visualizations from your data",
      "Written narrative with key insights and recommendations",
      "Every analysis grounded in your semantic layer — no hallucinated metrics",
    ],
    image: "/images/report-agent-output.png",
    imageAlt: "Quill — Generated Report with Charts",
    imagePosition: "left" as const,
  },
] as const

export const FEATURES = [
  {
    title: "Single Source of Truth",
    description: "One semantic layer. Every agent, every query, every report draws from the same business context. No more conflicting metrics across tools.",
    icon: "Layers" as const,
    span: "col-span-1 md:col-span-2",
  },
  {
    title: "Semantic Context",
    description: "Your agents understand business logic, not just column names. Metrics, dimensions, relationships — all mapped and maintained.",
    icon: "Brain" as const,
    span: "col-span-1",
  },
  {
    title: "Human-in-the-Loop",
    description: "AI proposes, you approve. Every query, every report — nothing runs against your data without your sign-off.",
    icon: "ShieldCheck" as const,
    span: "col-span-1",
  },
  {
    title: "Natural Language to SQL & Reports",
    description: "Ask questions in English, get accurate SQL. Request reports, get charts and narrative. Powered by context, not guesswork.",
    icon: "MessageSquareCode" as const,
    span: "col-span-1 md:col-span-2",
  },
] as const

export const STATS = [
  { value: "< 5 min", label: "From connect to first accurate query" },
  { value: "1", label: "Semantic layer for your entire team" },
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
    quote: "Quill saved us an entire week of manual analysis. It generated charts and narrative that were ready to share with leadership.",
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
      "3 AI Agents — Atlas, Luna & Quill",
      "Data warehouse connection",
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
    question: "What is a semantic layer and why does it matter?",
    answer:
      "A semantic layer maps your raw database schema to business-friendly definitions — what your metrics mean, how tables relate, which columns represent what. Without it, AI agents are guessing. With it, every query and report is grounded in how your business actually works.",
  },
  {
    question: "What data warehouses does Lunara support?",
    answer:
      "Lunara connects to PostgreSQL, Supabase, and more. BigQuery, Snowflake, MySQL, and Databricks connectors are coming soon.",
  },
  {
    question: "Is my data secure?",
    answer:
      "Yes. Lunara never stores your raw data. Queries run directly against your warehouse using your own credentials. We only store the semantic layer metadata and chat history.",
  },
  {
    question: "Do I need to know SQL?",
    answer:
      "Not at all. Luna generates production-grade SQL from plain English questions. You can review and edit the SQL before running it, but it's not required.",
  },
  {
    question: "How does the semantic layer work?",
    answer:
      "When you connect your warehouse, Atlas analyzes your schema — tables, columns, relationships, and data types. It generates a semantic model that maps raw data to business concepts. Luna and Quill use this model as their source of truth, which is why queries are accurate from day one. You can review and edit everything before it's used.",
  },
  {
    question: 'What does "Early Access" include?',
    answer:
      "Early Access gives you full access to all three AI agents, database connectivity, unlimited queries, and report generation — completely free. We're looking for feedback from real users to shape the product.",
  },
  {
    question: "Can I self-host Lunara?",
    answer:
      "Not yet, but self-hosted deployment is on our roadmap for the Pro tier. For now, Lunara runs as a managed service.",
  },
] as const
