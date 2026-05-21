// Shared TypeScript types for Preprocessing Engine

export interface Dataset {
  id: string;
  user_id: string;
  filename: string;
  r2_key: string;
  status: DatasetStatus;
  row_count: number | null;
  column_count: number | null;
  created_at: string;
  updated_at: string;
}

export type DatasetStatus = "uploaded" | "profiling" | "profiled" | "processing" | "done" | "failed";

export interface AuditLog {
  id: string;
  dataset_id: string;
  column_name: string;
  issue_detected: string;
  strategy_chosen: string;
  reason: string;
  confidence_score: number;
  accuracy_delta: number;
  created_at: string;
}

export interface UserCorrection {
  id: string;
  audit_log_id: string;
  original_strategy: string;
  corrected_strategy: string;
  created_at: string;
}

export interface MetaFeatureProfile {
  columns: Record<string, ColumnFeatures>;
  dataset: DatasetMeta;
}

export interface ColumnFeatures {
  dtype: string;
  missing_pct: number;
  cardinality: number;
  cardinality_ratio: number;
  is_categorical: boolean;
  mean?: number;
  median?: number;
  std?: number;
  skewness?: number;
  kurtosis?: number;
  outlier_pct?: number;
  zero_pct?: number;
  negative_pct?: number;
}

export interface DatasetMeta {
  row_count: number;
  col_count: number;
  numeric_col_count: number;
  categorical_col_count: number;
  total_missing_pct: number;
  duplicate_row_pct: number;
}

export interface PreprocessingAction {
  type: "imputation" | "encoding" | "scaling" | "outlier";
  strategy: string;
}

export interface ActionHistoryEntry {
  column: string;
  action: PreprocessingAction;
  reward: number;
  score_before: number;
  score_after: number;
  reason?: string;
  confidence?: number;
}

export interface PreprocessingResult {
  dataset_id: string;
  actions: ActionHistoryEntry[];
  cleaned_csv_url: string;
  audit_report_url: string;
}
