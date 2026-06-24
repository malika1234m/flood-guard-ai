"""
SMS alert system: subscriber storage (SQLite) and Twilio dispatch.

Environment variables required for sending:
  TWILIO_ACCOUNT_SID
  TWILIO_AUTH_TOKEN
  TWILIO_FROM_NUMBER   (e.g. +14155552671)

Without these the subscribe/unsubscribe endpoints still work; only
the /notifications/send endpoint will return an error.
"""
from __future__ import annotations

import json
import os
import sqlite3
import time
from pathlib import Path
from typing import Optional

DB_PATH = Path(__file__).resolve().parent.parent / "monitoring.db"

_SCHEMA = """
CREATE TABLE IF NOT EXISTS subscribers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    phone TEXT NOT NULL UNIQUE,
    districts TEXT NOT NULL DEFAULT '[]',
    created_at REAL NOT NULL,
    last_notified_at REAL
);
"""

# Don't re-alert the same subscriber for the same district within this window.
COOLDOWN_SECONDS = 6 * 3600


def _conn() -> sqlite3.Connection:
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL")
    return conn


def init_subscribers_table() -> None:
    with _conn() as conn:
        conn.executescript(_SCHEMA)


# ── Subscriber CRUD ───────────────────────────────────────────────────────────

def subscribe(name: str, phone: str, districts: list[str]) -> dict:
    """Insert or replace subscriber. Returns the stored record."""
    with _conn() as conn:
        conn.execute(
            """INSERT INTO subscribers (name, phone, districts, created_at)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(phone) DO UPDATE SET
                 name=excluded.name,
                 districts=excluded.districts""",
            (name, phone, json.dumps(districts), time.time()),
        )
        row = conn.execute(
            "SELECT id, name, phone, districts, created_at FROM subscribers WHERE phone=?",
            (phone,),
        ).fetchone()
    return {
        "id": row[0], "name": row[1], "phone": row[2],
        "districts": json.loads(row[3]), "created_at": row[4],
    }


def unsubscribe(phone: str) -> bool:
    """Remove subscriber by phone. Returns True if a row was deleted."""
    with _conn() as conn:
        cur = conn.execute("DELETE FROM subscribers WHERE phone=?", (phone,))
        return cur.rowcount > 0


def list_subscribers() -> list[dict]:
    with _conn() as conn:
        rows = conn.execute(
            "SELECT id, name, phone, districts, created_at, last_notified_at FROM subscribers"
        ).fetchall()
    return [
        {
            "id": r[0], "name": r[1], "phone": r[2],
            "districts": json.loads(r[3]), "created_at": r[4],
            "last_notified_at": r[5],
        }
        for r in rows
    ]


def _mark_notified(phone: str) -> None:
    with _conn() as conn:
        conn.execute(
            "UPDATE subscribers SET last_notified_at=? WHERE phone=?",
            (time.time(), phone),
        )


# ── Twilio dispatch ────────────────────────────────────────────────────────────

def _twilio_client():
    try:
        from twilio.rest import Client
    except ImportError as exc:
        raise RuntimeError("twilio package not installed — run: pip install twilio") from exc

    sid = os.environ.get("TWILIO_ACCOUNT_SID")
    token = os.environ.get("TWILIO_AUTH_TOKEN")
    if not sid or not token:
        raise RuntimeError(
            "TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN environment variables are required"
        )
    return Client(sid, token)


def _from_number() -> str:
    n = os.environ.get("TWILIO_FROM_NUMBER")
    if not n:
        raise RuntimeError("TWILIO_FROM_NUMBER environment variable is required")
    return n


def send_alerts(alerts: list[dict]) -> dict:
    """
    Match active alerts against subscribers and send SMS for any district overlap.
    Respects per-subscriber cooldown so repeat alerts aren't spammed.

    `alerts` is a list of FloodAlert dicts from _compute_live_risks().
    Returns a summary dict with sent/skipped counts.
    """
    if not alerts:
        return {"sent": 0, "skipped": 0, "errors": [], "detail": "No active alerts"}

    alert_by_district = {a["district"]: a for a in alerts}
    subscribers = list_subscribers()

    client = _twilio_client()
    from_num = _from_number()
    now = time.time()

    sent = 0
    skipped = 0
    errors: list[str] = []

    for sub in subscribers:
        # Check cooldown
        last = sub["last_notified_at"]
        if last is not None and (now - last) < COOLDOWN_SECONDS:
            skipped += 1
            continue

        # Which of their districts have active alerts?
        matching = [alert_by_district[d] for d in sub["districts"] if d in alert_by_district]
        if not matching:
            skipped += 1
            continue

        # Build one SMS per subscriber (up to 3 alerts listed)
        lines = [f"FloodGuard Alert for {sub['name']}:"]
        for alert in matching[:3]:
            lines.append(
                f"[{alert['severity'].upper()}] {alert['district']}: {alert['message']}"
            )
        if len(matching) > 3:
            lines.append(f"...and {len(matching) - 3} more district(s) at risk.")
        lines.append("Reply STOP to unsubscribe.")
        body = "\n".join(lines)

        try:
            client.messages.create(to=sub["phone"], from_=from_num, body=body)
            _mark_notified(sub["phone"])
            sent += 1
        except Exception as exc:
            errors.append(f"{sub['phone']}: {exc}")

    return {"sent": sent, "skipped": skipped, "errors": errors}
