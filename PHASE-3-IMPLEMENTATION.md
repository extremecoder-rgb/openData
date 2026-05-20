# Phase 3 — Meta-Feature Extraction

> Goal: FastAPI reads a dataset from R2 and extracts a rich feature profile.
> Focus: Python AI service only. No frontend changes.

---

## Build Order (6 steps)

| Step | Action | Files |
|------|--------|-------|
| **1** | Install `boto3` | `pip install boto3` |
| **2** | Create `app/` package structure | Move `main.py` into `app/`, create `__init__.py` |
| **3** | Create `app/meta_features.py` | `extract_meta_features(df)` function |
| **4** | Create `app/r2_client.py` | `download_from_r2(r2_key)` using boto3 |
| **5** | Create `app/supabase_client.py` | Store profile + update dataset status |
| **6** | Update `app/main.py` | Add `POST /profile` endpoint |

---

## Step 1: Install boto3

```bash
cd services/ai
pip install boto3
```

Add `"boto3>=1.42.0"` to `pyproject.toml` dependencies.

---

## Step 2: Create `app/` Package

```
services/ai/
├── app/
│   ├── __init__.py
│   └── main.py          (moved from root main.py)
├── main.py              (delete after move)
```

Update startup command: `uvicorn app.main:app --reload --port 8000`
Update `turbo.json` or root `package.json` `dev:ai` script accordingly.

---

## Step 3: Create `app/meta_features.py`

```python
# services/ai/app/meta_features.py

import pandas as pd
import numpy as np
from scipy import stats

def extract_meta_features(df: pd.DataFrame) -> dict:
    features = {}
    for col in df.columns:
        series = df[col]
        col_features = {
            "dtype": str(series.dtype),
            "missing_pct": float(series.isna().mean()),
            "cardinality": int(series.nunique()),
            "cardinality_ratio": float(series.nunique() / len(series)),
            "is_categorical": series.dtype == "object",
        }
        if pd.api.types.is_numeric_dtype(series):
            clean = series.dropna()
            col_features.update({
                "mean": float(clean.mean()) if len(clean) > 0 else None,
                "median": float(clean.median()) if len(clean) > 0 else None,
                "std": float(clean.std()) if len(clean) > 1 else None,
                "skewness": float(stats.skew(clean)) if len(clean) > 2 else 0.0,
                "kurtosis": float(stats.kurtosis(clean)) if len(clean) > 2 else 0.0,
                "outlier_pct": float(_iqr_outlier_pct(clean)),
                "zero_pct": float((clean == 0).mean()),
                "negative_pct": float((clean < 0).mean()),
            })
        features[col] = col_features

    features["__dataset__"] = {
        "row_count": len(df),
        "col_count": len(df.columns),
        "numeric_col_count": int(df.select_dtypes(include="number").shape[1]),
        "categorical_col_count": int(df.select_dtypes(include="object").shape[1]),
        "total_missing_pct": float(df.isna().mean().mean()),
        "duplicate_row_pct": float(df.duplicated().mean()),
    }
    return features

def _iqr_outlier_pct(series: pd.Series) -> float:
    Q1 = series.quantile(0.25)
    Q3 = series.quantile(0.75)
    IQR = Q3 - Q1
    return float(((series < Q1 - 1.5 * IQR) | (series > Q3 + 1.5 * IQR)).mean())
```

---

## Step 4: Create `app/r2_client.py`

```python
# services/ai/app/r2_client.py

import boto3
import os
from io import BytesIO
import pandas as pd

def get_r2_client():
    return boto3.client(
        "s3",
        endpoint_url=os.environ["CLOUDFLARE_R2_ENDPOINT"],
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )

def download_csv_from_r2(r2_key: str) -> pd.DataFrame:
    client = get_r2_client()
    bucket = os.environ["R2_BUCKET_NAME"]
    response = client.get_object(Bucket=bucket, Key=r2_key)
    body = response["Body"].read()
    return pd.read_csv(BytesIO(body))
```

---

## Step 5: Create `app/supabase_client.py`

```python
# services/ai/app/supabase_client.py

import os
from supabase import create_client, Client

def get_supabase_client() -> Client:
    return create_client(
        os.environ["SUPABASE_URL"],
        os.environ["SUPABASE_SERVICE_ROLE_KEY"],
    )

def update_dataset_status(client: Client, dataset_id: str, status: str, **kwargs):
    update_data = {"status": status, "updated_at": "now()"}
    update_data.update(kwargs)
    return client.table("datasets").update(update_data).eq("id", dataset_id).execute()
```

---

## Step 6: Update `app/main.py`

```python
# services/ai/app/main.py

from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv
from app.meta_features import extract_meta_features
from app.r2_client import download_csv_from_r2
from app.supabase_client import get_supabase_client, update_dataset_status

load_dotenv()

app = FastAPI(title="Preprocessing Engine AI Service", version="0.1.0")

class ProfileRequest(BaseModel):
    r2_key: str
    filename: str

@app.get("/health")
async def health():
    return {"status": "ok"}

@app.post("/profile")
async def profile(req: ProfileRequest):
    try:
        # Update status to profiling
        supabase = get_supabase_client()
        update_dataset_status(supabase, req.r2_key.split("/")[-1].split("-")[0], "profiling")

        # Download CSV from R2
        df = download_csv_from_r2(req.r2_key)

        # Extract meta-features
        profile = extract_meta_features(df)

        # Update dataset with counts
        dataset_meta = profile.get("__dataset__", {})
        update_dataset_status(
            supabase,
            req.r2_key.split("/")[-1].split("-")[0],
            "done",
            row_count=dataset_meta.get("row_count"),
            column_count=dataset_meta.get("col_count"),
        )

        return profile
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

---

## Verification

1. `pip install boto3` succeeds
2. `uvicorn app.main:app --reload --port 8000` starts without error
3. `GET /health` returns `{"status": "ok"}`
4. `POST /profile` with valid R2 key returns full JSON profile
5. Supabase dataset status updates correctly

---

## Commit message

```
feat(ai): Phase 3 — meta-feature extraction profile endpoint

- POST /profile endpoint downloads CSV from R2 via boto3
- Meta-feature extraction per column (missing%, skewness, outliers,
  cardinality, kurtosis, zero%, negative%)
- Dataset-level stats (row count, duplicate%, numeric/categorical split)
- Supabase integration: store profile, update status
- Refactored into app/ package structure for future modules
```


