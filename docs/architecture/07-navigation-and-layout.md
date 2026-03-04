# 07 — Navigation & Layout: App Shell, Routes & Studio Switching

**Scope:** The app shell that wraps every page, top-level navigation, how users move between studios, sidebar behavior, and the route structure in Next.js.

**Depends on:** Nothing schema-wise (UI-only). Informed by 04, 05, 06 for studio-specific layouts.

---

## Current State

### Frontend Architecture

- **Framework:** Next.js 16 + React 19 + TypeScript + Tailwind CSS v4.
- **Design system:** Tailark + shadcn/ui (new-york style).
- **Auth:** Clerk (`ClerkProvider` in layout, `proxy.ts` for route protection).
- **Currently built:** Landing page (13 sections), sign-in, sign-up, onboarding, empty dashboard shell.
- **Not yet migrated:** 7 vanilla HTML pages (dashboard, data sources, schema browser, semantic setup, chat agent, report builder).

### Current Routes

```
/                        → landing page
/sign-in/[[...sign-in]]  → Clerk sign-in
/sign-up/[[...sign-up]]  → Clerk sign-up
/onboarding/[[...rest]]  → org creation
/dashboard               → empty shell (placeholder)
```

### What Doesn't Exist Yet

- No app shell (sidebar, top nav, breadcrumbs).
- No studio routing.
- No settings pages.
- No shared layout between app pages.

---

## Proposed Design

### 1. Route Structure

```
/                                    → Landing page (marketing, no app shell)
/sign-in/[[...sign-in]]              → Clerk sign-in (no app shell)
/sign-up/[[...sign-up]]              → Clerk sign-up (no app shell)
/onboarding/[[...rest]]              → Org creation (no app shell)

── App shell starts here ──

/dashboard                           → Home: recent activity, quick actions, usage
/studio/connections                  → Connections list
/studio/connections/new              → New connection wizard
/studio/connections/[id]             → Connection detail/edit
/studio/semantic                     → Semantic models list
/studio/semantic/new                 → New model: select data source + tables + generate
/studio/semantic/[id]                → Model viewer/editor
/studio/chat                         → Chat sessions list + active chat
/studio/chat/[sessionId]             → Specific chat session (deep link)
/studio/reports                      → Reports list
/studio/reports/new                  → New report: data context selection
/studio/reports/[id]                 → Report canvas (chat + rendered report)
/projects                            → Projects list
/projects/[id]                       → Project detail: filtered resource view
/settings                            → Org settings overview
/settings/billing                    → Plan, usage, Stripe portal link
/settings/members                    → Invite/manage members (Clerk components)
```

### 2. Layout Nesting (Next.js)

```
app/
  layout.tsx                          → Root: ThemeProvider + ClerkThemeProvider
  (marketing)/
    layout.tsx                        → No app shell
    page.tsx                          → Landing page
  (auth)/
    layout.tsx                        → Centered card layout, no app shell
    sign-in/[[...sign-in]]/page.tsx
    sign-up/[[...sign-up]]/page.tsx
    onboarding/[[...rest]]/page.tsx
  (app)/
    layout.tsx                        → App shell: sidebar + top bar + main content
    dashboard/page.tsx
    studio/
      connections/
        page.tsx                      → List
        new/page.tsx                  → Wizard
        [id]/page.tsx                 → Detail
      semantic/
        page.tsx                      → List
        new/page.tsx                  → Generate flow
        [id]/page.tsx                 → Viewer/editor
      chat/
        page.tsx                      → Session list + chat (default session or empty)
        [sessionId]/page.tsx          → Deep link to session
      reports/
        page.tsx                      → List
        new/page.tsx                  → Data context selection
        [id]/page.tsx                 → Report canvas
    projects/
      page.tsx                        → List
      [id]/page.tsx                   → Project detail
    settings/
      page.tsx                        → Overview
      billing/page.tsx
      members/page.tsx
```

Route groups `(marketing)`, `(auth)`, `(app)` keep layouts separate without affecting URLs.

### 3. App Shell Layout

```
┌─────────────────────────────────────────────────────────────┐
│  ┌──────────┐                    ┌──────┐ ┌──┐ ┌─────────┐ │
│  │  LUNARA  │  Dashboard  Studios ▼  Projects  │🔔│ │ UserBtn │ │
│  └──────────┘                    └──────┘ └──┘ └─────────┘ │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│                                                             │
│                      Page Content                           │
│                                                             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

#### Top Navigation Bar

- **Logo** → `/dashboard`
- **Dashboard** → `/dashboard`
- **Studios** → dropdown:
  - Connections → `/studio/connections`
  - Semantic Models → `/studio/semantic`
  - Chat → `/studio/chat`
  - Reports → `/studio/reports`
- **Projects** → `/projects`
- **Notifications bell** (future — parked for now)
- **User button** → Clerk `<UserButton>` with org switcher
  - Settings → `/settings`
  - Billing → `/settings/billing`
  - Members → `/settings/members`

#### Mobile

On mobile, the top nav collapses to a hamburger menu. Studios dropdown becomes a flat list in the mobile menu.

### 4. Studio-Specific Layouts

Each studio has its own internal layout. The app shell wraps everything; the studio layout is inside.

#### Connections Studio

Standard list → detail layout. No split pane needed.

```
/studio/connections
  ┌─────────────────────────────────────┐
  │ Connections          [+ New]        │
  │                                     │
  │ BigQuery · Sales DB · Connected ✅  │
  │ PostgreSQL · Supabase · Connected ✅ │
  │                                     │
  └─────────────────────────────────────┘
```

#### Semantic Studio

List view with "New Model" flow as a multi-step form.

```
/studio/semantic
  List of models → click → model viewer/editor

/studio/semantic/new
  Step 1: Select data source
  Step 2: Select tables
  Step 3: Generate (SSE stream with progress)
  Step 4: Review & save
```

#### Chat Studio

**Two-panel layout** (unique to chat — needs sidebar for sessions):

```
/studio/chat
  ┌──────────────────┬─────────────────────────────────┐
  │   SESSIONS       │   CHAT + SQL + RESULTS           │
  │   (left sidebar) │   (main area)                    │
  │                  │                                   │
  │   Session list   │   Chat messages                   │
  │   + New Chat     │   SQL editor                      │
  │                  │   Results table                   │
  └──────────────────┴─────────────────────────────────┘
```

Session sidebar is **specific to the chat studio**, not a global app sidebar. It lives inside the `(app)/studio/chat/` layout.

Clicking a session in the sidebar updates the URL to `/studio/chat/[sessionId]` and loads the chat. The sidebar stays visible.

#### Report Studio

**List → canvas** pattern. The canvas is a split-pane (chat left, report right):

```
/studio/reports
  List of reports → click → report canvas

/studio/reports/[id]
  ┌──────────────────┬───────────────────────────────┐
  │   REPORT CHAT    │   RENDERED REPORT              │
  │                  │   (scrollable)                  │
  │   (left panel)   │                                │
  └──────────────────┴───────────────────────────────┘
```

### 5. Cross-Studio Navigation Flows

Users don't always navigate via the top menu. Common flows that cross studio boundaries:

```
Semantic Studio → Chat Studio
  User generates model → clicks "Open in Chat" → /studio/chat?model_id=xxx
  Chat Studio creates new session bound to that model.

Chat Studio → Report Studio
  User saves artifacts → clicks "Use in Report" on artifact card
  → /studio/reports/new?artifact_ids=xxx,yyy
  Report creation pre-selects those artifacts.

Dashboard → Any Studio
  Dashboard shows recent activity cards.
  "Continue chatting" → /studio/chat/[sessionId]
  "View report" → /studio/reports/[id]
  "Edit model" → /studio/semantic/[id]

Connections → Semantic Studio
  User connects data source → "Create Semantic Model" button
  → /studio/semantic/new?source_id=xxx
  Pre-selects that data source.
```

These are just URL query params that pre-populate state. Each studio handles the params independently.

### 6. Dashboard Page

The dashboard is the landing page after login. It should give a quick overview:

```
/dashboard
  ┌───────────────────────────────────────────────────────────┐
  │                                                           │
  │  Welcome back, Shyam                                      │
  │                                                           │
  │  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐        │
  │  │ Connections │ │ Models      │ │ AI Credits  │        │
  │  │     2       │ │     3       │ │ 158 / 300   │        │
  │  └─────────────┘ └─────────────┘ └─────────────┘        │
  │                                                           │
  │  Quick Actions                                            │
  │  [Connect Data Source] [New Semantic Model] [Start Chat]  │
  │                                                           │
  │  Recent Activity                                          │
  │  ┌─────────────────────────────────────────────────────┐ │
  │  │ 💬 Revenue Analysis chat · 2 hours ago    [Resume] │ │
  │  │ 📊 Q1 Report · Yesterday                 [View]   │ │
  │  │ 🔗 PostgreSQL connected · 2 days ago     [Browse] │ │
  │  └─────────────────────────────────────────────────────┘ │
  │                                                           │
  │  Empty state (new user):                                  │
  │  "Get started by connecting your data source"             │
  │  [Connect Your Data]  [Try Demo]                          │
  │                                                           │
  └───────────────────────────────────────────────────────────┘
```

### 7. Project Detail Page

Projects are optional containers. The project detail page shows resources assigned to that project:

```
/projects/[id]
  ┌───────────────────────────────────────────────────────────┐
  │ Project: Q1 Sales Analysis                    [Settings]  │
  ├───────────────────────────────────────────────────────────┤
  │                                                           │
  │  Tabs: [Models] [Chats] [Reports] [Artifacts]            │
  │                                                           │
  │  Semantic Models                                          │
  │  ┌─────────────────────────────────────────────────────┐ │
  │  │ Sales Analytics · BigQuery · 12 tables              │ │
  │  └─────────────────────────────────────────────────────┘ │
  │                                                           │
  │  + Assign existing model to project                       │
  │                                                           │
  │  Chat Sessions                                            │
  │  ┌─────────────────────────────────────────────────────┐ │
  │  │ Revenue Analysis · 15 messages · Mar 4              │ │
  │  │ Product Mix · 8 messages · Mar 3                    │ │
  │  └─────────────────────────────────────────────────────┘ │
  │                                                           │
  └───────────────────────────────────────────────────────────┘
```

**"Assign" vs "Create":** Users can either create new resources inside a project, or assign existing org-wide resources to a project (UPDATE `project_id` from NULL to the project ID).

---

## Next.js Implementation Notes

### App Shell Component

```tsx
// app/(app)/layout.tsx
export default async function AppLayout({ children }) {
  const { userId, orgId } = await auth();
  if (!userId) redirect("/sign-in");
  if (!orgId) redirect("/onboarding");

  return (
    <div className="min-h-screen">
      <TopNav />
      <main className="mx-auto max-w-7xl px-4 py-6">
        {children}
      </main>
    </div>
  );
}
```

### Route Protection (`proxy.ts`)

Already handles redirect to `/onboarding` if no org. Needs update for `(app)` route group:

```typescript
// Protected routes — everything under (app)
const isProtectedRoute = createRouteMatcher([
  '/dashboard(.*)',
  '/studio(.*)',
  '/projects(.*)',
  '/settings(.*)',
]);
```

### Active Route Highlighting

Top nav reads `usePathname()` to highlight the current studio:

```tsx
const pathname = usePathname();
const isStudioActive = pathname.startsWith('/studio');
const activeStudio = pathname.split('/')[2]; // 'connections' | 'semantic' | 'chat' | 'reports'
```

---

## Open Questions

1. **Global sidebar vs. top nav?** The proposed design uses a top nav bar with a "Studios" dropdown. Alternative: a persistent left sidebar with studio icons (like VS Code or Slack). Which feels better for a BI tool?
   - **Recommendation:** Top nav for MVP. It's simpler, leaves more horizontal space for data-heavy pages (tables, charts). Can revisit for sidebar later.

2. **Breadcrumbs?** Should we show breadcrumbs below the top nav (e.g., "Studio > Semantic > Sales Analytics Model")?
   - **Recommendation:** Yes, simple breadcrumb on studio pages. Helps orientation when deep-linking.

3. **Org switcher in nav?** Clerk's `<OrganizationSwitcher>` lets users switch orgs. Should it be in the top nav?
   - **Recommendation:** Put it inside the `<UserButton>` dropdown for now. Most users have one org. Multi-org users can switch from there.

---

*Last updated: March 4, 2026*
