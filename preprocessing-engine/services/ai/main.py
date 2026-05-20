from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv
from app.meta_features import extract_meta_features
from app.r2_client import download_csv_from_r2
from app.supabase_client import get_supabase_client, update_dataset_status

load_dotenv()

app = FastAPI(title="Preprocessing Engine AI Service", version="0.1.0")


class ProfileRequest(BaseModel):
    r2_key: str
    filename: str


class PreprocessRequest(BaseModel):
    r2_key: str
    filename: str
    target_column: str


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/")
async def root():
    return {"message": "AI Preprocessing Engine - AI Service"}


@app.post("/profile")
async def profile(req: ProfileRequest):
    try:
        # Update status to profiling
        supabase = get_supabase_client()
        update_dataset_status(supabase, req.r2_key.split("/")[-1].split("-")[0], "profiling")

        # Download CSV from R2
        df = download_csv_from_r2(req.r2_key)

        # Extract meta-features
        profile = extract_meta_features(df)

        # Update dataset with counts
        dataset_meta = profile.get("__dataset__", {})
        update_dataset_status(
            supabase,
            req.r2_key.split("/")[-1].split("-")[0],
            "done",
            row_count=dataset_meta.get("row_count"),
            column_count=dataset_meta.get("col_count"),
        )

        return profile
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/preprocess")
async def preprocess(req: PreprocessRequest):
    try:
        # 1. Download CSV from R2
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