# services/ai/app/rl_agent/policy_trainer.py

import os
import json
import pickle
import numpy as np
import pandas as pd
from app.supabase_client import get_supabase_client

MODEL_PATH = os.path.join(os.path.dirname(__file__), "policy_model.pkl")
CORRECTIONS_FILE = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "data", "corrections.jsonl")


def extract_features_from_meta(col_features: dict) -> list[float]:
    """Convert meta-features dictionary into a fixed-length numeric vector for XGBoost."""
    # Handle missing / default values gracefully
    missing_pct = col_features.get("missing_pct", 0.0)
    cardinality = col_features.get("cardinality", 0.0)
    cardinality_ratio = col_features.get("cardinality_ratio", 0.0)
    is_categorical = 1.0 if col_features.get("is_categorical", False) else 0.0
    skewness = col_features.get("skewness", 0.0)
    kurtosis = col_features.get("kurtosis", 0.0)
    outlier_pct = col_features.get("outlier_pct", 0.0)
    zero_pct = col_features.get("zero_pct", 0.0)
    negative_pct = col_features.get("negative_pct", 0.0)

    return [
        missing_pct,
        cardinality,
        cardinality_ratio,
        is_categorical,
        skewness,
        kurtosis,
        outlier_pct,
        zero_pct,
        negative_pct,
    ]


def train_policy_from_corrections():
    """
    Loads human corrections, fetches column meta-features, trains an XGBoost
    classifier to predict corrected strategies, and saves it to policy_model.pkl.
    """
    if not os.path.exists(CORRECTIONS_FILE):
        return

    supabase = get_supabase_client()

    features_list = []
    labels_list = []

    # Read corrections from the local jsonl file
    with open(CORRECTIONS_FILE, "r") as f:
        for line in f:
            if not line.strip():
                continue
            entry = json.loads(line)
            audit_log_id = entry.get("audit_log_id")
            corrected_strategy = entry.get("corrected_strategy")

            if not audit_log_id or not corrected_strategy:
                continue

            try:
                # Retrieve audit log to find dataset_id and column_name
                res = supabase.table("audit_logs").select("dataset_id, column_name").eq("id", audit_log_id).execute()
                if not res.data:
                    continue
                audit_log = res.data[0]
                dataset_id = audit_log.get("dataset_id")
                column_name = audit_log.get("column_name")

                # Retrieve dataset to download R2 / storage key
                ds_res = supabase.table("datasets").select("r2_key").eq("id", dataset_id).execute()
                if not ds_res.data:
                    continue
                r2_key = ds_res.data[0].get("r2_key")

                # We download the CSV to extract meta features for that specific column
                from app.storage_client import download_csv_from_storage
                from app.meta_features import extract_meta_features

                df = download_csv_from_storage(r2_key)
                meta = extract_meta_features(df)
                col_meta = meta.get(column_name, {})

                # Extract numeric feature vector
                features = extract_features_from_meta(col_meta)
                features_list.append(features)
                labels_list.append(corrected_strategy)

            except Exception:
                # Log error and skip this entry
                continue

    if len(features_list) < 5:
        # Require a minimum of 5 corrections to prevent extreme overfitting
        return

    try:
        from xgboost import XGBClassifier
        from sklearn.preprocessing import LabelEncoder

        # Encode categorical strategy labels
        le = LabelEncoder()
        y = le.fit_transform(labels_list)
        X = np.array(features_list)

        # Train model with strong L1/L2 regularization
        model = XGBClassifier(
            max_depth=3,
            learning_rate=0.1,
            n_estimators=50,
            reg_alpha=1.0,
            reg_lambda=1.0,
            objective="multi:softprob",
        )
        model.fit(X, y)

        # Save model and label encoder
        with open(MODEL_PATH, "wb") as f:
            pickle.dump({"model": model, "label_encoder": le}, f)

    except Exception:
        pass
