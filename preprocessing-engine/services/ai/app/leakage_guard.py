# services/ai/app/leakage_guard.py

import pandas as pd
from typing import TypedDict


class LeakageReport(TypedDict):
    has_leakage: bool
    leaking_columns: list
    leakage_risk_score: float
    details: dict


def check_data_leakage(
    df: pd.DataFrame,
    action_history: list[dict],
    target_col: str,
    test_size: float = 0.2,
) -> LeakageReport:
    """
    Check for data leakage in the preprocessing pipeline.
    
    Leakage sources:
    1. Imputation using test set indices
    2. Scaling using test set statistics
    3. Encoding using test set frequencies
    4. Target variable leakage in feature engineering
    """
    has_leakage = False
    leaking_columns = []
    details = {}
    risk_score = 0.0

    df_clean = df.dropna(subset=[target_col])
    n_train = int(len(df_clean) * (1 - test_size))
    train_idx = set(df_clean.index[:n_train])

    for entry in action_history:
        col = entry.get("column", "")
        action_type = entry.get("action", {}).get("type", "")
        strategy = entry.get("action", {}).get("strategy", "")

        if action_type == "imputation":
            if strategy in ["mean", "median", "mode"]:
                imputed_values = df[col].isna()
                train_imputed = sum(
                    1 for idx in df.index 
                    if idx in train_idx and imputed_values.get(idx, False)
                )
                if train_imputed > 0:
                    has_leakage = True
                    leaking_columns.append(col)
                    details[col] = {
                        "type": "imputation_leakage",
                        "strategy": strategy,
                        "note": f"Imputation computed using data that includes test set"
                    }
                    risk_score += 0.3

        elif action_type == "scaling":
            if strategy in ["standard", "minmax", "robust"]:
                mean_val = df[col].iloc[:n_train].mean()
                std_val = df[col].iloc[:n_train].std()
                if pd.isna(mean_val) or pd.isna(std_val):
                    has_leakage = True
                    leaking_columns.append(col)
                    details[col] = {
                        "type": "scaling_leakage",
                        "strategy": strategy,
                        "note": "Scaling parameters computed using data that includes test set"
                    }
                    risk_score += 0.4

        elif action_type == "encoding":
            if strategy in ["label", "onehot", "frequency"]:
                train_cats = set(df[col].iloc[:n_train].unique())
                all_cats = set(df[col].unique())
                if train_cats != all_cats:
                    has_leakage = True
                    leaking_columns.append(col)
                    details[col] = {
                        "type": "encoding_leakage",
                        "strategy": strategy,
                        "note": "Encoding computed using data that includes test set categories"
                    }
                    risk_score += 0.35

    if target_col in {entry.get("column", "") for entry in action_history}:
        has_leakage = True
        leaking_columns.append(target_col)
        details[target_col] = {
            "type": "target_leakage",
            "note": "Target column was modified during preprocessing"
        }
        risk_score += 0.8

    risk_score = min(risk_score, 1.0)

    return {
        "has_leakage": has_leakage,
        "leaking_columns": leaking_columns,
        "leakage_risk_score": round(risk_score, 3),
        "details": details,
    }