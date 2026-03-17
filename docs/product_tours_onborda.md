# Product Tours with Onborda

## Context

Lunara has no guided onboarding beyond org creation. New users land on the dashboard with no guidance on how to connect data, generate a semantic layer, or chat with their data. We're adding product tours using [Onborda](https://github.com/uixmat/onborda) — a free, Next.js-native tour library powered by Framer Motion + Tailwind + Radix Portal. Tours will auto-start on first visit and be replayable via a help button in the sidebar.

---

## Step 1 — Install Onborda + resolve `framer-motion` peer dep

**File:** `frontend/package.json`

```bash
cd frontend && pnpm add onborda framer-motion
```

> The project uses `motion` (v12.34.2), which is the renamed `framer-motion`. Onborda internally imports from `framer-motion`, so we need the `framer-motion` package installed as well — it's just a thin re-export wrapper, no code duplication.

**Tailwind v4 content scanning:** Onborda docs say to add its dist to Tailwind's `content` array, but Tailwind v4 uses automatic content detection via `@import "tailwindcss"` in CSS. We need to add a `@source` directive in `globals.css`:

**File:** `frontend/app/globals.css`
```css
@source "../node_modules/onborda/dist";
```

---

## Step 2 — Create the custom tour card component

**New file:** `frontend/components/tour/tour-card.tsx`

A `"use client"` component matching Lunara's design system (Card border, IBM Plex Sans, muted-foreground, primary accent). Uses `CardComponentProps` from Onborda.

Structure:
- Step counter badge (`currentStep / totalSteps`)
- Title with optional icon
- Content body (ReactNode — can include inline images, tips)
- Previous / Next / Close buttons using our existing `Button` component
- `{arrow}` passthrough for Onborda's directional arrow SVG
- Styled with shadcn/ui `Card`, `Badge`, and `Button` components

---

## Step 3 — Define tour steps

**New file:** `frontend/lib/tour-steps.tsx`

Export a `tourSteps` array with multiple named tours:

### Tour: `"welcome"` — Full user journey (cross-route)

| # | Page | Selector ID | Title | Side | Notes |
|---|------|------------|-------|------|-------|
| 1 | `/dashboard` | `#tour-create-project` | Create your first project | bottom | Points at CreateProjectDialog button |
| 2 | `/dashboard` | `#tour-sidebar-nav` | Navigate your workspace | right | Points at sidebar |
| 3 | `/dashboard/[projectId]/data-sources` | `#tour-connectors` | Connect your data | bottom | Points at connector cards grid. Uses `nextRoute` |
| 4 | `/dashboard/[projectId]/data-sources` | `#tour-connected-sources` | Your connected sources | top | Points at connected sources section |
| 5 | `/dashboard/[projectId]/semantic` | `#tour-atlas-panel` | Meet Atlas | bottom | Points at Atlas panel. Uses `nextRoute` |
| 6 | `/dashboard/[projectId]/semantic` | `#tour-run-atlas` | Generate your semantic layer | left | Points at Run Atlas button |
| 7 | `/dashboard/[projectId]/chat` | `#tour-chat-panel` | Chat with your data | left | Points at chat panel. Uses `nextRoute` |
| 8 | `/dashboard/[projectId]/chat` | `#tour-sql-editor` | SQL Editor | top | Points at center SQL editor panel |
| 9 | `/dashboard/[projectId]/chat` | `#tour-explorer` | Explore your workspace | right | Points at explorer sidebar |

> **Note on cross-route tours:** Onborda supports `nextRoute` / `prevRoute` props on each step. Since project-scoped pages need a `projectId`, the routes will be dynamically constructed. We'll create a helper function `buildTourSteps(projectId?: string)` that injects the correct routes.

### Tour: `"dashboard"` — Dashboard-only tour (for replay)

Steps 1-2 from above, scoped to dashboard only.

### Tour: `"chat"` — Chat page tour (for replay)

Steps 7-9 from above, scoped to chat page only.

---

## Step 4 — Add `id` attributes to target elements

Add `id` props to existing elements across these files:

| File | Element | ID |
|------|---------|-----|
| `components/dashboard/projects-view.tsx` | `<CreateProjectDialog>` wrapper | `tour-create-project` |
| `components/app-shell/sidebar.tsx` | `<aside>` root | `tour-sidebar-nav` |
| `app/dashboard/[projectId]/data-sources/page.tsx` | Connectors grid `<section>` | `tour-connectors` |
| `app/dashboard/[projectId]/data-sources/page.tsx` | Connected sources `<section>` | `tour-connected-sources` |
| `app/dashboard/[projectId]/semantic/page.tsx` | Atlas panel `<section>` | `tour-atlas-panel` |
| `app/dashboard/[projectId]/semantic/page.tsx` | Run Atlas `<Button>` | `tour-run-atlas` |
| `app/dashboard/[projectId]/chat/client.tsx` | Chat panel `<div>` (right side) | `tour-chat-panel` |
| `app/dashboard/[projectId]/chat/client.tsx` | SQL Editor `<div>` (center) | `tour-sql-editor` |
| `app/dashboard/[projectId]/chat/client.tsx` | Explorer `<aside>` (left) | `tour-explorer` |

These are non-breaking — just adding `id` attributes to existing elements.

---

## Step 5 — Wire up `OnbordaProvider` + `Onborda` in the dashboard layout

**File:** `frontend/app/dashboard/layout.tsx`

The dashboard layout is a **server component**. We need to:

1. Create a new client wrapper: **`frontend/components/tour/tour-provider.tsx`**
   - `"use client"` component
   - Imports `OnbordaProvider`, `Onborda` from `"onborda"`
   - Imports our custom `TourCard` and `tourSteps` (or `buildTourSteps`)
   - Wraps `{children}` with `<OnbordaProvider><Onborda steps={steps} ...>{children}</Onborda></OnbordaProvider>`
   - Props: `shadowRgb`, `shadowOpacity`, `cardComponent={TourCard}`, `cardTransition`

2. Wrap children in dashboard layout:
   ```tsx
   <TourProvider>
     <div className="flex h-screen overflow-hidden bg-background">
       <OrgActivator />
       <Sidebar />
       <main>{children}</main>
     </div>
   </TourProvider>
   ```

> Only the dashboard layout gets the provider — no need on landing/auth pages.

---

## Step 6 — Auto-start on first visit

**New file:** `frontend/hooks/use-tour-autostart.ts`

- Uses `useEffect` + `localStorage` key `lunara_tour_seen`
- On mount, checks if the key exists. If not, calls `startOnborda("welcome")` after a short delay (500ms to let the page render)
- After the tour completes (or is dismissed), sets `lunara_tour_seen = "true"` in localStorage
- Hook is called in `TourProvider`

> Alternative: persist tour-seen state in Supabase user metadata. But localStorage is simpler for MVP and doesn't require API calls. Can migrate later.

---

## Step 7 — Help button in sidebar for manual replay

**File:** `frontend/components/app-shell/sidebar.tsx`

Add a `HelpCircle` (from `lucide-react`) icon button in `SidebarFooter`, between the theme toggle and the `UserButton`.

- On click: calls `startOnborda("welcome")`
- Uses `useOnborda()` hook from Onborda
- Collapsed state: icon-only with tooltip "Start tour"
- Expanded state: icon + "Help" label

Since `Sidebar` is already a `"use client"` component, this is straightforward.

---

## Files to create (3)

| File | Purpose |
|------|---------|
| `frontend/components/tour/tour-card.tsx` | Custom card component for tour tooltips |
| `frontend/components/tour/tour-provider.tsx` | Client wrapper with OnbordaProvider + Onborda |
| `frontend/lib/tour-steps.tsx` | Tour step definitions (welcome, dashboard, chat) |

## Files to modify (7)

| File | Change |
|------|--------|
| `frontend/app/globals.css` | Add `@source` directive for Onborda's dist |
| `frontend/app/dashboard/layout.tsx` | Wrap children with `<TourProvider>` |
| `frontend/components/app-shell/sidebar.tsx` | Add help button with `useOnborda()` |
| `frontend/components/dashboard/projects-view.tsx` | Add `id="tour-create-project"` to wrapper |
| `frontend/app/dashboard/[projectId]/data-sources/page.tsx` | Add `id` attrs to sections |
| `frontend/app/dashboard/[projectId]/semantic/page.tsx` | Add `id` attrs to Atlas panel + Run Atlas |
| `frontend/app/dashboard/[projectId]/chat/client.tsx` | Add `id` attrs to panels |

---

## Verification

1. `cd frontend && pnpm dev` — confirm no build errors
2. Navigate to `/dashboard` — tour should auto-start on first visit
3. Click through all 9 steps — verify cross-route navigation works (dashboard → data sources → semantic → chat)
4. Close tour mid-way → verify it doesn't restart on next page load
5. Clear localStorage `lunara_tour_seen` → verify tour auto-starts again
6. Click help button in sidebar → verify manual tour replay works
7. Test in dark mode — verify tour card respects theme
8. Test with sidebar collapsed — verify tour targets are still visible
9. Run `pnpm build` — verify no TypeScript/build errors
