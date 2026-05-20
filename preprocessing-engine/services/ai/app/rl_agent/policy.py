# services/ai/app/rl_agent/policy.py


def select_action(meta_features: dict, column: str) -> list[dict]:
    """Returns ordered list of actions to try for a column."""
    col = meta_features.get(column, {})
    actions = []

    # Imputation
    if col.get("missing_pct", 0) > 0:
        if col.get("skewness", 0) > 1.0:
            actions.append({"type": "imputation", "strategy": "median"})
        else:
            actions.append({"type": "imputation", "strategy": "mean"})

    # Encoding
    if col.get("is_categorical"):
        if col.get("cardinality_ratio", 1) < 0.05:
            actions.append({"type": "encoding", "strategy": "onehot"})
        else:
            actions.append({"type": "encoding", "strategy": "frequency"})

    # Scaling
    if not col.get("is_categorical"):
        if abs(col.get("skewness", 0)) > 1.0:
            actions.append({"type": "scaling", "strategy": "robust"})
        else:
            actions.append({"type": "scaling", "strategy": "standard"})

    # Outlier handling
    if col.get("outlier_pct", 0) > 0.05:
        actions.append({"type": "outlier", "strategy": "clip_iqr"})

    return actions