# services/ai/app/supabase_client.py

import os
from supabase import create_client, Client


def get_supabase_client() -> Client:
    return create_client(
        os.environ.get("SUPABASE_URL"),
        os.environ.get("SUPABASE_SERVICE_ROLE_KEY"),
    )


def update_dataset_status(client: Client, dataset_id: str, status: str, **kwargs):
    update_data = {"status": status, "updated_at": "now()"}
    update_data.update(kwargs)
    return client.table("datasets").update(update_data).eq("id", dataset_id).execute()