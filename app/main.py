"""
FloodGuard AI -- FastAPI service.

Serves the prediction REST API (`/predict`, `/health`, `/model/info`,
`/feedback`, `/monitoring/stats`) and the static frontend
(`/`, `/predict`, `/dashboard`) from a single process, so the whole
product is one Docker image / one Render URL.
"""
from __future__ import annotations

import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from src import config
from src.inference import FloodRiskPredictor
from src.llm_advisor import generate_risk_report

from . import monitoring
from .schemas import (
    FeedbackRequest,
    HealthResponse,
    ModelInfo,
    PredictRequest,
    PredictResponse,
)

STATIC_DIR = Path(__file__).resolve().parent / "static"

predictor: FloodRiskPredictor | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global predictor
    predictor = FloodRiskPredictor()
    monitoring.init_db()
    yield


app = FastAPI(title="FloodGuard AI", version=config.MODEL_VERSION, lifespan=lifespan)


@app.get("/health", response_model=HealthResponse)
def health():
    return HealthResponse(
        status="ok",
        model_version=config.MODEL_VERSION,
        model_loaded=predictor is not None,
    )


@app.get("/model/info", response_model=ModelInfo)
def model_info():
    m = predictor.metadata
    return ModelInfo(
        version=m["version"],
        trained_at=m["trained_at"],
        n_features=m["n_features"],
        n_rows=m["n_rows"],
        n_folds=m["n_folds"],
        metrics=m["metrics"],
        top_features=m["top_features"],
        categorical_options=m["categorical_options"],
        district_defaults=m["district_defaults"],
        advanced_field_global_defaults=m["advanced_field_global_defaults"],
    )


@app.post("/predict", response_model=PredictResponse)
def predict(req: PredictRequest):
    if predictor is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    t0 = time.time()
    record = req.model_dump(exclude={"include_ai_report"})

    try:
        prediction = predictor.predict(record)
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"Prediction failed: {exc}") from exc

    contributions = predictor.feature_contributions(record)

    ai_report = None
    if req.include_ai_report:
        ai_report = generate_risk_report(record, prediction, contributions)

    latency_ms = (time.time() - t0) * 1000
    prediction_id = monitoring.log_prediction(record, prediction, latency_ms)

    return PredictResponse(
        **prediction,
        top_factors=contributions,
        ai_report=ai_report,
        prediction_id=prediction_id,
        latency_ms=round(latency_ms, 2),
    )


@app.post("/feedback")
def feedback(req: FeedbackRequest):
    monitoring.log_feedback(req.prediction_id, req.actual_flood_occurred, req.user_rating, req.comment)
    return {"status": "ok"}


@app.get("/monitoring/stats")
def monitoring_stats():
    return monitoring.get_stats()


# ── Static frontend ──────────────────────────────────────────────────────
app.mount("/static", StaticFiles(directory=str(STATIC_DIR)), name="static")


@app.get("/")
def home():
    return FileResponse(str(STATIC_DIR / "home.html"))


@app.get("/predict", response_class=FileResponse, include_in_schema=False)
def predict_page():
    return FileResponse(str(STATIC_DIR / "index.html"))


@app.get("/dashboard")
def dashboard():
    return FileResponse(str(STATIC_DIR / "dashboard.html"))
