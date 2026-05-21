# services/ai/app/rl_agent/policy.py

import os
import pickle
import numpy as np

MODEL_PATH = os.path.join(os.path.dirname(__file__), "policy_model.pkl")


def select_action(meta_features: dict, column: str) -> list[dict]:
    """Returns ordered list of actions to try for a column, prioritising predictions from an active learning XGBoost model if it exists."""
    col = meta_features.get(column, {})
    actions = []

    # Check if a trained active learning policy model exists
    if os.path.exists(MODEL_PATH):
        try:
            with open(MODEL_PATH, "rb") as f:
                data = pickle.load(f)
                model = data.get("model")
                le = data.get("label_encoder")

            if model and le:
                from app.rl_agent.policy_trainer import extract_features_from_meta
                feats = extract_features_from_meta(col)
                pred_encoded = model.predict(np.array([feats]))
                pred_label = le.inverse_transform(pred_encoded)[0]

                if ":" in pred_label:
                    act_type, act_strat = pred_label.split(":")
                    actions.append({"type": act_type, "strategy": act_strat, "source": "xgboost_policy"})
        except Exception:
            pass

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

    # Deduplicate actions (keeping the xgboost one if it exists first)
    seen = set()
    deduped_actions = []
    for act in actions:
        key = f"{act['type']}:{act['strategy']}"
        if key not in seen:
            seen.add(key)
            deduped_actions.append(act)

    return deduped_actions