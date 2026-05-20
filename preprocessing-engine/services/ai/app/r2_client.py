# services/ai/app/r2_client.py

import boto3
import os
from io import BytesIO
import pandas as pd


def get_r2_client():
    return boto3.client(
        "s3",
        endpoint_url=os.environ.get("CLOUDFLARE_R2_ENDPOINT"),
        aws_access_key_id=os.environ.get("R2_ACCESS_KEY_ID"),
        aws_secret_access_key=os.environ.get("R2_SECRET_ACCESS_KEY"),
        region_name="auto",
    )


def download_csv_from_r2(r2_key: str) -> pd.DataFrame:
    client = get_r2_client()
    bucket = os.environ.get("R2_BUCKET_NAME")
    response = client.get_object(Bucket=bucket, Key=r2_key)
    body = response["Body"].read()
    return pd.read_csv(BytesIO(body))