# services/ai/app/explainer.py

import os
import json
from groq import Groq


def _get_client():
    api_key = os.environ.get("GROQ_API_KEY")
    if not api_key:
        raise RuntimeError("GROQ_API_KEY environment variable is not set")
    return Groq(api_key=api_key)


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
    client = _get_client()
    response = client.chat.completions.create(
        model="llama-3.1-8b-instant",
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
