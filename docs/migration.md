# GCP Account Migration — Audit & Auth Analysis

## Overview

This document covers two things:
1. A full audit of every GCP-related reference in the codebase, and what needs to change when migrating to a new GCP account.
2. An honest assessment of how the app currently authenticates to GCP (Vertex AI + BigQuery), what is wrong with it, and what the correct pattern looks like.

---

## Part 1 — Migration Audit

### What GCP Services This App Uses

- **Vertex AI (Gemini)** — powers all four AI agents (chat, semantic, relationship, report) via `google-adk`
- **BigQuery** — used to execute SQL queries against user-connected datasets

### Files That Need to Change

#### 1. Service Account JSON File (The Obvious One)

**File:** `lunara-dev-094f5e9e682e.json` (project root)

This is the app's own unencrypted GCP service account private key. It is read directly by all four agent services as a local dev fallback.

- Replace with the new account's service account key JSON
- The filename is hardcoded in 5 source files (see below), so either keep the same filename or update all references

**Contents of the old key (for reference when revoking):**
- Project: `lunara-dev`
- Service Account: `lunara-app-sa@lunara-dev.iam.gserviceaccount.com`
- Client ID: `104652772411013331414`
- Key ID: `094f5e9e682e8aada3c5cce79b5ca472a3aeb67a`

> The old key should be revoked in the old GCP console after the new one is working.

---

#### 2. Hardcoded Project ID and Credential Filename — 5 Source Files

The project ID `lunara-dev` and the credential filename `lunara-dev-094f5e9e682e.json` are baked into source code in five files. All five need to be updated.

| File | Line | What to Change |
|---|---|---|
| `backend/services/chat_agent.py` | 16 | `"lunara-dev"` → new project ID |
| `backend/services/chat_agent.py` | 23 | credential filename → new filename |
| `backend/services/semantic_agent.py` | 16 | `"lunara-dev"` → new project ID |
| `backend/services/semantic_agent.py` | 23 | credential filename → new filename |
| `backend/services/relationship_agent.py` | 16 | `"lunara-dev"` → new project ID |
| `backend/services/relationship_agent.py` | 23 | credential filename → new filename |
| `backend/services/report_agent.py` | 19 | credential filename → new filename |
| `backend/services/report_agent.py` | 24 | `"lunara-dev"` → new project ID |
| `backend/services/bigquery.py` | 228 | credential filename → new filename |

The pattern in each agent service file looks like this:

```python
os.environ.setdefault("GOOGLE_CLOUD_PROJECT", "lunara-dev")      # ← change this
os.environ.setdefault("GOOGLE_CLOUD_LOCATION", "global")
os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "True")

CREDENTIALS_PATH = PROJECT_ROOT / "lunara-dev-094f5e9e682e.json" # ← change this
```

---

#### 3. `backend/.env`

Update these values:

```
GOOGLE_GENAI_USE_VERTEXAI=TRUE
GOOGLE_CLOUD_PROJECT=<new-project-id>       # was: lunara-dev
GOOGLE_CLOUD_LOCATION=us-central1           # probably stays the same
```

---

#### 4. Render Dashboard — `GOOGLE_APPLICATION_CREDENTIALS_JSON`

The Render deployment uses a base64-encoded service account JSON passed as an environment variable. This needs to be updated in the Render dashboard manually.

To generate the new value:
```bash
base64 -i new-service-account-key.json | tr -d '\n'
```

Paste the output into the `GOOGLE_APPLICATION_CREDENTIALS_JSON` env var in Render.

---

#### 5. Runtime Data Files — Delete and Let Them Regenerate

These files are generated at runtime from previous sessions and contain the old project ID. They are not source code but will cause confusion if left stale.

| File | Content | Action |
|---|---|---|
| `backend/data/connection_info.json` | `{"project_id": "lunara-dev", ...}` | Delete — regenerates on next BQ connection |
| `backend/data/semantic_layer.yaml` | `project_id: lunara-dev` on line 1 | Delete — regenerates when semantic layer is rebuilt |
| `backend/data/credentials.enc` | Encrypted BQ service account from old project | Delete — user re-uploads via UI after migration |

---

### What Needs to Be Set Up in the New GCP Account

#### APIs to Enable

- **Vertex AI API** — required for all Gemini model calls via `google-adk`
- **BigQuery API** — required for BQ query execution

#### Service Account to Create

Create a new service account with these IAM roles:

| Role | Why |
|---|---|
| `roles/aiplatform.user` | Call Vertex AI / Gemini models |
| `roles/bigquery.user` | Run queries |
| `roles/bigquery.dataViewer` | Read dataset/table metadata and data |

After creating the service account, generate a JSON key. This JSON file replaces `lunara-dev-094f5e9e682e.json`.

#### BigQuery Note

Users connect their own BigQuery projects through the UI — they upload their own service account credentials, which get encrypted and stored in `backend/data/credentials.enc`. Your app's service account does not need permissions on user BQ projects. It only needs Vertex AI access. The BigQuery API just needs to be enabled in your project so the `google-cloud-bigquery` SDK can be imported.

#### Vertex AI / Gemini Model Availability

The app uses model `"gemini-2.0-flash-preview"` (referenced in code as `"gemini-2-flash-preview"` in some places). Confirm this model is available in your chosen region (`us-central1` or `global`). Check the Vertex AI model garden in the new project console.

---

### Migration Checklist

```
[ ] Create new GCP project
[ ] Enable Vertex AI API
[ ] Enable BigQuery API
[ ] Create service account with aiplatform.user + bigquery.user + bigquery.dataViewer
[ ] Download service account JSON key
[ ] Replace lunara-dev-094f5e9e682e.json with new key file at project root
[ ] Update credential filename reference in chat_agent.py (line 23)
[ ] Update credential filename reference in semantic_agent.py (line 23)
[ ] Update credential filename reference in relationship_agent.py (line 23)
[ ] Update credential filename reference in report_agent.py (line 19)
[ ] Update credential filename reference in bigquery.py (line 228)
[ ] Update GOOGLE_CLOUD_PROJECT in chat_agent.py (line 16)
[ ] Update GOOGLE_CLOUD_PROJECT in semantic_agent.py (line 16)
[ ] Update GOOGLE_CLOUD_PROJECT in relationship_agent.py (line 16)
[ ] Update GOOGLE_CLOUD_PROJECT in report_agent.py (line 24)
[ ] Update GOOGLE_CLOUD_PROJECT in backend/.env
[ ] Delete backend/data/connection_info.json
[ ] Delete backend/data/semantic_layer.yaml
[ ] Delete backend/data/credentials.enc
[ ] Generate base64 of new service account JSON
[ ] Update GOOGLE_APPLICATION_CREDENTIALS_JSON in Render dashboard
[ ] Revoke old service account key in old GCP console
[ ] Test: start backend, verify agents initialize without credential errors
[ ] Test: connect a BQ dataset through the UI
[ ] Test: run a chat query end-to-end
```

---

## Part 2 — Auth Approach Analysis

### The Two Separate Auth Concerns

The app authenticates to GCP for two distinct purposes with two different credential sets:

1. **Vertex AI (Gemini agents)** — uses the app's own service account to call Gemini models
2. **BigQuery** — uses credentials the *user* uploads through the UI to query their own data

These are intentionally separate. Understanding this distinction is important because several of the problems below stem from these two concerns bleeding into each other.

---

### What the Current Flow Actually Does

#### Vertex AI Auth Flow

```
Local dev:
  each agent service file (at import time)
    → checks if GOOGLE_APPLICATION_CREDENTIALS is set
    → if not, loads lunara-dev-094f5e9e682e.json directly
    → sets GOOGLE_APPLICATION_CREDENTIALS to that path
  google-adk reads GOOGLE_APPLICATION_CREDENTIALS → authenticates to Vertex AI

Render (production):
  main.py:setup_gcp_credentials() (runs at startup)
    → reads GOOGLE_APPLICATION_CREDENTIALS_JSON env var (base64-encoded JSON)
    → decodes it, writes to /tmp/gcp_credentials.json
    → sets GOOGLE_APPLICATION_CREDENTIALS to that path
  each agent service file (at import time)
    → GOOGLE_APPLICATION_CREDENTIALS is already set, so skips its fallback
  google-adk reads GOOGLE_APPLICATION_CREDENTIALS → authenticates to Vertex AI
```

#### BigQuery Auth Flow

```
User connects BQ via UI:
  uploads service account JSON
    → encrypted with Fernet, stored as backend/data/credentials.enc
    → decrypted at query time into a bigquery.Client stored as self._client
  all queries use self._client (user's credentials)

No user credentials uploaded:
  bigquery.py:execute_query() fallback
    → checks GOOGLE_APPLICATION_CREDENTIALS env var
    → falls back to lunara-dev-094f5e9e682e.json
    → uses app's own service account to run the query
```

---

### What Is Reasonable

**The base64 env var pattern for Render (`GOOGLE_APPLICATION_CREDENTIALS_JSON`)**

This is an accepted workaround for non-GCP hosting. On GCP-native infrastructure (Cloud Run, GKE) you would use Workload Identity Federation and have no key files anywhere — the runtime identity is the service account. Since this app runs on Render, injecting credentials via environment variable is the right tradeoff. The pattern itself is sound.

**User-uploaded BQ credentials encrypted at rest**

The concept is solid. Users bring their own service account, upload it through the UI, it gets Fernet-encrypted and stored. At query time it is decrypted and used. This is a legitimate design for a multi-tenant BQ analytics tool.

**Having a centralized `setup_gcp_credentials()` in `main.py`**

The intent is correct. One place that handles credential bootstrapping at startup. The problem is that the service files don't trust it — they do their own redundant setup anyway.

---

### What Is Actually Wrong

#### Problem 1 — Credential Setup Is Duplicated Across 5 Files, Not Centralized

`main.py` runs `setup_gcp_credentials()` and sets `GOOGLE_APPLICATION_CREDENTIALS`. But then each agent service file runs its own version of the same logic at **module import time**, independently of `main.py`:

```python
# chat_agent.py, semantic_agent.py, relationship_agent.py — runs at import
if os.getenv("GOOGLE_APPLICATION_CREDENTIALS"):
    print(f"✓ Chat Agent: Using credentials from env var")
elif CREDENTIALS_PATH.exists():
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(CREDENTIALS_PATH)
    print(f"✓ Chat Agent: Using credentials from {CREDENTIALS_PATH}")
else:
    print(f"⚠ Chat Agent: No credentials found")

# report_agent.py — also runs at import, before main.py can set anything
SERVICE_ACCOUNT_PATH = Path(__file__).parent.parent.parent / "lunara-dev-094f5e9e682e.json"
if not os.getenv("GOOGLE_APPLICATION_CREDENTIALS") and SERVICE_ACCOUNT_PATH.exists():
    os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(SERVICE_ACCOUNT_PATH)
```

This means:
- If `main.py`'s setup fails silently, any one of the 5 service files might set a stale or wrong credential path without surfacing an error
- The behavior depends on Python import order, which is fragile
- Renaming the credential file during migration requires touching 5 source files instead of 1

#### Problem 2 — Project ID and Location Are Config Baked Into Source Code

All four agent service files have this pattern:

```python
os.environ.setdefault("GOOGLE_CLOUD_PROJECT", "lunara-dev")
os.environ.setdefault("GOOGLE_CLOUD_LOCATION", "global")
os.environ.setdefault("GOOGLE_GENAI_USE_VERTEXAI", "True")
```

`setdefault` only writes the value if the env var is not already set. So if `.env` is loaded first, these lines have no effect. But if something goes wrong with `.env` loading, the app silently falls back to `lunara-dev` as the project — wrong account, wrong billing, no error. Config should be in the environment; source code should fail loudly if it is missing, not quietly fall back to a hardcoded value.

#### Problem 3 — Writing Credentials to a Temp File Unnecessarily

`main.py` does this:

```python
creds_json = base64.b64decode(creds_json_b64).decode('utf-8')
creds_path = Path(tempfile.gettempdir()) / "gcp_credentials.json"
creds_path.write_text(creds_json)
os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = str(creds_path)
```

The Google SDKs (`google-auth`, `google-cloud-bigquery`, `google.genai`) all support loading credentials from a parsed dict directly, without ever touching the filesystem:

```python
import json
from google.oauth2 import service_account

creds_dict = json.loads(base64.b64decode(creds_json_b64).decode('utf-8'))
credentials = service_account.Credentials.from_service_account_info(creds_dict)
```

Writing to `/tmp/gcp_credentials.json` leaves an unencrypted credential artifact on disk between requests. On Render this is low risk (ephemeral filesystem), but it is unnecessary.

#### Problem 4 — BigQuery Falls Back to the App's Service Account for User Queries

```python
# bigquery.py — the fallback in execute_query()
if self._client is not None:
    # use user's uploaded credentials ✓
    ...

# if self._client is None (no user credentials uploaded):
creds_from_env = os.getenv("GOOGLE_APPLICATION_CREDENTIALS")
credentials_path = project_root / "lunara-dev-094f5e9e682e.json"

if creds_from_env and Path(creds_from_env).exists():
    credentials = service_account.Credentials.from_service_account_file(creds_from_env)
elif credentials_path.exists():
    credentials = service_account.Credentials.from_service_account_file(str(credentials_path))

client = bigquery.Client(credentials=credentials, project=credentials.project_id)
query_job = client.query(sql)
```

If a user has not uploaded BQ credentials, `self._client` is `None` and the fallback uses the **app's own Vertex AI service account** to execute BigQuery queries. This means:
- Your service account would need permissions on the user's BQ project
- App credentials are being used to act on user data — the wrong trust boundary
- It will fail silently until it hits an IAM error deep in a query, not a clear "please connect" error

The fallback should simply raise a clear error: `"Not connected to BigQuery. Please upload credentials via the connection page."`

---

### What the Correct Pattern Looks Like

| Concern | Current | Better |
|---|---|---|
| Vertex AI credentials | SA JSON file on disk or base64 env var → temp file on disk → `GOOGLE_APPLICATION_CREDENTIALS` | base64 env var → parse JSON in memory → `Credentials` object, passed to SDK directly. No temp file. |
| Vertex AI project/location config | `setdefault` with hardcoded values in 5 source files | Only in `.env`, validated as required at startup in `main.py`. Fail loudly if missing. |
| Credential setup location | Duplicated across `main.py` + 4 service files at module import time | Once in `main.py`. Services receive a configured client or credentials object — they don't do their own auth. |
| BQ user credentials | Encrypted on disk, loaded into `self._client` at connection time | Same pattern — this is fine. |
| BQ fallback when no user credentials | Falls back to app's service account | Raises a clear error immediately. App SA and user BQ are not the same concern. |
| Long-term (if moving to Cloud Run) | Service account JSON everywhere | Workload Identity Federation — no key files, no env vars, the runtime is the identity |

---

### Summary

The authentication approach works but is brittle for the following reasons:

1. **Credential setup is not actually centralized** — it is duplicated across 5 files with import-order-dependent behavior
2. **Project config is hardcoded in source** — a misconfigured environment silently uses the wrong GCP project
3. **Temp file is unnecessary** — the SDK supports in-memory credential loading
4. **BigQuery's fallback crosses a trust boundary** — the app's service account should not be executing user data queries

For the current Render deployment, the base64 env var injection pattern is the right approach for non-GCP hosting. The issues above are not blocking for an MVP but will surface as maintenance pain on every future migration, deployment, or credential rotation.
