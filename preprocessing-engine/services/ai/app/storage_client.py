# services/ai/app/storage_client.py

import os
import pandas as pd
from io import BytesIO
from supabase import create_client, Client


def get_storage_client() -> Client:
    return create_client(
        os.environ.get("SUPABASE_URL"),
        os.environ.get("SUPABASE_SERVICE_ROLE_KEY"),
    )


def download_csv_from_storage(file_key: str) -> pd.DataFrame:
    client = get_storage_client()
    response = client.storage.from_("datasets").download(file_key)
    return pd.read_csv(BytesIO(response))
