from fastapi.testclient import TestClient

from app.main import app


def test_health():
    with TestClient(app) as client:
        res = client.get("/health")
        assert res.status_code == 200
        body = res.json()
        assert body["status"] == "ok"
        assert body["model_loaded"] is True


def test_model_info():
    with TestClient(app) as client:
        res = client.get("/model/info")
        assert res.status_code == 200
        body = res.json()
        assert body["n_features"] == 223
        assert "district" in body["categorical_options"]
        assert "Colombo" in body["district_defaults"]


def test_predict_golden_path(sample_record):
    with TestClient(app) as client:
        res = client.post("/predict", json=sample_record)
        assert res.status_code == 200
        body = res.json()

        assert 0.0 <= body["flood_risk_score"] <= 1.0
        assert body["risk_category"] in {"Low", "Moderate", "High", "Severe"}
        assert len(body["top_factors"]) == 8
        assert body["ai_report"]["source"] in {"template", "llm"}
        assert body["ai_report"]["recommendations"]
        pred_id = body["prediction_id"]

        fb = client.post("/feedback", json={"prediction_id": pred_id, "user_rating": 4, "comment": "ok"})
        assert fb.status_code == 200

        stats = client.get("/monitoring/stats")
        assert stats.status_code == 200
        stats_body = stats.json()
        assert stats_body["total_predictions"] >= 1
        assert stats_body["feedback_count"] >= 1


def test_predict_without_ai_report(sample_record):
    payload = dict(sample_record, include_ai_report=False)
    with TestClient(app) as client:
        res = client.post("/predict", json=payload)
        assert res.status_code == 200
        body = res.json()
        assert body["ai_report"] is None


def test_predict_missing_required_field_returns_422(sample_record):
    payload = dict(sample_record)
    del payload["latitude"]
    with TestClient(app) as client:
        res = client.post("/predict", json=payload)
        assert res.status_code == 422
