# services/ai/app/rl_agent/preprocessing_actions.py

import pandas as pd
import numpy as np
from sklearn.preprocessing import LabelEncoder, StandardScaler, MinMaxScaler, RobustScaler
from sklearn.impute import KNNImputer


def apply_action(df: pd.DataFrame, column: str, action: dict) -> pd.DataFrame:
    strategy = action["strategy"]
    action_type = action["type"]

    if action_type == "imputation":
        if strategy == "mean":
            df[column] = df[column].fillna(df[column].mean())
        elif strategy == "median":
            df[column] = df[column].fillna(df[column].median())
        elif strategy == "mode":
            df[column] = df[column].fillna(df[column].mode()[0])
        elif strategy == "knn":
            imputer = KNNImputer(n_neighbors=5)
            df[[column]] = imputer.fit_transform(df[[column]])
        elif strategy == "drop_col":
            df = df.drop(columns=[column])

    elif action_type == "encoding":
        if strategy == "label":
            le = LabelEncoder()
            df[column] = le.fit_transform(df[column].astype(str))
        elif strategy == "onehot":
            dummies = pd.get_dummies(df[column], prefix=column)
            df = pd.concat([df.drop(columns=[column]), dummies], axis=1)
        elif strategy == "frequency":
            freq = df[column].value_counts(normalize=True)
            df[column] = df[column].map(freq)
        elif strategy == "drop_col":
            df = df.drop(columns=[column])

    elif action_type == "scaling":
        if strategy == "standard":
            scaler = StandardScaler()
            df[[column]] = scaler.fit_transform(df[[column]])
        elif strategy == "minmax":
            scaler = MinMaxScaler()
            df[[column]] = scaler.fit_transform(df[[column]])
        elif strategy == "robust":
            scaler = RobustScaler()
            df[[column]] = scaler.fit_transform(df[[column]])
        elif strategy == "log":
            df[column] = np.log1p(df[column].clip(lower=0))

    elif action_type == "outlier":
        if strategy == "clip_iqr":
            Q1 = df[column].quantile(0.25)
            Q3 = df[column].quantile(0.75)
            IQR = Q3 - Q1
            df[column] = df[column].clip(Q1 - 1.5 * IQR, Q3 + 1.5 * IQR)
        elif strategy == "clip_zscore":
            mean, std = df[column].mean(), df[column].std()
            df[column] = df[column].clip(mean - 3 * std, mean + 3 * std)
        elif strategy == "drop_rows":
            Q1 = df[column].quantile(0.25)
            Q3 = df[column].quantile(0.75)
            IQR = Q3 - Q1
            df = df[(df[column] >= Q1 - 1.5 * IQR) & (df[column] <= Q3 + 1.5 * IQR)]

    return df