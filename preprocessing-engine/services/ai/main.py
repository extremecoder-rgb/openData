from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from dotenv import load_dotenv
from contextlib import asynccontextmanager
import logging
from app.meta_features import extract_meta_features
from app.storage_client import download_csv_from_storage
from app.supabase_client import get_supabase_client, update_dataset_status, save_audit_log
from app.leakage_guard import check_data_leakage

load_dotenv()

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Warm up TabPFN model on startup to avoid cold start."""
    try:
        from tabpfn import TabPFNClassifier
        from tabpfn.constants import ModelVersion

        logger.info("Warming up TabPFN model...")
        TabPFNClassifier.create_default_for_version(ModelVersion.V2_6)
        logger.info("TabPFN model ready")
    except Exception as e:
        logger.warning(f"TabPFN warm-up failed (will load on first request): {e}")

    yield


app = FastAPI(title="Preprocessing Engine AI Service", version="0.1.0", lifespan=lifespan)


class ProfileRequest(BaseModel):
    r2_key: str
    filename: str
    dataset_id: str


class PreprocessRequest(BaseModel):
    r2_key: str
    filename: str
    target_column: str
    dataset_id: str


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.get("/")
async def root():
    return {"message": "AI Preprocessing Engine - AI Service"}


@app.post("/profile")
async def profile(req: ProfileRequest):
    supabase = get_supabase_client()
    dataset_id = req.dataset_id
    try:
        update_dataset_status(supabase, dataset_id, "profiling")

        df = download_csv_from_storage(req.r2_key)
        profile = extract_meta_features(df)

        dataset_meta = profile.get("__dataset__", {})
        update_dataset_status(
            supabase,
            dataset_id,
            "done",
            row_count=dataset_meta.get("row_count"),
            column_count=dataset_meta.get("col_count"),
        )

        return profile
    except Exception as e:
        try:
            update_dataset_status(supabase, dataset_id, "failed")
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/preprocess")
async def preprocess(req: PreprocessRequest):
    try:
        supabase = get_supabase_client()
        dataset_id = req.dataset_id

        df = download_csv_from_storage(req.r2_key)
        meta_features = extract_meta_features(df)

        from app.rl_agent.policy import select_action
        from app.rl_agent.environment import PreprocessingEnv

        env = PreprocessingEnv(df.copy(), meta_features, req.target_column)
        original_columns = list(df.columns)

        for col in original_columns:
            if col == req.target_column:
                continue
            if col not in env.current_df.columns:
                continue

            actions = select_action(meta_features, col)
            for action in actions:
                try:
                    reward, entry = env.step(col, action)
                    save_audit_log(supabase, dataset_id, entry)
                except Exception as step_err:
                    logger.warning(f"Action {action} on column {col} failed: {step_err}")
                    continue

        leakage_report = check_data_leakage(
            df, env.action_history, req.target_column
        )

        from app.storage_client import upload_csv_to_storage
        clean_key = req.r2_key.replace(".csv", "_clean.csv")
        upload_csv_to_storage(env.current_df, clean_key)

        update_dataset_status(
            supabase,
            dataset_id,
            "done",
            row_count=meta_features.get("__dataset__", {}).get("row_count"),
            column_count=meta_features.get("__dataset__", {}).get("col_count"),
            leakage_report=leakage_report,
        )

        return {
            "dataset_id": dataset_id,
            "action_history": env.action_history,
            "meta_features": meta_features,
            "leakage_report": leakage_report,
        }
    except Exception as e:
        try:
            supabase = get_supabase_client()
            update_dataset_status(supabase, req.dataset_id, "failed")
        except Exception:
            pass
        raise HTTPException(status_code=500, detail=str(e))


class LearnRequest(BaseModel):
    audit_log_id: str
    original_strategy: str
    corrected_strategy: str


@app.post("/learn")
async def learn(req: LearnRequest):
    try:
        import os
        import json

        corrections_dir = os.path.join(os.path.dirname(__file__), "data")
        os.makedirs(corrections_dir, exist_ok=True)
        corrections_file = os.path.join(corrections_dir, "corrections.jsonl")

        correction_entry = {
            "audit_log_id": req.audit_log_id,
            "original_strategy": req.original_strategy,
            "corrected_strategy": req.corrected_strategy,
        }

        with open(corrections_file, "a") as f:
            f.write(json.dumps(correction_entry) + "\n")

        logger.info(f"Learned correction recorded: audit_log={req.audit_log_id}")

        try:
            from app.rl_agent.policy_trainer import train_policy_from_corrections
            train_policy_from_corrections()
        except Exception as trainer_err:
            logger.warning(f"Failed to run policy trainer: {trainer_err}")

        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))