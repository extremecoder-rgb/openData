# Phase 2 — Data Ingestion & Storage (Backend Only)

> Goal: User can upload a CSV via NestJS API. File stored in R2, record in Supabase, job queued in BullMQ.
> Focus: NestJS backend only. No frontend. No AI service yet.

---

## NestJS Tasks (`apps/api`)

### 1. Install Dependencies

```bash
cd apps/api
npm install @nestjs/bull bull ioredis @supabase/supabase-js @aws-sdk/client-s3 @trpc/server zod
npm install @types/multer -D
```

### 2. Create UploadModule

Create `src/upload/` module with:
- `upload.module.ts`
- `upload.controller.ts` — `POST /upload`
- `upload.service.ts` — handles R2 upload + Supabase record + BullMQ job

**POST /upload endpoint:**
- Accept multipart/form-data (use `@nestjs/platform-express` + `multer`)
- Validate: CSV only, max 50MB
- Upload raw file to Cloudflare R2 using AWS S3 SDK
- Create a `dataset` record in Supabase (status: `uploaded`)
- Push a `preprocess` job to BullMQ queue

### 3. Create DatasetModule

Create `src/dataset/` module with:
- `dataset.module.ts`
- `dataset.controller.ts`
- `dataset.service.ts`

**Endpoints:**
- `GET /datasets` — list user's datasets
- `GET /datasets/:id` — get single dataset + status
- `GET /datasets/:id/results` — get cleaned dataset + audit trail

### 4. Set Up BullMQ

Create `src/queue/` module:
- `queue.module.ts` — configures BullMQ with Upstash Redis
- `preprocess.processor.ts` — consumes jobs, calls FastAPI

**BullMQ config:**
```typescript
BullModule.forRoot({
  connection: {
    host: process.env.UPSTASH_REDIS_URL,
    port: 6379,
    tls: {},
  },
});
```

### 5. Create PreprocessQueue Producer

When job is picked up by processor:
1. Get dataset record from Supabase
2. Call FastAPI `POST /preprocess` with R2 file key + target column
3. Update dataset status to `processing`
4. On completion: update status to `done`, store results

---

## Supabase Schema

Run these in Supabase SQL editor:

```sql
-- datasets table
create table datasets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users,
  filename text not null,
  r2_key text not null,
  status text default 'uploaded',
  row_count int,
  column_count int,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- audit_logs table
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

-- user_corrections table
create table user_corrections (
  id uuid primary key default gen_random_uuid(),
  audit_log_id uuid references audit_logs,
  original_strategy text,
  corrected_strategy text,
  created_at timestamptz default now()
);
```

---

## File Structure After Phase 1

```
apps/api/src/
├── upload/
│   ├── upload.module.ts
│   ├── upload.controller.ts
│   └── upload.service.ts
├── dataset/
│   ├── dataset.module.ts
│   ├── dataset.controller.ts
│   └── dataset.service.ts
├── queue/
│   ├── queue.module.ts
│   └── preprocess.processor.ts
├── app.module.ts        (updated to import new modules)
├── app.controller.ts
├── app.service.ts
└── main.ts
```

---

## Environment Variables Needed

All placeholders already in `apps/api/.env`:
- `SUPABASE_URL` + `SUPABASE_ANON_KEY`
- `UPSTASH_REDIS_URL` + `UPSTASH_REDIS_TOKEN`
- `CLOUDFLARE_R2_ENDPOINT` + `R2_ACCESS_KEY_ID` + `R2_SECRET_ACCESS_KEY` + `R2_BUCKET_NAME`
- `AI_SERVICE_URL=http://localhost:8000`

---

## Done When

Upload a CSV via Postman/curl:
1. File appears in Cloudflare R2
2. Row created in Supabase `datasets` table
3. Job pushed to BullMQ queue
4. `GET /datasets` returns the uploaded dataset
5. `GET /datasets/:id` returns dataset with status

---

## Build Order

1. Install dependencies
2. Create UploadModule (controller + service)
3. Wire R2 upload with AWS S3 SDK
4. Wire Supabase client for dataset records
5. Set up BullMQ queue module
6. Create DatasetModule (list, get, results endpoints)
7. Create preprocess queue processor
8. Test full flow: upload CSV → R2 → Supabase → queue
