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
        """Apply action to column, get reward from TabPFN, generate explanation."""
        new_df = self._apply_action(self.current_df.copy(), column, action)
        new_score = self._evaluate(new_df)
        reward = new_score - self.baseline_score
        self.current_df = new_df

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