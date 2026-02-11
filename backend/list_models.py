
import os
from pathlib import Path
from google.genai import Client
from google.oauth2 import service_account

BACKEND_DIR = Path(__file__).parent
PROJECT_ROOT = BACKEND_DIR.parent
CREDENTIALS_PATH = PROJECT_ROOT / "lunara-dev-094f5e9e682e.json"

def list_models():
    print(f"Loading credentials from {CREDENTIALS_PATH.name}...")
    creds = service_account.Credentials.from_service_account_file(
        str(CREDENTIALS_PATH),
        scopes=["https://www.googleapis.com/auth/cloud-platform"]
    )
    client = Client(vertexai=True, project="lunara-dev", location="us-central1", credentials=creds)

    print("Listing models...")
    try:
        # Pager object, iterate to find
        for model in client.models.list():
            if "gemini" in model.name.lower():
                print(f"Name: {model.name}, Display Name: {model.display_name}")
    except Exception as e:
        print(f"Error listing models: {e}")

if __name__ == "__main__":
    list_models()
