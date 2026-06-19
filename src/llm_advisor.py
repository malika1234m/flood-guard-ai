"""
AI Risk Advisor: turns a flood-risk prediction + its top contributing
factors into a plain-language report with recommendations.

Uses GPT-4o-mini via the `openai` SDK when `OPENAI_API_KEY` is set in
the environment. Falls back to a deterministic, rule-based template
otherwise, so `/predict` always returns a report -- the live demo never
depends on the external API being configured. (External resource use
disclosed in README per the booklet's Rule 5.)
"""
from __future__ import annotations

import json
import os

MODEL_NAME = "gpt-4o-mini"

# Human-readable names for the engineered/raw features that tend to show
# up in `top_features`, used in both the LLM prompt and the template.
FRIENDLY_NAMES = {
    "district_te": "this district's historical flood-risk level",
    "distance_to_river_m": "distance to the nearest river",
    "rainfall_7d_mm": "rainfall over the last 7 days",
    "monthly_rainfall_mm": "monthly rainfall",
    "elevation_m": "ground elevation",
    "drainage_index": "drainage capacity",
    "historical_flood_count": "number of past flood events recorded here",
    "inund_log1p": "current flood inundation extent",
    "reason_has_flood": "reported flooding-related habitability issues",
    "infrastructure_score": "infrastructure quality",
    "population_density_per_km2": "population density",
    "built_up_percent": "built-up land percentage",
    "ndvi": "vegetation cover (NDVI)",
    "ndwi": "surface water presence (NDWI)",
    "ndvi_qmap": "vegetation cover",
    "ndwi_qmap": "surface water presence",
    "extreme_x_terrain": "combined extreme-weather and terrain-roughness exposure",
    "extreme_weather_index": "extreme-weather exposure",
    "terrain_roughness_index": "terrain roughness",
    "seasonal_index": "seasonal flood-risk index",
    "socioeconomic_status_index": "socioeconomic vulnerability",
    "longitude": "geographic longitude",
    "latitude": "geographic latitude",
    "nearest_hospital_km": "distance to nearest hospital",
    "nearest_evac_km": "distance to nearest evacuation center",
}


def _friendly(name: str) -> str:
    return FRIENDLY_NAMES.get(name, name.replace("_", " "))


# ── deterministic fallback ───────────────────────────────────────────────
_INTROS = {
    "Low": "This location has a **low** flood risk (score {score:.2f}). Conditions appear generally favorable.",
    "Moderate": "This location has a **moderate** flood risk (score {score:.2f}). Some risk factors are present and worth monitoring.",
    "High": "This location has a **high** flood risk (score {score:.2f}). Several significant risk factors were identified.",
    "Severe": "This location has a **severe** flood risk (score {score:.2f}). Multiple major risk factors were identified; caution is strongly advised.",
}

_RECOMMENDATIONS = {
    "Low": [
        "Continue routine maintenance of local drainage infrastructure.",
        "Stay informed via official weather and flood advisories during monsoon season.",
        "Keep basic emergency contacts handy as a general precaution.",
    ],
    "Moderate": [
        "Monitor rainfall forecasts closely during the monsoon season.",
        "Check that local drainage channels and culverts are clear of debris.",
        "Keep an emergency kit and basic evacuation plan ready as a precaution.",
        "Avoid storing valuables in ground-level rooms if near a river or low-lying area.",
    ],
    "High": [
        "Prepare a household evacuation plan and identify the nearest evacuation center.",
        "Elevate or waterproof valuable belongings and electrical installations.",
        "Register for local flood early-warning alerts where available.",
        "Avoid new construction in low-lying or near-river areas without flood-proofing.",
    ],
    "Severe": [
        "Treat this location as a priority for flood mitigation investment.",
        "Establish and practice an evacuation plan with all residents.",
        "Engage local disaster management authorities for a site assessment.",
        "Consider structural flood defenses (embankments, elevated foundations, improved drainage).",
    ],
}


def _template_report(prediction: dict, contributions: list[dict]) -> dict:
    category = prediction["risk_category"]
    score = prediction["flood_risk_score"]

    summary = _INTROS.get(category, "Flood risk score: {score:.2f} ({category}).").format(score=score, category=category)
    drivers = [_friendly(c["feature"]) for c in contributions[:4]]
    if drivers:
        summary += " Key contributing factors include " + ", ".join(drivers) + "."

    return {
        "summary": summary,
        "recommendations": _RECOMMENDATIONS.get(category, _RECOMMENDATIONS["Moderate"]),
        "source": "template",
    }


# ── LLM-backed report ──────────────────────────────────────────────────────
def _llm_report(record: dict, prediction: dict, contributions: list[dict]) -> dict | None:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        return None

    try:
        from openai import OpenAI

        client = OpenAI(api_key=api_key)
        factors_text = "\n".join(f"- {_friendly(c['feature'])}: {c['value']}" for c in contributions)
        prompt = (
            "You are a flood-risk advisor for locations in Sri Lanka. A predictive model "
            f"estimated this location's flood risk score as {prediction['flood_risk_score']:.2f} "
            f"on a 0-1 scale (0 = no risk, 1 = extreme risk), categorized as '{prediction['risk_category']}'.\n\n"
            "Location details:\n"
            f"- District: {record.get('district')}\n"
            f"- Land cover: {record.get('landcover')}, soil type: {record.get('soil_type')}\n"
            f"- Urban/rural: {record.get('urban_rural')}\n\n"
            "Top contributing factors (model feature importance, with this location's values):\n"
            f"{factors_text}\n\n"
            "Respond with ONLY a JSON object (no markdown, no code fences) of the form "
            '{"summary": "<3-5 sentence plain-language risk summary for a resident or local '
            'authority, no model/statistics jargon>", "recommendations": ["<short actionable '
            'recommendation>", ...4 items total]}'
        )
        resp = client.chat.completions.create(
            model=MODEL_NAME,
            max_tokens=600,
            response_format={"type": "json_object"},
            messages=[{"role": "user", "content": prompt}],
        )
        text = resp.choices[0].message.content.strip()
        data = json.loads(text)
        recs = list(data["recommendations"])[:5]
        if not recs:
            return None
        return {"summary": str(data["summary"]), "recommendations": recs, "source": "llm"}
    except Exception as _exc:
        import sys
        print(f"[llm_advisor] OpenAI call failed: {_exc!r}", file=sys.stderr, flush=True)
        return None


def generate_risk_report(record: dict, prediction: dict, contributions: list[dict]) -> dict:
    return _llm_report(record, prediction, contributions) or _template_report(prediction, contributions)


if __name__ == "__main__":
    demo_prediction = {"flood_risk_score": 0.62, "risk_category": "High"}
    demo_contributions = [
        {"feature": "distance_to_river_m", "value": 120.0, "importance": 1800.0},
        {"feature": "rainfall_7d_mm", "value": 145.0, "importance": 1200.0},
        {"feature": "drainage_index", "value": 0.3, "importance": 900.0},
        {"feature": "historical_flood_count", "value": 3, "importance": 700.0},
    ]
    demo_record = {"district": "Gampaha", "landcover": "Cropland", "soil_type": "Clay", "urban_rural": "Urban"}
    report = generate_risk_report(demo_record, demo_prediction, demo_contributions)
    print(f"source: {report['source']}")
    print(f"summary: {report['summary']}")
    print("recommendations:")
    for r in report["recommendations"]:
        print(f"  - {r}")
