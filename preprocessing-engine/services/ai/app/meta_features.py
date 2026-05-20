# services/ai/app/meta_features.py

import pandas as pd
import numpy as np
from scipy import stats


def _is_categorical(series: pd.Series) -> bool:
    dtype = series.dtype
    if isinstance(dtype, pd.CategoricalDtype):
        return True
    if dtype == "object":
        n_unique = series.nunique()
        total = len(series)
        return n_unique < min(total * 0.5, 50) if total > 0 else False
    return False


def extract_meta_features(df: pd.DataFrame) -> dict:
    features = {}
    for col in df.columns:
        series = df[col]
        col_features = {
            "dtype": str(series.dtype),
            "missing_pct": float(series.isna().mean()),
            "cardinality": int(series.nunique()),
            "cardinality_ratio": float(series.nunique() / len(series)) if len(series) > 0 else 0.0,
            "is_categorical": _is_categorical(series),
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