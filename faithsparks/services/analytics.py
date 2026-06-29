import os
import sqlite3
import time
from datetime import date, datetime, timedelta
from hashlib import sha256
from typing import Dict, List

from flask import g


_DEFAULT_PATH = os.path.abspath(
    os.environ.get(
        "ANALYTICS_DB_PATH",
        os.path.join(os.path.dirname(__file__), "..", "..", "analytics.sqlite"),
    )
)


def _is_sqlite_allowed() -> bool:
    """Check if SQLite analytics is permitted based on environment settings."""
    app_env = os.getenv("APP_ENV", "dev").lower()
    if os.getenv("USE_LOCAL_STORAGE", "").lower() in {"1", "true", "yes"}:
        return True
    return app_env not in {"prod", "production"}


def _connect() -> sqlite3.Connection:
    conn = sqlite3.connect(_DEFAULT_PATH, detect_types=sqlite3.PARSE_DECLTYPES)
    conn.row_factory = sqlite3.Row
    try:
        conn.execute("PRAGMA journal_mode=WAL;")
    except sqlite3.DatabaseError:
        pass
    conn.execute("PRAGMA busy_timeout=3000;")
    _ensure_schema(conn)
    return conn


def _ensure_schema(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS visits (
            day TEXT NOT NULL,
            anon_key TEXT NOT NULL,
            ua TEXT,
            ts INTEGER NOT NULL,
            PRIMARY KEY (day, anon_key)
        )
        """
    )
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS logins (
            day TEXT NOT NULL,
            email TEXT NOT NULL,
            ts INTEGER NOT NULL
        )
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_visits_day_ts ON visits(day, ts)
        """
    )
    conn.execute(
        """
        CREATE INDEX IF NOT EXISTS idx_logins_day_email ON logins(day, email)
        """
    )
    conn.commit()


def get_db() -> sqlite3.Connection:
    conn = getattr(g, "_analytics_db", None)
    if conn is None:
        conn = g._analytics_db = _connect()
    return conn


def close_db(_: object = None) -> None:
    conn = getattr(g, "_analytics_db", None)
    if conn is not None:
        conn.close()
        g._analytics_db = None


def _hash_key(ip: str, ua: str, day: str) -> str:
    normalized_ip = ip.strip() or "0.0.0.0"
    ua_fragment = (ua or "")[:48]
    token = f"{normalized_ip}-{ua_fragment}-{day}".encode("utf-8", "ignore")
    return sha256(token).hexdigest()[:16]


def record_visit(ip: str, ua: str) -> None:
    if not _is_sqlite_allowed():
        return
    today = date.today().isoformat()
    anon_key = _hash_key(ip, ua, today)
    ts = int(time.time())
    truncated_ua = (ua or "")[:255]
    conn = get_db()
    conn.execute(
        """
        INSERT INTO visits(day, anon_key, ua, ts)
        VALUES(?, ?, ?, ?)
        ON CONFLICT(day, anon_key) DO UPDATE SET
            ts = excluded.ts,
            ua = CASE WHEN excluded.ua != '' THEN excluded.ua ELSE visits.ua END
        """,
        (today, anon_key, truncated_ua, ts),
    )
    conn.commit()


def record_login(email: str) -> None:
    if not email:
        return
    if not _is_sqlite_allowed():
        return
    today = date.today().isoformat()
    ts = int(time.time())
    conn = get_db()
    conn.execute(
        "INSERT INTO logins(day, email, ts) VALUES(?, ?, ?)",
        (today, email.lower(), ts),
    )
    conn.commit()


def daily_overview(days: int = 7) -> Dict[str, object]:
    if not _is_sqlite_allowed():
        return {"series": [], "total_visitors": 0, "total_logins": 0}
    days = max(1, min(days, 31))
    conn = get_db()
    window: List[str] = [
        (date.today() - timedelta(days=i)).isoformat() for i in range(days)
    ]
    placeholders = ",".join(["?"] * len(window))
    visit_rows = conn.execute(
        f"SELECT day, COUNT(*) AS uniques FROM visits WHERE day IN ({placeholders}) GROUP BY day",
        window,
    ).fetchall()
    login_rows = conn.execute(
        f"SELECT day, COUNT(DISTINCT email) AS logins FROM logins WHERE day IN ({placeholders}) GROUP BY day",
        window,
    ).fetchall()
    visit_map = {row["day"]: int(row["uniques"]) for row in visit_rows}
    login_map = {row["day"]: int(row["logins"]) for row in login_rows}
    series = []
    for d in sorted(window):
        series.append(
            {
                "day": d,
                "visitors": visit_map.get(d, 0),
                "logins": login_map.get(d, 0),
            }
        )
    return {
        "series": series,
        "total_visitors": sum(v["visitors"] for v in series),
        "total_logins": sum(v["logins"] for v in series),
    }


def recent_visits(limit: int = 25) -> List[Dict[str, object]]:
    if not _is_sqlite_allowed():
        return []
    limit = max(1, min(limit, 100))
    conn = get_db()
    rows = conn.execute(
        "SELECT day, ua, ts FROM visits ORDER BY ts DESC LIMIT ?",
        (limit,),
    ).fetchall()
    results: List[Dict[str, object]] = []
    for row in rows:
        ts = datetime.fromtimestamp(int(row["ts"]))
        results.append(
            {
                "day": row["day"],
                "ua": row["ua"] or "",
                "last_seen": ts,
            }
        )
    return results
