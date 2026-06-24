from src import config
from src.inference import ALL_INPUT_COLS, FloodRiskPredictor


def test_predictor_loads_and_predicts(sample_record):
    predictor = FloodRiskPredictor()
    result = predictor.predict(sample_record)

    assert 0.0 <= result["flood_risk_score"] <= 1.0
    assert result["risk_category"] in {"Low", "Moderate", "High", "Severe"}
    assert set(result["base_model_scores"].keys()) == {"lgb", "xgb", "cat", "catrmse"}
    assert result["model_version"] == config.MODEL_VERSION


def test_predict_with_only_required_fields(sample_record):
    """Optional qmap / advanced-index / current-event fields are absent."""
    predictor = FloodRiskPredictor()
    minimal = {k: v for k, v in sample_record.items() if k in ALL_INPUT_COLS}
    assert "seasonal_index" not in minimal

    result = predictor.predict(minimal)
    assert 0.0 <= result["flood_risk_score"] <= 1.0


def test_prediction_is_sensitive_to_inputs(sample_record):
    """Two materially different records must not produce an identical
    (or out-of-range) score -- a basic check that inputs actually flow
    through the feature pipeline and ensemble."""
    predictor = FloodRiskPredictor()
    calm = dict(sample_record)
    calm.update(
        distance_to_river_m=5000, rainfall_7d_mm=10, monthly_rainfall_mm=50,
        drainage_index=1.5, historical_flood_count=0, elevation_m=200,
    )
    severe = dict(sample_record)
    severe.update(
        distance_to_river_m=20, rainfall_7d_mm=300, monthly_rainfall_mm=600,
        drainage_index=0.05, historical_flood_count=8, elevation_m=2,
    )

    calm_score = predictor.predict(calm)["flood_risk_score"]
    severe_score = predictor.predict(severe)["flood_risk_score"]
    assert 0.0 <= calm_score <= 1.0
    assert 0.0 <= severe_score <= 1.0
    assert calm_score != severe_score


def test_feature_contributions(sample_record):
    predictor = FloodRiskPredictor()
    contributions = predictor.feature_contributions(sample_record, top_n=5)

    assert len(contributions) == 5
    for c in contributions:
        assert {"feature", "importance", "value"} <= c.keys()
