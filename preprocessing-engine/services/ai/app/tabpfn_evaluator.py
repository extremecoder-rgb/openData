# services/ai/app/tabpfn_evaluator.py

import pandas as pd
import numpy as np
from sklearn.model_selection import cross_val_score
from sklearn.preprocessing import LabelEncoder
from tabpfn import TabPFNClassifier, TabPFNRegressor
from tabpfn.constants import ModelVersion


def evaluate_with_tabpfn(df: pd.DataFrame, target_col: str) -> float:
    if target_col not in df.columns:
        return 0.0

    df_clean = df.dropna().copy()
    if len(df_clean) < 20 or df_clean[target_col].nunique() < 2:
        return 0.0

    for col in df_clean.select_dtypes(include="object").columns:
        le = LabelEncoder()
        df_clean[col] = le.fit_transform(df_clean[col].astype(str))

    X = df_clean.drop(columns=[target_col]).values
    y = df_clean[target_col].values

    if X.shape[1] < 1:
        return 0.0

    if len(X) > 10000:
        idx = np.random.choice(len(X), 10000, replace=False)
        X, y = X[idx], y[idx]

    is_classification = df_clean[target_col].nunique() <= 20

    try:
        if is_classification:
            model = TabPFNClassifier()
            scores = cross_val_score(model, X, y, cv=3, scoring="accuracy")
        else:
            model = TabPFNRegressor()
            scores = cross_val_score(model, X, y, cv=3, scoring="r2")
        return float(scores.mean())
    except Exception:
        return 0.0
