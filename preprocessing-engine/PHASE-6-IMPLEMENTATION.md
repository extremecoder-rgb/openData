# Phase 6 — LLM Explanation Layer

> Goal: Every preprocessing decision gets a human-readable explanation with confidence score.

---

## Build Order (3 steps)

| Step | Action |
|------|--------|
| **1** | Create `app/explainer.py` with `generate_explanation()` |
| **2** | Update `app/rl_agent/environment.py` to call explainer in `step()` |
| **3** | Update `app/supabase_client.py` with `save_audit_log()` |

---

## Step 1: Create `app/explainer.py`

```python
# services/ai/app/explainer.py

import os
import json
from groq import Groq

client = Groq(api_key=os.environ.get("GROQ_API_KEY"))


def generate_explanation(
    column: str,
    action: dict,
    meta_features: dict,
    accuracy_delta: float,
) -> dict:
    col_stats = meta_features.get(column, {})
    prompt = f"""
You are an expert data scientist explaining a preprocessing decision.

Column: {column}
Statistics:
- Missing: {col_stats.get('missing_pct', 0):.1%}
- Skewness: {col_stats.get('skewness', 'N/A')}
- Outlier %: {col_stats.get('outlier_pct', 0):.1%}
- Type: {'categorical' if col_stats.get('is_categorical') else 'numeric'}

Decision: {action['type']} → {action['strategy']}
Accuracy change: {accuracy_delta:+.3f}

Write a single concise sentence explaining WHY this strategy was chosen for this column.
Then give a confidence score from 0.0 to 1.0.
Respond in JSON: {{"reason": "...", "confidence": 0.xx}}
"""
    response = client.chat.completions.create(
        model="llama3-8b-8192",
        messages=[{"role": "user", "content": prompt}],
        temperature=0.1,
        max_tokens=150,
    )
    try:
        return json.loads(response.choices[0].message.content)
    except Exception:
        return {
            "reason": "Strategy selected based on column statistics.",
            "confidence": 0.75,
        }
```

---

## Step 2: Update `environment.py`

Integrate explainer into `step()`:

```python
def step(self, column: str, action: dict) -> tuple[float, dict]:
    # ... existing logic ...

    # Generate LLM explanation
    from app.explainer import generate_explanation

    explanation = generate_explanation(
        column, action, self.meta_features, reward
    )

    entry = {
        "column": column,
        "action": action,
        "reward": reward,
        "score_before": self.baseline_score,
        "score_after": new_score,
        "reason": explanation.get("reason"),
        "confidence": explanation.get("confidence"),
    }
```

---

## Step 3: Update `supabase_client.py`

Add `save_audit_log()`:

```python
def save_audit_log(client: Client, dataset_id: str, entry: dict):
    return client.table("audit_logs").insert({
        "dataset_id": dataset_id,
        "column_name": entry.get("column"),
        "issue_detected": entry.get("action", {}).get("type"),
        "strategy_chosen": entry.get("action", {}).get("strategy"),
        "reason": entry.get("reason"),
        "confidence_score": entry.get("confidence"),
        "accuracy_delta": entry.get("reward", 0),
    }).execute()
```

---

## Verification

1. `POST /preprocess` returns action history with `reason` + `confidence`
2. Each entry has LLM-generated explanation
3. Audit logs saved to Supabase `audit_logs` table

---

## Commit message

```
feat(ai): Phase 6 — LLM explanation layer with Groq

- explainer.py: generate_explanation() calls Groq Llama3-8b
- Integrates into RL pipeline, adds reason + confidence to action history
- save_audit_log() persists explanations to Supabase audit_logs table
```

---

## What comes next

**Phase 7 — tRPC API Layer** — Frontend can call typed API endpoints with zero manual type writing.
