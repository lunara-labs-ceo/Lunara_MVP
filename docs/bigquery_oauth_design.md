# BigQuery OAuth + Per-Project Credentials Design

> **Priority:** CRITICAL — must be done before any multi-user launch
> **Target:** This weekend
> **Status:** Not started

---

## The Problem

**Current (broken) architecture:**
- Service account JSON is uploaded once and stored as a single encrypted file (`backend/data/credentials.enc`)
- One global `BigQueryService` instance is shared across ALL projects, ALL users
- Any new connection **overwrites** the previous one
- Users can URL-hack past the connection page and query using someone else's credentials
- Semantic models in Supabase reference tables from a specific BQ project, but the backend has no concept of which BQ project belongs to which Lunara project

**Impact:** If User A connects their BigQuery and User B connects theirs, User A's connection is silently destroyed. All of User A's projects now error out.

---

## The Fix: OAuth + Per-Project Connections

### 1. OAuth Flow (replaces service account upload)

```
User clicks "Connect BigQuery" on data_sources page
  → Redirect to Google OAuth consent screen
  → User grants BigQuery read access
  → Google redirects back with auth code
  → Backend exchanges code for access_token + refresh_token
  → Tokens stored in Supabase `project_connections` table
  → BigQuery client created from OAuth token (not service account)
```

**Google OAuth Scopes needed:**
- `https://www.googleapis.com/auth/bigquery.readonly`
- `https://www.googleapis.com/auth/userinfo.email` (to identify the user)

**Google Cloud Console setup:**
- Create OAuth 2.0 Client ID (Web application)
- Set authorized redirect URI: `https://lunaralabs.io/auth/bigquery/callback`
- Store client_id and client_secret as env vars

### 2. Supabase Schema

```sql
CREATE TABLE project_connections (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    project_id UUID NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES auth.users(id),
    provider TEXT NOT NULL DEFAULT 'bigquery',  -- future: snowflake, postgres, etc.
    gcp_project_id TEXT NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    token_expires_at TIMESTAMPTZ NOT NULL,
    connected_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(project_id, provider)
);

-- RLS: users can only see their own project connections
ALTER TABLE project_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users see own connections"
    ON project_connections FOR ALL
    USING (user_id = auth.uid());
```

### 3. Backend Changes

#### Delete the old global approach:
- Remove `backend/data/credentials.enc` and `connection_info.json`
- Remove `BigQueryService._load_existing_connection()`
- Remove `BigQueryService._save_credentials()`

#### New per-request BigQuery client:

```python
# services/bigquery.py — new approach

from google.oauth2.credentials import Credentials

class BigQueryService:
    """Per-project BigQuery client using OAuth tokens."""

    @staticmethod
    def from_oauth_token(access_token: str, refresh_token: str, 
                         project_id: str) -> 'BigQueryService':
        creds = Credentials(
            token=access_token,
            refresh_token=refresh_token,
            token_uri="https://oauth2.googleapis.com/token",
            client_id=os.getenv("GOOGLE_OAUTH_CLIENT_ID"),
            client_secret=os.getenv("GOOGLE_OAUTH_CLIENT_SECRET"),
        )
        client = bigquery.Client(credentials=creds, project=project_id)
        return BigQueryService(client)
```

#### New OAuth endpoints:

```python
# In main.py or a new routes/auth.py

@app.get("/auth/bigquery/start")
async def start_bigquery_oauth(project_id: str):
    """Redirect user to Google OAuth consent."""
    # Build OAuth URL with state=project_id
    # Redirect to Google
    
@app.get("/auth/bigquery/callback")  
async def bigquery_oauth_callback(code: str, state: str):
    """Exchange auth code for tokens, store in Supabase."""
    # Exchange code for tokens
    # Store in project_connections
    # Redirect back to data_sources page
```

#### Per-request client loading:

```python
# middleware or dependency

async def get_bq_service(project_id: str) -> BigQueryService:
    """Load OAuth tokens from Supabase and create a BQ client."""
    conn = await supabase.from_('project_connections') \
        .select('*').eq('project_id', project_id).single()
    
    if not conn:
        raise HTTPException(403, "No BigQuery connection for this project")
    
    # Refresh token if expired
    if conn['token_expires_at'] < datetime.utcnow():
        # Use refresh_token to get new access_token
        # Update Supabase record
        pass
    
    return BigQueryService.from_oauth_token(
        conn['access_token'], conn['refresh_token'], conn['gcp_project_id']
    )
```

### 4. Frontend Changes

#### data_sources.html:
- Replace file upload with "Connect with Google" OAuth button
- Show connection status by checking `project_connections` in Supabase

#### chat_agent.html + report_builder.html:
- On page load, check if `project_connections` exists for this `project_id`
- If no connection → redirect to data_sources page, don't allow URL-hacking
- Pass `project_id` to every API call so backend loads the right credentials

### 5. Page Guards (prevent URL-hacking)

Every project page must check:
```javascript
async function ensureConnection() {
    const { data } = await supabaseClient
        .from('project_connections')
        .select('id')
        .eq('project_id', projectId)
        .limit(1);
    
    if (!data || data.length === 0) {
        window.location.href = `/data_sources.html?project_id=${projectId}`;
        return false;
    }
    return true;
}
```

---

## Environment Variables Needed

```
GOOGLE_OAUTH_CLIENT_ID=xxx.apps.googleusercontent.com
GOOGLE_OAUTH_CLIENT_SECRET=xxx
GOOGLE_OAUTH_REDIRECT_URI=https://lunaralabs.io/auth/bigquery/callback
```

---

## Migration Checklist

- [ ] Create Google OAuth Client ID in Cloud Console
- [ ] Create `project_connections` table in Supabase with RLS
- [ ] Add OAuth env vars to Render
- [ ] Backend: Add `/auth/bigquery/start` and `/auth/bigquery/callback` endpoints
- [ ] Backend: Refactor `BigQueryService` to use OAuth tokens, delete file-based storage
- [ ] Backend: Add token refresh logic
- [ ] Backend: All `/api/v1/chat/*` and `/api/v1/report/*` endpoints require `project_id` and load per-project BQ client
- [ ] Frontend: Replace file upload on data_sources.html with OAuth button
- [ ] Frontend: Add page guards to chat_agent.html, report_builder.html, semantic_layer_setup.html
- [ ] Delete `backend/data/credentials.enc` and `connection_info.json`
- [ ] **SECURITY AUDIT:** Full audit of Supabase RLS policies, API endpoint auth checks, exposed secrets, SQL injection vectors, and any other server-side files storing sensitive data
- [ ] Test: Two projects with different BQ connections work independently
