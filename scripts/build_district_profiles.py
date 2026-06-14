"""
Build `models/v1/district_profiles.json`: per-district mean/mode values for
every field a `PredictRequest` needs, plus a district centroid
(latitude/longitude). Used by the frontend to build a full prediction payload
for a user's geolocated coordinates by picking the nearest district's
typical conditions.

`data/train.csv`'s own `latitude`/`longitude` columns are synthetic and
uniform-random across Sri Lanka's bounding box for every district (no
district-discriminating signal), so they cannot be used as centroids. Real
district centroid coordinates (based on each district's capital/main town)
are hardcoded below and used instead. All other numeric/categorical fields
ARE meaningfully district-correlated in the synthetic data (e.g. hill-country
districts like Nuwara Eliya/Kandy/Badulla/Matale show elevation_m ~800m) and
are computed from `data/train.csv` as before.

Run: python scripts/build_district_profiles.py
"""
from __future__ import annotations

import json

import pandas as pd

from src import config

# Real Sri Lankan district centroids (approx. district capital/main town),
# since data/train.csv's lat/lon columns carry no district signal.
DISTRICT_CENTROIDS: dict[str, tuple[float, float]] = {
    "Ampara": (7.30, 81.68),
    "Anuradhapura": (8.31, 80.41),
    "Badulla": (6.99, 81.06),
    "Batticaloa": (7.71, 81.70),
    "Colombo": (6.93, 79.86),
    "Galle": (6.05, 80.22),
    "Gampaha": (7.09, 80.00),
    "Hambantota": (6.12, 81.12),
    "Jaffna": (9.66, 80.02),
    "Kalutara": (6.58, 80.00),
    "Kandy": (7.29, 80.63),
    "Kegalle": (7.25, 80.35),
    "Kilinochchi": (9.40, 80.40),
    "Kurunegala": (7.49, 80.36),
    "Mannar": (8.98, 79.90),
    "Matale": (7.47, 80.62),
    "Matara": (5.95, 80.54),
    "Monaragala": (6.87, 81.35),
    "Mullaitivu": (9.27, 80.81),
    "Nuwara Eliya": (6.97, 80.77),
    "Polonnaruwa": (7.94, 81.00),
    "Puttalam": (8.04, 79.84),
    "Ratnapura": (6.68, 80.40),
    "Trincomalee": (8.59, 81.20),
    "Vavuniya": (8.75, 80.50),
}

NUMERIC_FIELDS = [
    "elevation_m", "distance_to_river_m",
    "population_density_per_km2", "built_up_percent",
    "rainfall_7d_mm", "monthly_rainfall_mm", "drainage_index",
    "ndvi", "ndwi", "historical_flood_count", "infrastructure_score",
    "nearest_hospital_km", "nearest_evac_km",
    "seasonal_index", "terrain_roughness_index",
    "socioeconomic_status_index", "extreme_weather_index",
]

CATEGORICAL_FIELDS = [
    "landcover", "soil_type", "water_supply", "electricity",
    "road_quality", "urban_rural", "water_presence_flag",
]


def main() -> None:
    df = pd.read_csv(config.TRAIN_PATH)

    profiles: dict[str, dict] = {}
    for district, group in df.groupby("district"):
        profile: dict = {}
        centroid = DISTRICT_CENTROIDS.get(district)
        if centroid is not None:
            profile["latitude"], profile["longitude"] = centroid
        for col in NUMERIC_FIELDS:
            profile[col] = round(float(group[col].mean()), 4)
        for col in CATEGORICAL_FIELDS:
            profile[col] = group[col].mode().iloc[0]
        profiles[district] = profile

    out_path = config.MODEL_DIR / "district_profiles.json"
    out_path.write_text(json.dumps(profiles, indent=2, sort_keys=True))
    print(f"Wrote {len(profiles)} district profiles to {out_path}")


if __name__ == "__main__":
    main()
