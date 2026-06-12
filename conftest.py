from pathlib import Path

import pytest


@pytest.fixture
def sample_record() -> dict:
    """A realistic, fully-populated record using real category values
    from train.csv (Colombo, near a river, moderate rainfall)."""
    return {
        "latitude": 6.9271, "longitude": 79.8612, "elevation_m": 5.0,
        "distance_to_river_m": 300.0, "population_density_per_km2": 3000.0,
        "built_up_percent": 50.0, "rainfall_7d_mm": 100.0, "monthly_rainfall_mm": 250.0,
        "drainage_index": 0.5, "ndvi": 0.3, "ndwi": 0.1, "historical_flood_count": 1.0,
        "infrastructure_score": 60.0, "nearest_hospital_km": 5.0, "nearest_evac_km": 4.0,
        "district": "Colombo", "landcover": "Urban", "soil_type": "Clay",
        "water_supply": "Municipal", "electricity": "Grid", "road_quality": "Good (paved)",
        "urban_rural": "Urban", "water_presence_flag": "Likely",
    }


@pytest.fixture(autouse=True, scope="session")
def _clean_monitoring_db():
    from app import monitoring

    paths = [Path(str(monitoring.DB_PATH) + ext) for ext in ("", "-wal", "-shm")]
    for p in paths:
        if p.exists():
            p.unlink()
    yield
    for p in paths:
        if p.exists():
            p.unlink()
