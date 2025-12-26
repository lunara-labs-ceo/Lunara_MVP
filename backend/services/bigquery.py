"""BigQuery service for connection management."""
import json
import os
from pathlib import Path
from datetime import datetime
from typing import Optional, Tuple
from cryptography.fernet import Fernet
from google.cloud import bigquery
from google.oauth2 import service_account

from models.connection import ConnectionStatus


class BigQueryService:
    """Service for managing BigQuery connections and credentials."""
    
    CREDENTIALS_FILE = Path(__file__).parent.parent / "data" / "credentials.enc"
    CONNECTION_INFO_FILE = Path(__file__).parent.parent / "data" / "connection_info.json"
    
    def __init__(self, encryption_key: str):
        """Initialize the BigQuery service.
        
        Args:
            encryption_key: Fernet encryption key for encrypting credentials.
        """
        self.fernet = Fernet(encryption_key.encode())
        self._client: Optional[bigquery.Client] = None
        self._project_id: Optional[str] = None
        self._connected_at: Optional[str] = None
        
        # Ensure data directory exists
        self.CREDENTIALS_FILE.parent.mkdir(parents=True, exist_ok=True)
        
        # Try to load existing connection
        self._load_existing_connection()
    
    def _load_existing_connection(self) -> None:
        """Try to load an existing connection from stored credentials."""
        if self.CREDENTIALS_FILE.exists() and self.CONNECTION_INFO_FILE.exists():
            try:
                with open(self.CONNECTION_INFO_FILE, "r") as f:
                    info = json.load(f)
                    self._project_id = info.get("project_id")
                    self._connected_at = info.get("connected_at")
                    
                # Validate the connection is still working
                credentials = self._load_credentials()
                if credentials:
                    self._client = bigquery.Client(
                        credentials=credentials,
                        project=self._project_id
                    )
            except Exception:
                # If anything fails, reset the connection
                self._client = None
                self._project_id = None
                self._connected_at = None
    
    def _load_credentials(self) -> Optional[service_account.Credentials]:
        """Load and decrypt stored credentials.
        
        Returns:
            Credentials object if successful, None otherwise.
        """
        if not self.CREDENTIALS_FILE.exists():
            return None
            
        try:
            with open(self.CREDENTIALS_FILE, "rb") as f:
                encrypted_data = f.read()
            decrypted_data = self.fernet.decrypt(encrypted_data)
            credentials_dict = json.loads(decrypted_data.decode())
            return service_account.Credentials.from_service_account_info(credentials_dict)
        except Exception:
            return None
    
    def _save_credentials(self, credentials_dict: dict) -> None:
        """Encrypt and save credentials to disk.
        
        Args:
            credentials_dict: The service account JSON as a dictionary.
        """
        encrypted_data = self.fernet.encrypt(json.dumps(credentials_dict).encode())
        with open(self.CREDENTIALS_FILE, "wb") as f:
            f.write(encrypted_data)
    
    def _save_connection_info(self, project_id: str) -> None:
        """Save connection metadata.
        
        Args:
            project_id: The BigQuery project ID.
        """
        info = {
            "project_id": project_id,
            "connected_at": datetime.utcnow().isoformat()
        }
        with open(self.CONNECTION_INFO_FILE, "w") as f:
            json.dump(info, f)
        self._project_id = project_id
        self._connected_at = info["connected_at"]
    
    def validate_and_connect(self, credentials_dict: dict) -> Tuple[ConnectionStatus, str, Optional[int]]:
        """Validate credentials and establish a BigQuery connection.
        
        Args:
            credentials_dict: The service account JSON as a dictionary.
            
        Returns:
            Tuple of (status, message, datasets_count).
        """
        try:
            # Validate required fields
            required_fields = ["type", "project_id", "private_key", "client_email"]
            for field in required_fields:
                if field not in credentials_dict:
                    return (
                        ConnectionStatus.ERROR,
                        f"Missing required field: {field}",
                        None
                    )
            
            if credentials_dict.get("type") != "service_account":
                return (
                    ConnectionStatus.ERROR,
                    "Invalid credential type. Expected 'service_account'.",
                    None
                )
            
            # Create credentials object
            credentials = service_account.Credentials.from_service_account_info(
                credentials_dict
            )
            
            # Create BigQuery client and test connection
            project_id = credentials_dict["project_id"]
            client = bigquery.Client(credentials=credentials, project=project_id)
            
            # Test by listing datasets
            datasets = list(client.list_datasets(max_results=100))
            datasets_count = len(datasets)
            
            # Save encrypted credentials and connection info
            self._save_credentials(credentials_dict)
            self._save_connection_info(project_id)
            
            # Update instance state
            self._client = client
            
            return (
                ConnectionStatus.CONNECTED,
                f"Successfully connected to project '{project_id}'",
                datasets_count
            )
            
        except Exception as e:
            error_message = str(e)
            # Make error messages more user-friendly
            if "Could not deserialize key data" in error_message:
                error_message = "Invalid private key format in credentials."
            elif "invalid_grant" in error_message:
                error_message = "Invalid credentials. Please check your service account key."
            elif "Permission denied" in error_message or "403" in error_message:
                error_message = "Permission denied. Ensure the service account has BigQuery access."
            
            return (ConnectionStatus.ERROR, error_message, None)
    
    def get_status(self) -> Tuple[ConnectionStatus, Optional[str], Optional[str]]:
        """Get the current connection status.
        
        Returns:
            Tuple of (status, project_id, connected_at).
        """
        if self._client is not None and self._project_id is not None:
            # Verify connection is still valid
            try:
                list(self._client.list_datasets(max_results=1))
                return (ConnectionStatus.CONNECTED, self._project_id, self._connected_at)
            except Exception:
                self._client = None
                return (ConnectionStatus.ERROR, None, None)
        
        return (ConnectionStatus.DISCONNECTED, None, None)
    
    def disconnect(self) -> None:
        """Disconnect and remove stored credentials."""
        if self.CREDENTIALS_FILE.exists():
            self.CREDENTIALS_FILE.unlink()
        if self.CONNECTION_INFO_FILE.exists():
            self.CONNECTION_INFO_FILE.unlink()
        self._client = None
        self._project_id = None
        self._connected_at = None
    
    @property
    def client(self) -> Optional[bigquery.Client]:
        """Get the BigQuery client if connected."""
        return self._client
    
    @property
    def project_id(self) -> Optional[str]:
        """Get the connected project ID."""
        return self._project_id
