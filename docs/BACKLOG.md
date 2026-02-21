# Lunara MVP Backlog

## Future Improvements

### Frontend Architecture
- [ ] **Migrate to React/Vite** — Enables shadcn components, TypeScript, proper build system
  - Convert HTML pages to React components
  - Add Tailwind CSS + shadcn/ui
  - Serve built static files from FastAPI
- [ ] **Loading spinner component** — Add elegant spinner for loading states (requires React)

### BigQuery Connection
- [ ] **OAuth "Sign in with Google"** — Replace JSON upload with OAuth flow for better UX
  - Register OAuth 2.0 app in Google Cloud Console
  - Use `bigquery.readonly` scope
  - Handle OAuth callback

### Other Pages to Restyle
- [ ] schema_browser.html ✅
- [ ] semantic_layer_setup.html
- [ ] chat_agent.html
- [ ] report_builder.html

### Phase 2: Agent Saving
- [ ] Add "Save Agent" button to chat_agent.html
- [ ] Save agent config to Supabase `agents` table
- [ ] Nav buttons for Report/PPT/Dashboard builders

### Agent Infrastructure
- [ ] **ADK DatabaseSessionService for Chat Agent** — Replace `InMemorySessionService` + prompt-injection history with ADK's native `DatabaseSessionService` backed by Supabase Postgres so conversation context survives server restarts natively. See `docs/adk-session-persistence.md` for full implementation plan.

### Chat Agent — Open Items (Feb 17–18)
- [ ] **Verify Save Artifact e2e** — Modal works but Supabase insert not confirmed with a live auth session
- [ ] **Verify semantic model ID population** — Code wired up (`semanticModelId` stored and passed to `chat_sessions`), needs live verification
- [ ] **Investigate query execution 400 error** — Browser test showed 400 during query execution, possibly missing dataset qualification
- [ ] **RLS / auth expiry handling** — `chat_sessions` and `chat_artifacts` inserts fail with 42501 if Supabase auth session expires; add graceful handling
- [ ] **Auth guard on `report_builder.html`** — Intentionally skipped per product decision; revisit if needed
