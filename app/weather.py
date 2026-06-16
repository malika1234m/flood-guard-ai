"""
Open-Meteo rainfall fetcher with a 30-minute in-memory cache.

Fetches the last 7 days of precipitation for every district in parallel
using httpx. Falls back to None on timeout/error so the caller can
gracefully degrade to typical-profile values.
"""
from __future__ import annotations

import time
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

import httpx

_OPEN_METEO = "https://api.open-meteo.com/v1/forecast"
_CACHE_TTL = 1800  # 30 minutes

_cache: dict[str, dict[str, float | None]] = {}
_cache_time: float = 0.0


def _fetch_one(lat: float, lon: float) -> dict[str, float | None]:
    try:
        r = httpx.get(
            _OPEN_METEO,
            params={
                "latitude": round(lat, 4),
                "longitude": round(lon, 4),
                "daily": "precipitation_sum",
                "current": "precipitation",
                "past_days": 7,
                "forecast_days": 0,
                "timezone": "Asia/Colombo",
            },
            timeout=8,
        )
        data = r.json()
        daily = data.get("daily", {}).get("precipitation_sum", []) or []
        last7 = [v for v in daily if v is not None]
        rainfall_7d = round(sum(last7), 1) if last7 else None
        current_mm = (data.get("current") or {}).get("precipitation", 0.0) or 0.0
        return {"rainfall_7d_mm": rainfall_7d, "current_mm": round(current_mm, 2)}
    except Exception:
        return {"rainfall_7d_mm": None, "current_mm": None}


def get_all_weather(
    district_profiles: dict[str, Any],
) -> dict[str, dict[str, float | None]]:
    """Return cached weather data for all districts (refreshes every 30 min)."""
    global _cache, _cache_time

    now = time.time()
    if _cache and (now - _cache_time) < _CACHE_TTL:
        return _cache

    results: dict[str, dict[str, float | None]] = {}
    with ThreadPoolExecutor(max_workers=12) as pool:
        futures = {
            pool.submit(
                _fetch_one,
                float(profile["latitude"]),
                float(profile["longitude"]),
            ): district
            for district, profile in district_profiles.items()
        }
        for future in as_completed(futures):
            results[futures[future]] = future.result()

    _cache = results
    _cache_time = now
    return results
