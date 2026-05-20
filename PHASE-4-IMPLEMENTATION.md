# Phase 4 — RL Preprocessing Agent

> Goal: RL agent searches for the best preprocessing pipeline per dataset.
> Focus: Python AI service only. No frontend changes.

---

## Concept

The RL agent treats preprocessing as a sequential decision process:
- **State**: meta-features of the current column + dataset context
- **Action**: choose a preprocessing strategy from the action space
- **Reward**: accuracy improvement from TabPFN after applying the strategy

### Action Space

```
IMPUTATION: mean, median, mode, knn, drop_col
ENCODING:   label, onehot, target, frequency, drop_col
SCALING:    standard, minmax, robust, log, none
OUTLIER:    clip_iqr, clip_zscore, drop_rows, none
```

---

## Build Order (5 steps)

| Step | Action | Files |
|------|--------|-------|
| **1** | Create `app/rl_agent/` package | `__init__.py` |
| **2** | Create `preprocessing_actions.py` | `apply_action(df, column, action)` |
| **3** | Create `policy.py` | `select_action(meta_features, column)` |
| **4** | Create `environment.py` | Gym-style `PreprocessingEnv` class |
| **5** | Update `app/main.py` | Add `POST /preprocess` endpoint |

---

## Step 1: Create `app/rl_agent/` Package

```bash
mkdir services/ai/app/rl_agent
```

Create `services/ai/app/rl_agent/__init__.py` (empty file).

---

## Step 2: Create `app/rl_agent/preprocessing_actions.py`

```python
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
        # strategy == "none" -> no-op

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
        # strategy == "none" -> no-op

    return df
```

---

## Step 3: Create `app/rl_agent/policy.py`

```python
# services/ai/app/rl_agent/policy.py
# Phase 4: Rule-based policy seeded from meta-features
# Phase 9: Replace with trained XGBoost/neural policy


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
```

---

## Step 4: Create `app/rl_agent/environment.py`

```python
# services/ai/app/rl_agent/environment.py

import pandas as pd


class PreprocessingEnv:
    def __init__(self, df: pd.DataFrame, meta_features: dict, target_col: str):
        self.original_df = df.copy()
        self.current_df = df.copy()
        self.meta_features = meta_features
        self.target_col = target_col
        self.action_history = []
        self.baseline_score = self._evaluate(df)

    def step(self, column: str, action: dict) -> tuple[float, dict]:
        """Apply action to column, get reward from TabPFN."""
        new_df = self._apply_action(self.current_df.copy(), column, action)
        new_score = self._evaluate(new_df)
        reward = new_score - self.baseline_score
        self.current_df = new_df
        entry = {
            "column": column,
            "action": action,
            "reward": reward,
            "score_before": self.baseline_score,
            "score_after": new_score,
        }
        self.action_history.append(entry)
        self.baseline_score = new_score
        return reward, entry

    def _evaluate(self, df: pd.DataFrame) -> float:
        """Use TabPFN to get a quick accuracy score.
        Falls back to 0.0 if tabpfn_evaluator is not available yet (Phase 5)."""
        try:
            from app.tabpfn_evaluator import evaluate_with_tabpfn

            return evaluate_with_tabpfn(df, self.target_col)
        except ImportError:
            return 0.0

    def _apply_action(self, df, column, action):
        from app.rl_agent.preprocessing_actions import apply_action

        return apply_action(df, column, action)
```

---

## Step 5: Update `app/main.py`

Add the `POST /preprocess` endpoint:

```python
# Add to services/ai/app/main.py

class PreprocessRequest(BaseModel):
    r2_key: str
    filename: str
    target_column: str


@app.post("/preprocess")
async def preprocess(req: PreprocessRequest):
    try:
        # 1. Download CSV from R2
        from app.r2_client import download_csv_from_r2
        from app.meta_features import extract_meta_features

        df = download_csv_from_r2(req.r2_key)

        # 2. Extract meta-features
        meta_features = extract_meta_features(df)

        # 3. Run RL agent
        from app.rl_agent.policy import select_action
        from app.rl_agent.environment import PreprocessingEnv

        env = PreprocessingEnv(df.copy(), meta_features, req.target_column)

        for col in df.columns:
            if col == req.target_column:
                continue
            actions = select_action(meta_features, col)
            for action in actions:
                reward, entry = env.step(col, action)

        # 4. Update dataset status
        from app.supabase_client import get_supabase_client, update_dataset_status

        dataset_id = req.r2_key.split("/")[-1].split("-")[0]
        supabase = get_supabase_client()

        dataset_meta = meta_features.get("__dataset__", {})
        update_dataset_status(
            supabase,
            dataset_id,
            "done",
            row_count=dataset_meta.get("row_count"),
            column_count=dataset_meta.get("col_count"),
        )

        return {
            "dataset_id": dataset_id,
            "action_history": env.action_history,
            "meta_features": meta_features,
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
```

---

## Verification

1. FastAPI starts without error: `uvicorn app.main:app --reload --port 8000`
2. `GET /health` returns `{"status": "ok"}`
3. `POST /preprocess` with `{ r2_key, filename, target_column }` returns action history
4. Each action has: column, action type/strategy, reward, score_before, score_after

---

## Commit message

```
feat(ai): Phase 4 — RL preprocessing agent

- PreprocessingEnv: Gym-style environment with step(), evaluate()
- preprocessing_actions: 15 strategies across imputation, encoding,
  scaling, outlier handling
- policy: Rule-based action selection from meta-features
- POST /preprocess endpoint: full RL pipeline per column
```

---

## What comes next

**Phase 5 — TabPFN Evaluation Engine** — TabPFN acts as the reward oracle for the RL agent, replacing the 0.0 fallback in `_evaluate()`.
