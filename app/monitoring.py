"""
SQLite-based monitoring: logs every prediction and piece of user
feedback, and aggregates them for `/monitoring/stats` and the
dashboard page.
"""
from __future__ import annotations

import json
import sqlite3
import time
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent / "monitoring.db"

_SCHEMA = """
CREATE TABLE IF NOT EXISTS predictions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp REAL NOT NULL,
    district TEXT,
    input_json TEXT NOT NULL,
    flood_risk_score REAL NOT NULL,
    risk_category TEXT NOT NULL,
    model_version TEXT NOT NULL,
    latency_ms REAL NOT NULL,
    ood_flag_count INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS feedback (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    prediction_id INTEGER NOT NULL,
    timestamp REAL NOT NULL,
    actual_flood_occurred INTEGER,
    user_rating INTEGER,
    comment TEXT
);
"""


def get_conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_db() -> None:
    with get_conn() as conn:
        conn.executescript(_SCHEMA)


def log_prediction(record: dict, prediction: dict, latency_ms: float) -> int:
    with get_conn() as conn:
        cur = conn.execute(
            "INSERT INTO predictions "
            "(timestamp, district, input_json, flood_risk_score, risk_category, "
            "model_version, latency_ms, ood_flag_count) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
            (
                time.time(),
                record.get("district"),
                json.dumps(record),
                prediction["flood_risk_score"],
                prediction["risk_category"],
                prediction["model_version"],
                latency_ms,
                len(prediction.get("ood_flags", [])),
            ),
        )
        return cur.lastrowid


def log_feedback(prediction_id: int, actual_flood_occurred, user_rating, comment) -> None:
    with get_conn() as conn:
        conn.execute(
            "INSERT INTO feedback "
            "(prediction_id, timestamp, actual_flood_occurred, user_rating, comment) "
            "VALUES (?, ?, ?, ?, ?)",
            (
                prediction_id,
                time.time(),
                None if actual_flood_occurred is None else int(actual_flood_occurred),
                user_rating,
                comment,
            ),
        )


def get_stats() -> dict:
    with get_conn() as conn:
        total = conn.execute("SELECT COUNT(*) FROM predictions").fetchone()[0]
        if total == 0:
            return {
                "total_predictions": 0,
                "avg_score": None,
                "avg_latency_ms": None,
                "category_counts": {},
                "district_counts": {},
                "score_histogram": [0] * 10,
                "recent": [],
                "feedback_count": 0,
                "avg_user_rating": None,
            }

        avg_score, avg_latency = conn.execute(
            "SELECT AVG(flood_risk_score), AVG(latency_ms) FROM predictions"
        ).fetchone()

        category_counts = dict(conn.execute(
            "SELECT risk_category, COUNT(*) FROM predictions GROUP BY risk_category"
        ).fetchall())

        district_counts = dict(conn.execute(
            "SELECT district, COUNT(*) FROM predictions "
            "GROUP BY district ORDER BY COUNT(*) DESC LIMIT 10"
        ).fetchall())

        bins = [0] * 10
        for (score,) in conn.execute("SELECT flood_risk_score FROM predictions"):
            idx = min(max(int(score * 10), 0), 9)
            bins[idx] += 1

        recent = [
            {
                "timestamp": ts, "district": d, "flood_risk_score": s,
                "risk_category": c, "latency_ms": lat,
            }
            for ts, d, s, c, lat in conn.execute(
                "SELECT timestamp, district, flood_risk_score, risk_category, latency_ms "
                "FROM predictions ORDER BY id DESC LIMIT 20"
            ).fetchall()
        ]

        feedback_count, avg_rating = conn.execute(
            "SELECT COUNT(*), AVG(user_rating) FROM feedback"
        ).fetchone()

        return {
            "total_predictions": total,
            "avg_score": round(avg_score, 4) if avg_score is not None else None,
            "avg_latency_ms": round(avg_latency, 2) if avg_latency is not None else None,
            "category_counts": category_counts,
            "district_counts": district_counts,
            "score_histogram": bins,
            "recent": recent,
            "feedback_count": feedback_count,
            "avg_user_rating": round(avg_rating, 2) if avg_rating is not None else None,
        }
