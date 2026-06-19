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
_CACHE_TTL = 1800       # 30 minutes for live weather
_FORECAST_CACHE_TTL = 3600  # 1 hour for 10-day forecasts

_cache: dict[str, dict[str, float | None]] = {}
_cache_time: float = 0.0

_forecast_cache: dict[str, list[dict]] = {}
_forecast_cache_time: float = 0.0


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


def _fetch_forecast_days(lat: float, lon: float) -> list[dict]:
    """Fetch 10-day daily rainfall forecast from Open-Meteo."""
    try:
        r = httpx.get(
            _OPEN_METEO,
            params={
                "latitude": round(lat, 4),
                "longitude": round(lon, 4),
                "daily": "precipitation_sum",
                "forecast_days": 10,
                "timezone": "Asia/Colombo",
            },
            timeout=10,
        )
        data = r.json()
        dates = data.get("daily", {}).get("time", []) or []
        precip = data.get("daily", {}).get("precipitation_sum", []) or []

        days: list[dict] = []
        running: list[float] = []
        for i, (date, mm) in enumerate(zip(dates, precip)):
            mm = float(mm or 0.0)
            running.append(mm)
            cum7 = round(sum(running[max(0, i - 6) : i + 1]), 1)
            days.append({"date": date, "day_index": i, "rainfall_mm": round(mm, 1), "cumulative_7d_mm": cum7})
        return days
    except Exception:
        return []


def get_all_forecast_weather(district_profiles: dict[str, Any]) -> dict[str, list[dict]]:
    """Return cached 10-day rainfall forecasts for all districts (refreshes every hour)."""
    global _forecast_cache, _forecast_cache_time

    now = time.time()
    if _forecast_cache and (now - _forecast_cache_time) < _FORECAST_CACHE_TTL:
        return _forecast_cache

    results: dict[str, list[dict]] = {}
    with ThreadPoolExecutor(max_workers=12) as pool:
        futures = {
            pool.submit(_fetch_forecast_days, float(p["latitude"]), float(p["longitude"])): d
            for d, p in district_profiles.items()
        }
        for future in as_completed(futures):
            results[futures[future]] = future.result()

    _forecast_cache = results
    _forecast_cache_time = now
    return results


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
