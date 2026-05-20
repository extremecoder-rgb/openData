# services/ai/app/storage_client.py

import os
import pandas as pd
from io import BytesIO
from supabase import create_client, Client


def get_storage_client() -> Client:
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        raise RuntimeError("SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set")
    return create_client(url, key)


def download_csv_from_storage(file_key: str) -> pd.DataFrame:
    if not file_key:
        raise ValueError("file_key is required")
    client = get_storage_client()
    response = client.storage.from_("datasets").download(file_key)
    if not response:
        raise FileNotFoundError(f"File not found in storage: {file_key}")
    return pd.read_csv(BytesIO(response))
