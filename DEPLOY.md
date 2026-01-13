# Lunara MVP - Render Deployment

## Quick Start (Local)
```bash
cd backend
pip install -r requirements.txt
uvicorn main:app --reload
```

## Environment Variables (Required for Render)
- `ENCRYPTION_KEY` - Fernet encryption key
- `GOOGLE_APPLICATION_CREDENTIALS_JSON` - Base64 encoded GCP service account JSON
- `RENDER` - Set to "true" to enable production mode
