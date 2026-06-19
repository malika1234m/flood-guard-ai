"""
FloodGuard AI -- FastAPI service.

Serves the prediction REST API (`/predict`, `/health`, `/model/info`,
`/feedback`, `/monitoring/stats`) and the React frontend
(`frontend/dist`) from a single process, so the whole product is one
Docker image / one Render URL.
"""
from __future__ import annotations

import time
from contextlib import asynccontextmanager
from pathlib import Path

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from src import config
from src.inference import FloodRiskPredictor
from src.llm_advisor import generate_risk_report

from . import monitoring
from .schemas import (
    BatchPredictRequest,
    BatchPredictResponse,
    DistrictForecast,
    DistrictRisk,
    EmergencyPriorityItem,
    FeedbackRequest,
    FloodAlert,
    ForecastDay,
    HealthResponse,
    LiveDistrictRisk,
    ModelInfo,
    PredictRequest,
    PredictResponse,
    ReadinessCheck,
    ReadinessResponse,
)

FRONTEND_DIST = config.ROOT_DIR / "frontend" / "dist"

predictor: FloodRiskPredictor | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global predictor
    predictor = FloodRiskPredictor()
    monitoring.init_db()
    yield


app = FastAPI(title="FloodGuard AI", version=config.MODEL_VERSION, lifespan=lifespan)

# Allow the Vite dev server to call this API directly during development.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_methods=["*"],
    allow_headers=["*"],
)


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
        district_profiles=predictor.district_profiles,
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


@app.get("/district-risks", response_model=list[DistrictRisk])
def district_risks():
    """Score every district using its typical profile values — used by the map UI."""
    if predictor is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    results = []
    for district, profile in predictor.district_profiles.items():
        record = {**profile, "district": district}
        try:
            pred = predictor.predict(record)
            results.append(DistrictRisk(
                district=district,
                score=pred["flood_risk_score"],
                category=pred["risk_category"],
            ))
        except Exception:
            pass
    return sorted(results, key=lambda r: r.district)


def _compute_live_risks() -> list[LiveDistrictRisk]:
    """Core logic shared by /live-risks and /alerts."""
    from .weather import get_all_weather

    if predictor is None:
        raise HTTPException(status_code=503, detail="Model not loaded")

    weather = get_all_weather(predictor.district_profiles)
    results: list[LiveDistrictRisk] = []

    for district, profile in predictor.district_profiles.items():
        w = weather.get(district, {})
        live_7d = w.get("rainfall_7d_mm")
        typical_7d = float(profile.get("rainfall_7d_mm") or 0)

        # Build live record — only override rainfall if we got real data
        live_record = {**profile, "district": district}
        weather_live = live_7d is not None
        if weather_live:
            live_record["rainfall_7d_mm"] = live_7d
            typical_monthly = float(profile.get("monthly_rainfall_mm") or 0)
            if typical_7d > 0:
                live_record["monthly_rainfall_mm"] = typical_monthly * (live_7d / typical_7d)

        typical_record = {**profile, "district": district}

        try:
            lp = predictor.predict(live_record)
            tp = predictor.predict(typical_record)

            ls = lp["flood_risk_score"]
            ts = tp["flood_risk_score"]
            delta = round(ls - ts, 4)

            # Trend: did live rainfall push us into a worse category?
            CAT_RANK = {"Low": 0, "Moderate": 1, "High": 2, "Severe": 3}
            live_rank = CAT_RANK.get(lp["risk_category"], 0)
            typ_rank = CAT_RANK.get(tp["risk_category"], 0)
            if live_rank > typ_rank:
                trend = "Worsening"
            elif live_rank < typ_rank:
                trend = "Improving"
            else:
                trend = "Stable"

            results.append(LiveDistrictRisk(
                district=district,
                live_score=round(ls, 4),
                typical_score=round(ts, 4),
                live_category=lp["risk_category"],
                typical_category=tp["risk_category"],
                rainfall_7d_mm=round(live_7d if weather_live else typical_7d, 1),
                typical_rainfall_7d_mm=round(typical_7d, 1),
                trend=trend,
                trend_delta=delta,
                weather_live=weather_live,
            ))
        except Exception:
            pass

    return sorted(results, key=lambda r: r.live_score, reverse=True)


@app.get("/live-risks", response_model=list[LiveDistrictRisk])
def live_risks():
    """Score all districts with real-time rainfall data from Open-Meteo."""
    return _compute_live_risks()


@app.get("/alerts", response_model=list[FloodAlert])
def get_alerts():
    """Return active flood alerts for districts above risk thresholds."""
    live = _compute_live_risks()
    alert_list: list[FloodAlert] = []

    for r in live:
        # Alert logic: trust the ML model's own category — no invented thresholds.
        # Rule 1: model says Severe or High based on real rainfall → always alert.
        # Rule 2: live rainfall pushed category higher than typical baseline → alert.
        if r.live_category == "Severe":
            severity = "Severe"
        elif r.live_category == "High" and (r.trend == "Worsening" or r.typical_category in ("Low", "Moderate")):
            # High AND either got worse vs baseline, or baseline was lower (real uplift)
            severity = "High"
        elif r.trend == "Worsening" and r.live_category == "Moderate":
            # Rainfall pushed a typically-lower district into Moderate
            severity = "Moderate"
        else:
            continue

        rain_note = f" {r.rainfall_7d_mm:.0f} mm recorded this week." if r.rainfall_7d_mm > 0 else ""
        category_change = r.live_category != r.typical_category
        change_note = (f" Rainfall has elevated this district from {r.typical_category} to {r.live_category} risk."
                       if category_change else "")

        if severity == "Severe":
            msg = (f"Extreme flood risk in {r.district}.{rain_note}"
                   f"{change_note} Evacuate low-lying areas and follow official advisories.")
        elif severity == "High":
            msg = (f"High flood risk in {r.district}.{rain_note}"
                   f"{change_note} Monitor water levels and keep emergency contacts ready.")
        else:
            msg = (f"Elevated flood risk in {r.district}.{rain_note}"
                   f"{change_note} Stay informed and avoid flood-prone zones.")

        alert_list.append(FloodAlert(
            district=r.district,
            severity=severity,
            live_score=r.live_score,
            typical_score=r.typical_score,
            trend=r.trend,
            trend_delta=r.trend_delta,
            rainfall_7d_mm=r.rainfall_7d_mm,
            message=msg,
        ))

    return alert_list


@app.post("/predict/batch", response_model=BatchPredictResponse)
def predict_batch(req: BatchPredictRequest):
    if predictor is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    if not req.records:
        raise HTTPException(status_code=400, detail="No records provided")
    if len(req.records) > 100:
        raise HTTPException(status_code=400, detail="Batch size limited to 100 records")

    results = []
    for r in req.records:
        record = r.model_dump(exclude={"include_ai_report"})
        try:
            prediction = predictor.predict(record)
            contributions = predictor.feature_contributions(record)
            ai_report = None
            if req.include_ai_report:
                from src.llm_advisor import generate_risk_report
                ai_report = generate_risk_report(record, prediction, contributions)
            prediction_id = monitoring.log_prediction(record, prediction, 0.0)
            results.append(PredictResponse(
                **prediction,
                top_factors=contributions,
                ai_report=ai_report,
                prediction_id=prediction_id,
                latency_ms=0.0,
            ))
        except Exception as exc:
            raise HTTPException(status_code=400, detail=f"Prediction failed for record: {exc}") from exc

    scores = [r.flood_risk_score for r in results]
    return BatchPredictResponse(results=results, total=len(results), avg_score=round(sum(scores) / len(scores), 4))


@app.get("/forecast/{district}", response_model=DistrictForecast)
def district_forecast(district: str):
    if predictor is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    profile = predictor.district_profiles.get(district)
    if not profile:
        raise HTTPException(status_code=404, detail=f"District '{district}' not found")

    from .weather import _fetch_forecast_days
    daily = _fetch_forecast_days(float(profile["latitude"]), float(profile["longitude"]))
    if not daily:
        raise HTTPException(status_code=503, detail="Weather forecast unavailable")

    # Compute typical baseline score
    typical_record = {**profile, "district": district}
    typical_pred = predictor.predict(typical_record)
    typical_score = typical_pred["flood_risk_score"]
    typical_rainfall = float(profile.get("rainfall_7d_mm") or 0)

    forecast_days: list[ForecastDay] = []
    for day in daily:
        record = {**profile, "district": district}
        record["rainfall_7d_mm"] = day["cumulative_7d_mm"]
        if typical_rainfall > 0:
            record["monthly_rainfall_mm"] = float(profile.get("monthly_rainfall_mm") or 0) * (day["cumulative_7d_mm"] / typical_rainfall)
        pred = predictor.predict(record)
        forecast_days.append(ForecastDay(
            date=day["date"],
            day_index=day["day_index"],
            rainfall_mm=day["rainfall_mm"],
            cumulative_7d_mm=day["cumulative_7d_mm"],
            flood_risk_score=round(pred["flood_risk_score"], 4),
            risk_category=pred["risk_category"],
        ))

    scores = [d.flood_risk_score for d in forecast_days]
    peak_idx = max(range(len(scores)), key=lambda i: scores[i])
    avg = round(sum(scores) / len(scores), 4)
    trend = ("Worsening" if scores[-1] > scores[0] + 0.02
             else "Improving" if scores[-1] < scores[0] - 0.02
             else "Stable")

    return DistrictForecast(
        district=district,
        forecast_days=forecast_days,
        peak_risk_day=peak_idx,
        peak_risk_score=scores[peak_idx],
        avg_risk_score=avg,
        trend=trend,
        typical_score=round(typical_score, 4),
    )


@app.get("/forecast", response_model=list[DistrictForecast])
def all_district_forecasts():
    """10-day forecast for every district (cached 1 hour)."""
    if predictor is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    from .weather import get_all_forecast_weather
    weather_data = get_all_forecast_weather(predictor.district_profiles)
    forecasts = []
    for district, profile in predictor.district_profiles.items():
        daily = weather_data.get(district, [])
        if not daily:
            continue
        typical_record = {**profile, "district": district}
        typical_pred = predictor.predict(typical_record)
        typical_score = typical_pred["flood_risk_score"]
        typical_rainfall = float(profile.get("rainfall_7d_mm") or 0)

        forecast_days = []
        for day in daily:
            record = {**profile, "district": district}
            record["rainfall_7d_mm"] = day["cumulative_7d_mm"]
            if typical_rainfall > 0:
                record["monthly_rainfall_mm"] = float(profile.get("monthly_rainfall_mm") or 0) * (day["cumulative_7d_mm"] / typical_rainfall)
            pred = predictor.predict(record)
            forecast_days.append(ForecastDay(
                date=day["date"],
                day_index=day["day_index"],
                rainfall_mm=day["rainfall_mm"],
                cumulative_7d_mm=day["cumulative_7d_mm"],
                flood_risk_score=round(pred["flood_risk_score"], 4),
                risk_category=pred["risk_category"],
            ))

        scores = [d.flood_risk_score for d in forecast_days]
        peak_idx = max(range(len(scores)), key=lambda i: scores[i])
        avg = round(sum(scores) / len(scores), 4)
        trend = ("Worsening" if scores[-1] > scores[0] + 0.02
                 else "Improving" if scores[-1] < scores[0] - 0.02
                 else "Stable")
        forecasts.append(DistrictForecast(
            district=district,
            forecast_days=forecast_days,
            peak_risk_day=peak_idx,
            peak_risk_score=scores[peak_idx],
            avg_risk_score=avg,
            trend=trend,
            typical_score=round(typical_score, 4),
        ))
    return sorted(forecasts, key=lambda f: f.peak_risk_score, reverse=True)


@app.get("/emergency-priority", response_model=list[EmergencyPriorityItem])
def emergency_priority():
    """Districts ranked by composite emergency priority score."""
    if predictor is None:
        raise HTTPException(status_code=503, detail="Model not loaded")
    import math

    items = []
    for district, profile in predictor.district_profiles.items():
        record = {**profile, "district": district}
        try:
            pred = predictor.predict(record)
        except Exception:
            continue
        items.append({
            "district": district,
            "flood_risk_score": pred["flood_risk_score"],
            "risk_category": pred["risk_category"],
            "population_density": float(profile.get("population_density_per_km2") or 0),
            "evac_km": float(profile.get("nearest_evac_km") or 0),
            "flood_history": float(profile.get("historical_flood_count") or 0),
            "infra_score": float(profile.get("infrastructure_score") or 0.5),
        })

    def norm(values: list[float], higher_worse: bool = True) -> list[float]:
        mn, mx = min(values), max(values)
        if mx == mn:
            return [0.5] * len(values)
        raw = [(v - mn) / (mx - mn) for v in values]
        return raw if higher_worse else [1 - v for v in raw]

    populations = norm([i["population_density"] for i in items])
    evac_gaps   = norm([i["evac_km"] for i in items])
    flood_hists = norm([i["flood_history"] for i in items])
    infra_weak  = norm([i["infra_score"] for i in items], higher_worse=False)

    results = []
    for idx, item in enumerate(items):
        p_pop  = round(populations[idx], 4)
        p_evac = round(evac_gaps[idx], 4)
        p_hist = round(flood_hists[idx], 4)
        p_infra = round(infra_weak[idx], 4)
        risk   = item["flood_risk_score"]

        priority = round(0.40 * risk + 0.25 * p_pop + 0.20 * p_evac + 0.10 * p_hist + 0.05 * p_infra, 4)

        cat = item["risk_category"]
        reasons = []
        if risk > 0.65: reasons.append("Severe/High flood risk score")
        elif risk > 0.45: reasons.append("Moderate-to-high flood risk score")
        if p_pop > 0.7: reasons.append("High population density")
        if p_evac > 0.7: reasons.append("Limited evacuation access")
        if p_hist > 0.7: reasons.append("Frequent historical flooding")
        if p_infra > 0.7: reasons.append("Weak infrastructure")
        if not reasons:
            reasons.append("Cumulative moderate risk factors")

        if priority > 0.65:
            action = "Deploy emergency response teams immediately"
        elif priority > 0.50:
            action = "Issue public flood warning and pre-position resources"
        elif priority > 0.38:
            action = "Monitor closely and prepare evacuation routes"
        else:
            action = "Maintain standard preparedness"

        results.append(EmergencyPriorityItem(
            rank=0,
            district=item["district"],
            priority_score=priority,
            flood_risk_score=round(risk, 4),
            risk_category=cat,
            population_score=p_pop,
            evacuation_gap_score=p_evac,
            flood_history_score=p_hist,
            infrastructure_weakness_score=p_infra,
            recommended_action=action,
            reasons=reasons,
        ))

    results.sort(key=lambda x: x.priority_score, reverse=True)
    for i, r in enumerate(results):
        r.rank = i + 1
    return results


@app.get("/readiness", response_model=ReadinessResponse)
def readiness():
    from pathlib import Path
    from src import config
    checks: list[ReadinessCheck] = []

    # 1 — model artifact on disk
    artifact_path = config.ROOT_DIR / "models" / "v1" / "lgb_models.joblib"
    checks.append(ReadinessCheck(
        name="model_artifact",
        status="ok" if artifact_path.exists() else "failed",
        detail=str(artifact_path) if not artifact_path.exists() else None,
    ))
    # 2 — model loaded in memory
    checks.append(ReadinessCheck(
        name="model_loaded",
        status="ok" if predictor is not None else "failed",
    ))
    # 3 — metadata readable
    try:
        meta_path = config.ROOT_DIR / "models" / "v1" / "metadata.json"
        import json
        json.loads(meta_path.read_text())
        checks.append(ReadinessCheck(name="metadata_json", status="ok"))
    except Exception as e:
        checks.append(ReadinessCheck(name="metadata_json", status="failed", detail=str(e)))
    # 4 — district profiles loaded
    checks.append(ReadinessCheck(
        name="district_profiles",
        status="ok" if predictor and predictor.district_profiles else "failed",
        detail=f"{len(predictor.district_profiles)} districts" if predictor and predictor.district_profiles else None,
    ))
    # 5 — monitoring db writable
    try:
        monitoring.init_db()
        checks.append(ReadinessCheck(name="monitoring_db", status="ok"))
    except Exception as e:
        checks.append(ReadinessCheck(name="monitoring_db", status="failed", detail=str(e)))

    failed = [c for c in checks if c.status == "failed"]
    overall = "down" if len(failed) >= 2 else "degraded" if failed else "ok"
    version = predictor.metadata.get("version", "unknown") if predictor else "unknown"
    return ReadinessResponse(overall=overall, checks=checks, model_version=version)


@app.post("/feedback")
def feedback(req: FeedbackRequest):
    monitoring.log_feedback(req.prediction_id, req.actual_flood_occurred, req.user_rating, req.comment)
    return {"status": "ok"}


@app.get("/monitoring/stats")
def monitoring_stats():
    return monitoring.get_stats()


# ── React frontend (built via `npm run build` in frontend/) ──────────────
# Only mount when the build exists — skipped in CI where npm build hasn't run
if (FRONTEND_DIST / "assets").exists():
    app.mount("/assets", StaticFiles(directory=str(FRONTEND_DIST / "assets")), name="assets")


@app.get("/{full_path:path}", response_class=FileResponse, include_in_schema=False)
def spa(full_path: str):
    candidate = FRONTEND_DIST / full_path
    if full_path and candidate.is_file():
        return FileResponse(str(candidate))
    return FileResponse(str(FRONTEND_DIST / "index.html"))
