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
