"""
Leave Tracker App — FastAPI Backend
Tracks office leaves, planned leaves, and holidays through a year.
"""

import sqlite3
from datetime import date, datetime
from contextlib import contextmanager
from pathlib import Path
from typing import Optional

from fastapi import FastAPI, Request, HTTPException, Query
from fastapi.responses import HTMLResponse
from fastapi.staticfiles import StaticFiles
from fastapi.templating import Jinja2Templates
from pydantic import BaseModel

# --- App Setup ---
app = FastAPI(title="Leave Tracker")

BASE_DIR = Path(__file__).resolve().parent
app.mount("/static", StaticFiles(directory=str(BASE_DIR / "static")), name="static")
templates = Jinja2Templates(directory=str(BASE_DIR / "templates"))

DB_PATH = str(BASE_DIR / "leaves.db")

# --- Configuration ---
LEAVES_PER_MONTH = 2
ACCRUAL_START_MONTH = 1  # January


# --- Database ---
@contextmanager
def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    try:
        yield conn
        conn.commit()
    finally:
        conn.close()


def init_db():
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS leaves (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT UNIQUE NOT NULL,
                reason TEXT DEFAULT '',
                value REAL DEFAULT 1.0,
                created_at TEXT DEFAULT (datetime('now'))
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS planned_leaves (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT UNIQUE NOT NULL,
                reason TEXT DEFAULT '',
                value REAL DEFAULT 1.0,
                created_at TEXT DEFAULT (datetime('now'))
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS holidays (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                date TEXT UNIQUE NOT NULL,
                name TEXT DEFAULT '',
                created_at TEXT DEFAULT (datetime('now'))
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS settings (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL
            )
        """)


init_db()


# --- Models ---
class MarkLeaveRequest(BaseModel):
    date: str
    reason: str = ""
    value: float = 1.0


class MarkHolidayRequest(BaseModel):
    date: str
    name: str = ""


class MarkPlannedRequest(BaseModel):
    date: str
    reason: str = ""
    value: float = 1.0


class SettingsUpdate(BaseModel):
    carry_forward: Optional[int] = None
    earned_override: Optional[int] = None  # None means auto-calc
    balance_override: Optional[int] = None  # None means auto-calc


# --- Helpers ---
def get_setting(key: str, default: str = "0") -> str:
    with get_db() as conn:
        row = conn.execute("SELECT value FROM settings WHERE key = ?", (key,)).fetchone()
        return row["value"] if row else default


def set_setting(key: str, value: str):
    with get_db() as conn:
        conn.execute(
            "INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)",
            (key, value)
        )


def get_carry_forward(year: int) -> float:
    return float(get_setting(f"carry_forward_{year}", "0"))




def get_earned_override(year: int) -> Optional[int]:
    val = get_setting(f"earned_override_{year}", "")
    return int(val) if val else None


def get_balance_override(year: int) -> Optional[int]:
    val = get_setting(f"balance_override_{year}", "")
    return int(val) if val else None


def get_accrued_leaves(year: int) -> int:
    """Calculate total accrued leaves based on current date relative to year."""
    today = date.today()
    if today.year < year:
        return 0
    if today.year > year:
        months = 12 - ACCRUAL_START_MONTH + 1
        return months * LEAVES_PER_MONTH

    current_month = today.month
    if current_month < ACCRUAL_START_MONTH:
        return 0

    months_elapsed = current_month - ACCRUAL_START_MONTH + 1
    return months_elapsed * LEAVES_PER_MONTH


def get_used_leaves(year: int) -> float:
    """Sum of confirmed leave values only (holidays are separate)."""
    with get_db() as conn:
        row = conn.execute(
            "SELECT COALESCE(SUM(value), 0) as total FROM leaves WHERE date LIKE ?",
            (f"{year}-%",)
        ).fetchone()
        return row["total"]


def get_all_leaves(year: int) -> list[dict]:
    with get_db() as conn:
        rows = conn.execute(
            "SELECT date, reason, value FROM leaves WHERE date LIKE ? ORDER BY date",
            (f"{year}-%",)
        ).fetchall()
        return [dict(r) for r in rows]


def get_all_planned_leaves(year: int) -> list[dict]:
    with get_db() as conn:
        rows = conn.execute(
            "SELECT date, reason, value FROM planned_leaves WHERE date LIKE ? ORDER BY date",
            (f"{year}-%",)
        ).fetchall()
        return [dict(r) for r in rows]


def get_all_holidays(year: int) -> list[dict]:
    with get_db() as conn:
        rows = conn.execute(
            "SELECT id, date, name FROM holidays WHERE date LIKE ? ORDER BY date",
            (f"{year}-%",)
        ).fetchall()
        return [dict(r) for r in rows]


# --- Routes ---

@app.get("/", response_class=HTMLResponse)
async def index(request: Request):
    current_year = date.today().year
    return templates.TemplateResponse("index.html", {
        "request": request,
        "year": current_year,
    })


@app.get("/api/leaves")
async def api_get_leaves(year: int = Query(default=None)):
    if year is None:
        year = date.today().year

    carry_forward = get_carry_forward(year)
    accrued_this_year = get_accrued_leaves(year)
    total_earned = carry_forward + accrued_this_year

    # Apply overrides if set
    earned_override = get_earned_override(year)
    if earned_override is not None:
        total_earned = earned_override

    used = get_used_leaves(year)

    balance_override = get_balance_override(year)
    if balance_override is not None:
        balance = balance_override
    else:
        balance = max(0, total_earned - used)

    leaves = get_all_leaves(year)
    planned = get_all_planned_leaves(year)
    holidays = get_all_holidays(year)

    # Calculate projections — start from current balance, roll forward
    # Each month adds LEAVES_PER_MONTH, and we subtract leaves/planned taken in that month
    projections = []
    leaves_by_month = [0.0] * 13
    for l in leaves:
        m = datetime.strptime(l["date"], "%Y-%m-%d").month
        leaves_by_month[m] += l.get("value", 1.0)
    for p in planned:
        m = datetime.strptime(p["date"], "%Y-%m-%d").month
        leaves_by_month[m] += p.get("value", 1.0)

    today = date.today()
    current_month = today.month if today.year == year else (0 if today.year < year else 13)

    cumulative_taken = 0.0
    for m in range(1, 13):
        cumulative_taken += leaves_by_month[m]
        
        if m >= current_month:
            # Earned so far this year by this upcoming month M
            earned_at_m = carry_forward + (m * LEAVES_PER_MONTH)
            if earned_override is not None:
                earned_at_m = earned_override
            
            proj_balance = earned_at_m - cumulative_taken
            
            added_this_month = LEAVES_PER_MONTH
            if m == 1:
                added_this_month += carry_forward
                
            projections.append({
                "month": m,
                "added": added_this_month if earned_override is None else 0,
                "taken": leaves_by_month[m],
                "balance": max(0, proj_balance)
            })

    return {
        "year": year,
        "carry_forward": carry_forward,
        "earned": total_earned,
        "earned_auto": carry_forward + accrued_this_year,
        "earned_override": earned_override,
        "balance_override": balance_override,
        "used": used,
        "balance": balance,
        "balance_auto": max(0, (carry_forward + accrued_this_year) - used),
        "leaves_per_month": LEAVES_PER_MONTH,
        "leaves": leaves,
        "planned_leaves": planned,
        "holidays": holidays,
        "projections": projections,
    }


@app.post("/api/leaves/mark")
async def api_mark_leave(req: MarkLeaveRequest, year: int = Query(default=None)):
    if year is None:
        year = date.today().year
    try:
        d = datetime.strptime(req.date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format.")

    if d.year != year:
        raise HTTPException(status_code=400, detail=f"Date must be in year {year}.")

    with get_db() as conn:
        if conn.execute("SELECT id FROM holidays WHERE date = ?", (req.date,)).fetchone():
            raise HTTPException(status_code=400, detail="Already a holiday.")
        if conn.execute("SELECT id FROM planned_leaves WHERE date = ?", (req.date,)).fetchone():
            # Convert planned to confirmed
            conn.execute("DELETE FROM planned_leaves WHERE date = ?", (req.date,))

    try:
        with get_db() as conn:
            conn.execute("INSERT INTO leaves (date, reason, value) VALUES (?, ?, ?)", (req.date, req.reason, req.value))
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=400, detail="Leave already marked.")

    return {"status": "ok"}


@app.delete("/api/leaves/{leave_date}")
async def api_unmark_leave(leave_date: str):
    with get_db() as conn:
        result = conn.execute("DELETE FROM leaves WHERE date = ?", (leave_date,))
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="No leave found.")
    return {"status": "ok"}


@app.post("/api/planned/mark")
async def api_mark_planned(req: MarkPlannedRequest, year: int = Query(default=None)):
    if year is None:
        year = date.today().year
    try:
        d = datetime.strptime(req.date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format.")

    if d.year != year:
        raise HTTPException(status_code=400, detail=f"Date must be in year {year}.")

    with get_db() as conn:
        if conn.execute("SELECT id FROM holidays WHERE date = ?", (req.date,)).fetchone():
            raise HTTPException(status_code=400, detail="Already a holiday.")
        if conn.execute("SELECT id FROM leaves WHERE date = ?", (req.date,)).fetchone():
            raise HTTPException(status_code=400, detail="Already a confirmed leave.")

    try:
        with get_db() as conn:
            conn.execute("INSERT INTO planned_leaves (date, reason, value) VALUES (?, ?, ?)", (req.date, req.reason, req.value))
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=400, detail="Planned leave already marked.")

    return {"status": "ok"}


@app.delete("/api/planned/{planned_date}")
async def api_unmark_planned(planned_date: str):
    with get_db() as conn:
        result = conn.execute("DELETE FROM planned_leaves WHERE date = ?", (planned_date,))
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="No planned leave found.")
    return {"status": "ok"}


@app.post("/api/holidays/mark")
async def api_mark_holiday(req: MarkHolidayRequest, year: int = Query(default=None)):
    if year is None:
        year = date.today().year
    try:
        d = datetime.strptime(req.date, "%Y-%m-%d").date()
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format.")

    if d.year != year:
        raise HTTPException(status_code=400, detail=f"Date must be in year {year}.")

    with get_db() as conn:
        if conn.execute("SELECT id FROM leaves WHERE date = ?", (req.date,)).fetchone():
            raise HTTPException(status_code=400, detail="Already a leave.")
        if conn.execute("SELECT id FROM planned_leaves WHERE date = ?", (req.date,)).fetchone():
            raise HTTPException(status_code=400, detail="Already a planned leave.")

    try:
        with get_db() as conn:
            conn.execute("INSERT INTO holidays (date, name) VALUES (?, ?)", (req.date, req.name))
    except sqlite3.IntegrityError:
        raise HTTPException(status_code=400, detail="Holiday already marked.")

    return {"status": "ok"}


@app.delete("/api/holidays/{holiday_date}")
async def api_unmark_holiday(holiday_date: str):
    with get_db() as conn:
        result = conn.execute("DELETE FROM holidays WHERE date = ?", (holiday_date,))
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="No holiday found.")
    return {"status": "ok"}


@app.delete("/api/holidays/id/{holiday_id}")
async def api_delete_holiday_by_id(holiday_id: int):
    with get_db() as conn:
        result = conn.execute("DELETE FROM holidays WHERE id = ?", (holiday_id,))
        if result.rowcount == 0:
            raise HTTPException(status_code=404, detail="Holiday not found.")
    return {"status": "ok"}


@app.post("/api/settings")
async def api_update_settings(req: SettingsUpdate, year: int = Query(default=None)):
    if year is None:
        year = date.today().year

    if req.carry_forward is not None:
        if req.carry_forward < 0:
            raise HTTPException(status_code=400, detail="Cannot be negative.")
        set_setting(f"carry_forward_{year}", str(req.carry_forward))

    # earned_override: 0 means clear override, positive int sets it
    if req.earned_override is not None:
        if req.earned_override == 0:
            # Clear override — delete the key
            with get_db() as conn:
                conn.execute("DELETE FROM settings WHERE key = ?", (f"earned_override_{year}",))
        else:
            set_setting(f"earned_override_{year}", str(req.earned_override))

    if req.balance_override is not None:
        if req.balance_override == 0:
            with get_db() as conn:
                conn.execute("DELETE FROM settings WHERE key = ?", (f"balance_override_{year}",))
        else:
            set_setting(f"balance_override_{year}", str(req.balance_override))

    return {"status": "ok"}
