# AGENTS.md — AI Preprocessing Engine
> Full build plan for an Explainable Meta-Learning Data Preprocessing Engine
> Stack: Next.js · NestJS · tRPC · FastAPI · TabPFN · RL Agent · PostgreSQL · Redis · Supabase · Cloudflare R2

---

## What You Are Building

An intelligent data preprocessing system that:
- Accepts raw, messy tabular datasets (CSV)
- Automatically profiles the dataset (meta-features)
- Uses a Reinforcement Learning agent to search the best preprocessing pipeline
- Evaluates each pipeline using TabPFN as a fast reward signal
- Explains every decision with confidence scores via an LLM
- Learns from user corrections over time (human-in-the-loop)
- Delivers a clean dataset + full audit trail

---

## Monorepo Structure (Turborepo)

```
preprocessing-engine/
├── apps/
│   ├── web/                  # Next.js 15 frontend
│   └── api/                  # NestJS 11 API gateway
├── services/
│   └── ai/                   # FastAPI Python AI core
├── packages/
│   ├── types/                # Shared TypeScript types
│   └── config/               # Shared configs (eslint, tsconfig)
├── turbo.json
├── package.json
└── AGENTS.md                 # This file
```

---

## Phase 0 — Project Bootstrap
> Goal: Monorepo running, all services talking to each other locally

### Tasks

- [ ] Init Turborepo
  ```bash
  npx create-turbo@latest preprocessing-engine
  cd preprocessing-engine
  ```

- [ ] Scaffold Next.js app
  ```bash
  cd apps && npx create-next-app@latest web \
    --typescript --tailwind --app --src-dir
  ```

- [ ] Scaffold NestJS app
  ```bash
  cd apps && npx @nestjs/cli new api
  ```

- [ ] Scaffold FastAPI service
  ```bash
  mkdir -p services/ai
  cd services/ai
  python -m venv venv
  source venv/bin/activate
  pip install fastapi uvicorn tabpfn pandas numpy scikit-learn \
    scipy statsmodels python-dotenv groq redis celery
  ```

- [ ] Create shared `packages/types` package with TypeScript interfaces

- [ ] Add `turbo.json` pipeline config for build/dev/lint

- [ ] Wire `.env` files:
  - `SUPABASE_URL`, `SUPABASE_ANON_KEY`
  - `UPSTASH_REDIS_URL`, `UPSTASH_REDIS_TOKEN`
  - `GROQ_API_KEY`
  - `CLOUDFLARE_R2_BUCKET`, `R2_ACCESS_KEY`, `R2_SECRET_KEY`

- [ ] Verify: `turbo dev` starts all three services concurrently

### Done When
All three services run locally. `GET /health` returns 200 on NestJS and FastAPI.

---

## Phase 1 — Data Ingestion & Storage
> Goal: User can upload a CSV. It gets stored and a job is queued.

### NestJS Tasks (`apps/api`)

- [ ] Install dependencies
  ```bash
  npm install @nestjs/bull bull ioredis @supabase/supabase-js \
    @aws-sdk/client-s3 @trpc/server zod
  ```

- [ ] Create `UploadModule` with a `POST /upload` endpoint
  - Accept multipart/form-data (use `@nestjs/platform-express` + `multer`)
  - Validate file type (CSV only), max size 50MB
  - Upload raw file to Cloudflare R2 using AWS S3 SDK
  - Create a `dataset` record in Supabase (status: `uploaded`)
  - Push a `preprocess` job to BullMQ queue

- [ ] Create `DatasetModule` with:
  - `GET /datasets` — list user's datasets
  - `GET /datasets/:id` — get single dataset + status
  - `GET /datasets/:id/results` — get cleaned dataset + audit trail

- [ ] Set up BullMQ with Upstash Redis
  ```typescript
  BullModule.forRoot({
    connection: {
      host: process.env.UPSTASH_REDIS_URL,
      port: 6379,
      tls: {},
    },
  })
  ```

- [ ] Create `PreprocessQueue` producer that calls FastAPI when job is picked up

### Supabase Schema

```sql
-- datasets table
create table datasets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users,
  filename text not null,
  r2_key text not null,
  status text default 'uploaded',   -- uploaded | profiling | processing | done | failed
  row_count int,
  column_count int,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- audit_logs table (every preprocessing decision)
create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  dataset_id uuid references datasets,
  column_name text,
  issue_detected text,
  strategy_chosen text,
  reason text,
  confidence_score float,
  accuracy_delta float,
  created_at timestamptz default now()
);

-- user_corrections table (human-in-the-loop)
create table user_corrections (
  id uuid primary key default gen_random_uuid(),
  audit_log_id uuid references audit_logs,
  original_strategy text,
  corrected_strategy text,
  created_at timestamptz default now()
);
```

### Done When
Upload a CSV via Postman → file appears in R2 → row in Supabase → job in BullMQ queue.

---

## Phase 2 — Meta-Feature Extraction
> Goal: FastAPI reads a dataset and extracts a rich feature profile.

### FastAPI Tasks (`services/ai`)

- [ ] Create `POST /profile` endpoint
  - Input: R2 file key (FastAPI downloads it using boto3)
  - Output: `MetaFeatureProfile` JSON object

- [ ] Build `meta_features.py` module

  ```python
  # services/ai/app/meta_features.py

  import pandas as pd
  import numpy as np
  from scipy import stats

  def extract_meta_features(df: pd.DataFrame) -> dict:
      features = {}
      for col in df.columns:
          series = df[col]
          col_features = {
              "dtype": str(series.dtype),
              "missing_pct": series.isna().mean(),
              "cardinality": series.nunique(),
              "cardinality_ratio": series.nunique() / len(series),
              "is_categorical": series.dtype == "object",
          }
          if pd.api.types.is_numeric_dtype(series):
              clean = series.dropna()
              col_features.update({
                  "mean": clean.mean(),
                  "median": clean.median(),
                  "std": clean.std(),
                  "skewness": stats.skew(clean) if len(clean) > 2 else 0,
                  "kurtosis": stats.kurtosis(clean) if len(clean) > 2 else 0,
                  "outlier_pct": _iqr_outlier_pct(clean),
                  "zero_pct": (clean == 0).mean(),
                  "negative_pct": (clean < 0).mean(),
              })
          features[col] = col_features

      features["__dataset__"] = {
          "row_count": len(df),
          "col_count": len(df.columns),
          "numeric_col_count": df.select_dtypes(include="number").shape[1],
          "categorical_col_count": df.select_dtypes(include="object").shape[1],
          "total_missing_pct": df.isna().mean().mean(),
          "duplicate_row_pct": df.duplicated().mean(),
      }
      return features

  def _iqr_outlier_pct(series: pd.Series) -> float:
      Q1 = series.quantile(0.25)
      Q3 = series.quantile(0.75)
      IQR = Q3 - Q1
      return ((series < Q1 - 1.5 * IQR) | (series > Q3 + 1.5 * IQR)).mean()
  ```

- [ ] Store profile result in Supabase against the dataset record
- [ ] Update dataset status to `profiling` → `processing`

### Done When
`POST /profile` with a messy CSV key returns a full JSON profile with per-column stats.

---

## Phase 3 — RL Preprocessing Agent
> Goal: RL agent searches for the best preprocessing pipeline per dataset.

### Concept

The RL agent treats preprocessing as a sequential decision process:
- **State**: meta-features of the current column + dataset context
- **Action**: choose a preprocessing strategy from the action space
- **Reward**: accuracy improvement from TabPFN after applying the strategy

### Action Space

```python
IMPUTATION_ACTIONS = ["mean", "median", "mode", "knn", "drop_col"]
ENCODING_ACTIONS   = ["label", "onehot", "target", "frequency", "drop_col"]
SCALING_ACTIONS    = ["standard", "minmax", "robust", "log", "none"]
OUTLIER_ACTIONS    = ["clip_iqr", "clip_zscore", "drop_rows", "none"]
```

### FastAPI Tasks

- [ ] Create `app/rl_agent/` directory

- [ ] Build `environment.py` — the Gym-style environment
  ```python
  # services/ai/app/rl_agent/environment.py

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
          self.action_history.append({
              "column": column,
              "action": action,
              "reward": reward,
              "score_before": self.baseline_score,
              "score_after": new_score,
          })
          self.baseline_score = new_score
          return reward, self.action_history[-1]

      def _evaluate(self, df: pd.DataFrame) -> float:
          """Use TabPFN to get a quick accuracy score."""
          from app.tabpfn_evaluator import evaluate_with_tabpfn
          return evaluate_with_tabpfn(df, self.target_col)

      def _apply_action(self, df, column, action):
          from app.preprocessing_actions import apply_action
          return apply_action(df, column, action)
  ```

- [ ] Build `preprocessing_actions.py`
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
              df[column] = df[column].clip(Q1 - 1.5*IQR, Q3 + 1.5*IQR)
          elif strategy == "clip_zscore":
              mean, std = df[column].mean(), df[column].std()
              df[column] = df[column].clip(mean - 3*std, mean + 3*std)
          elif strategy == "drop_rows":
              Q1 = df[column].quantile(0.25)
              Q3 = df[column].quantile(0.75)
              IQR = Q3 - Q1
              df = df[(df[column] >= Q1 - 1.5*IQR) & (df[column] <= Q3 + 1.5*IQR)]

      return df
  ```

- [ ] Build `policy.py` — the RL policy (start with rule-based, evolve to learned)
  ```python
  # services/ai/app/rl_agent/policy.py
  # Phase 3: Rule-based policy seeded from meta-features
  # Phase 5: Replace with trained XGBoost/neural policy

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

- [ ] Create `POST /preprocess` endpoint that runs the full pipeline

### Done When
`POST /preprocess` with a dataset key + target column returns a processed dataframe + action history with reward scores per column.

---

## Phase 4 — TabPFN Evaluation Engine
> Goal: TabPFN acts as the reward oracle for the RL agent.

### FastAPI Tasks

- [ ] Create `app/tabpfn_evaluator.py`

  ```python
  # services/ai/app/tabpfn_evaluator.py

  import pandas as pd
  import numpy as np
  from sklearn.model_selection import cross_val_score
  from sklearn.preprocessing import LabelEncoder
  from tabpfn import TabPFNClassifier, TabPFNRegressor
  from tabpfn.constants import ModelVersion

  def evaluate_with_tabpfn(df: pd.DataFrame, target_col: str) -> float:
      """
      Returns a cross-validated accuracy score using TabPFN.
      This is the reward signal for the RL agent.
      """
      if target_col not in df.columns:
          return 0.0

      df_clean = df.dropna().copy()
      if len(df_clean) < 20:
          return 0.0

      # Encode any remaining categoricals for TabPFN
      for col in df_clean.select_dtypes(include="object").columns:
          le = LabelEncoder()
          df_clean[col] = le.fit_transform(df_clean[col].astype(str))

      X = df_clean.drop(columns=[target_col]).values
      y = df_clean[target_col].values

      # Cap at 10k rows for TabPFN speed
      if len(X) > 10000:
          idx = np.random.choice(len(X), 10000, replace=False)
          X, y = X[idx], y[idx]

      is_classification = df_clean[target_col].nunique() <= 20

      try:
          if is_classification:
              model = TabPFNClassifier.create_default_for_version(ModelVersion.V2_6)
              scores = cross_val_score(model, X, y, cv=3, scoring="accuracy")
          else:
              model = TabPFNRegressor.create_default_for_version(ModelVersion.V2_6)
              scores = cross_val_score(model, X, y, cv=3, scoring="r2")
          return float(scores.mean())
      except Exception:
          return 0.0
  ```

- [ ] Add TabPFN model warm-up on FastAPI startup event (avoids cold start on first request)

### Done When
`evaluate_with_tabpfn()` returns a float score in < 10 seconds for a 1000-row dataset.

---

## Phase 5 — LLM Explanation Layer
> Goal: Every preprocessing decision gets a human-readable explanation with confidence score.

### FastAPI Tasks

- [ ] Install Groq SDK: `pip install groq`

- [ ] Create `app/explainer.py`

  ```python
  # services/ai/app/explainer.py

  import os
  from groq import Groq

  client = Groq(api_key=os.environ["GROQ_API_KEY"])

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
      import json
      try:
          return json.loads(response.choices[0].message.content)
      except Exception:
          return {"reason": "Strategy selected based on column statistics.", "confidence": 0.75}
  ```

- [ ] Integrate explainer into the preprocessing pipeline — call after each RL step
- [ ] Save each explanation to `audit_logs` table in Supabase

### Done When
After preprocessing, every column action has a `reason` string and `confidence_score` stored in the DB.

---

## Phase 6 — tRPC API Layer
> Goal: Frontend can call typed API endpoints with zero manual type writing.

### NestJS + tRPC Tasks

- [ ] Install tRPC adapter: `npm install @trpc/server @trpc/client`

- [ ] Define shared router in `packages/types/src/trpc.ts`
  ```typescript
  import { initTRPC } from '@trpc/server';
  import { z } from 'zod';

  const t = initTRPC.create();

  export const appRouter = t.router({
    dataset: t.router({
      list: t.procedure.query(async () => { /* ... */ }),
      get: t.procedure
        .input(z.object({ id: z.string().uuid() }))
        .query(async ({ input }) => { /* ... */ }),
      upload: t.procedure
        .input(z.object({ filename: z.string(), size: z.number() }))
        .mutation(async ({ input }) => { /* ... */ }),
    }),
    auditLog: t.router({
      byDataset: t.procedure
        .input(z.object({ datasetId: z.string().uuid() }))
        .query(async ({ input }) => { /* ... */ }),
    }),
  });

  export type AppRouter = typeof appRouter;
  ```

- [ ] Wire tRPC router into NestJS using a middleware adapter

- [ ] In `apps/web`, install client: `npm install @trpc/client @trpc/react-query`

- [ ] Create `lib/trpc.ts` in Next.js and wrap `_app.tsx` with TRPCProvider

### Done When
Frontend can call `trpc.dataset.list.useQuery()` with full TypeScript autocomplete.

---

## Phase 7 — Next.js Frontend
> Goal: Clean, working UI for upload → processing → results → download.

### Pages & Components

- [ ] `/` — Landing page
  - Hero: "Turn messy data into ML-ready datasets in seconds"
  - Upload CTA, feature highlights

- [ ] `/dashboard` — User's datasets list
  - Table of datasets with status badges (`uploaded` / `processing` / `done`)
  - Real-time status polling via TanStack Query refetchInterval

- [ ] `/datasets/[id]` — Dataset detail page, 3 tabs:
  - **Overview**: row/col count, missing % heatmap, column types chart
  - **Audit Trail**: table showing each column, strategy chosen, reason, confidence score, accuracy delta
  - **Download**: download cleaned CSV + download JSON audit report

- [ ] Upload component
  - Drag and drop zone (use `react-dropzone`)
  - Progress bar
  - File validation client-side before upload

- [ ] `ColumnCard` component — used in audit trail
  ```
  ┌─────────────────────────────────────┐
  │ age                    NUMERIC      │
  │ Missing: 18%  Skewness: 1.4        │
  │ ─────────────────────────────────── │
  │ Strategy: Median Imputation         │
  │ "Skewness > 1.2, median robust     │
  │  to outliers in this distribution"  │
  │ Accuracy Δ: +4.3%   ████████░░ 0.87│
  └─────────────────────────────────────┘
  ```

- [ ] Human feedback component — override button on each card
  - Dropdown to choose alternative strategy
  - Submit → calls `POST /feedback` → stored in `user_corrections` table

### Shadcn Components to install
```bash
npx shadcn@latest add button card badge table tabs progress
npx shadcn@latest add select dropdown-menu toast
```

### Done When
Full flow works: upload CSV → watch status update in real time → view audit trail → download cleaned file.

---

## Phase 8 — Human Feedback Loop
> Goal: User corrections improve the RL policy over time.

### NestJS Tasks
- [ ] `POST /feedback` endpoint
  - Body: `{ auditLogId, correctedStrategy }`
  - Saves to `user_corrections` table
  - Publishes a `feedback` event to BullMQ

### FastAPI Tasks
- [ ] `POST /learn` endpoint
  - Consumes correction events from queue
  - Extracts meta-features + correct strategy as a training example
  - Appends to a local `corrections.jsonl` training file
  - Re-weights the policy (Phase 3 policy → Phase 8 learned policy)

- [ ] Build `app/rl_agent/policy_trainer.py`
  - Loads `corrections.jsonl`
  - Trains an XGBoost classifier:
    - Input: meta-feature vector for a column
    - Output: best strategy label
  - Saves model to `policy_model.pkl`
  - Next inference call uses learned model if available, falls back to rules

### Done When
Override a strategy → system logs it → after 10+ corrections, policy predictions shift toward user preferences.

---

## Phase 9 — DevOps & Deployment
> Goal: Everything deployed, free, CI/CD automated.

### Services Map

| Service | Platform | Free Tier |
|---------|----------|-----------|
| Next.js | Vercel | Yes |
| NestJS | Railway | $5 credit/mo |
| FastAPI + Celery | Railway | Same credit |
| PostgreSQL | Supabase | 500MB free |
| Redis | Upstash | 10k cmd/day free |
| File storage | Cloudflare R2 | 10GB free |
| Auth | Supabase Auth | Free |
| Error tracking | Sentry | Free tier |

### Tasks

- [ ] Add `Dockerfile` to `apps/api` (NestJS)
  ```dockerfile
  FROM node:20-alpine
  WORKDIR /app
  COPY package*.json ./
  RUN npm ci --only=production
  COPY . .
  RUN npm run build
  EXPOSE 3001
  CMD ["node", "dist/main"]
  ```

- [ ] Add `Dockerfile` to `services/ai` (FastAPI)
  ```dockerfile
  FROM python:3.11-slim
  WORKDIR /app
  COPY requirements.txt .
  RUN pip install --no-cache-dir -r requirements.txt
  COPY . .
  EXPOSE 8000
  CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
  ```

- [ ] Add `railway.json` configs for NestJS and FastAPI services

- [ ] Set up GitHub Actions CI pipeline
  ```yaml
  # .github/workflows/ci.yml
  name: CI
  on: [push, pull_request]
  jobs:
    lint-and-type-check:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-node@v4
          with: { node-version: '20' }
        - run: npm ci
        - run: npx turbo lint type-check

    test-python:
      runs-on: ubuntu-latest
      steps:
        - uses: actions/checkout@v4
        - uses: actions/setup-python@v5
          with: { python-version: '3.11' }
        - run: pip install -r services/ai/requirements.txt
        - run: cd services/ai && pytest
  ```

- [ ] Connect Railway to GitHub repo for auto-deploy on push to `main`
- [ ] Connect Vercel to GitHub repo for auto-deploy on push to `main`
- [ ] Add `TABPFN_TOKEN` env var to Railway FastAPI service

### Done When
Push to `main` → GitHub Actions runs → Railway and Vercel auto-deploy → live URL works end to end.

---

## Phase 10 — Polish for Hackathon Demo
> Goal: Demo-ready in under 5 minutes, impressive to judges.

- [ ] Add demo mode with a pre-loaded messy dataset (Titanic, House Prices)
- [ ] Add a "processing" animation that shows live RL steps as they happen (SSE stream from FastAPI)
- [ ] Add a comparison view: "Before vs After" side-by-side dataframe
- [ ] Add summary stats card: "We fixed 847 issues across 12 columns in 8.3 seconds"
- [ ] Add export to JSON audit report button
- [ ] Record a 2-min demo video for submission
- [ ] Write a clean README with architecture diagram

---

## Key Files Reference

```
services/ai/app/
├── main.py                    # FastAPI app entry point
├── meta_features.py           # Dataset profiler
├── tabpfn_evaluator.py        # Reward oracle
├── explainer.py               # LLM explanation generator
├── preprocessing_actions.py   # All preprocessing strategies
└── rl_agent/
    ├── environment.py         # Gym-style RL environment
    ├── policy.py              # Rule-based + learned policy
    └── policy_trainer.py      # XGBoost policy trainer

apps/api/src/
├── upload/                    # File upload module
├── dataset/                   # Dataset CRUD
├── queue/                     # BullMQ producers
└── trpc/                      # tRPC router

apps/web/src/
├── app/                       # Next.js App Router pages
├── components/                # UI components
└── lib/trpc.ts                # tRPC client setup
```

---

## Build Order Summary

```
Phase 0  →  Monorepo + all services running locally
Phase 1  →  Upload CSV → stored in R2 → job queued
Phase 2  →  Meta-feature profiler working
Phase 3  →  RL agent selecting preprocessing actions
Phase 4  →  TabPFN giving reward scores
Phase 5  →  LLM generating explanations + audit trail
Phase 6  →  tRPC connecting frontend to backend
Phase 7  →  Next.js UI: upload → results → download
Phase 8  →  Human feedback loop improving policy
Phase 9  →  Deployed free on Railway + Vercel
Phase 10 →  Demo polish + submission
```

---

## Environment Variables Checklist

```bash
# apps/api/.env
SUPABASE_URL=
SUPABASE_ANON_KEY=
UPSTASH_REDIS_URL=
UPSTASH_REDIS_TOKEN=
CLOUDFLARE_R2_ENDPOINT=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
AI_SERVICE_URL=http://localhost:8000   # FastAPI internal URL

# services/ai/.env
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
GROQ_API_KEY=
CLOUDFLARE_R2_ENDPOINT=
R2_ACCESS_KEY_ID=
R2_SECRET_ACCESS_KEY=
R2_BUCKET_NAME=
TABPFN_TOKEN=                          # From priorlabs.ai after first login

# apps/web/.env.local
NEXT_PUBLIC_API_URL=http://localhost:3001
```

---

*Built with: Next.js · NestJS · tRPC · Turborepo · FastAPI · TabPFN v2.6 · Groq · Supabase · Upstash Redis · Cloudflare R2 · Railway · Vercel*
