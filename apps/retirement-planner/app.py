"""淨資產退休試算器 — Flask + SQLite

Run:
    pip install flask
    python app.py

Then open http://127.0.0.1:5050
"""
from __future__ import annotations

import os
import sqlite3
from typing import Any

from flask import Flask, g, jsonify, render_template, request

APP_ROOT = os.path.dirname(os.path.abspath(__file__))
DB_PATH = os.environ.get("PLANNER_DB", os.path.join(APP_ROOT, "planner.db"))

app = Flask(__name__)


# ---------------------------------------------------------------------------
# DB helpers
# ---------------------------------------------------------------------------

def get_db() -> sqlite3.Connection:
    if "db" not in g:
        g.db = sqlite3.connect(DB_PATH)
        g.db.row_factory = sqlite3.Row
        g.db.execute("PRAGMA foreign_keys = ON")
    return g.db


@app.teardown_appcontext
def close_db(_exc: BaseException | None = None) -> None:
    db = g.pop("db", None)
    if db is not None:
        db.close()


SCHEMA = """
CREATE TABLE IF NOT EXISTS plans (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    name          TEXT    NOT NULL,
    target_amount REAL    NOT NULL DEFAULT 4000,    -- 單位:萬
    created_at    TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS years (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    plan_id       INTEGER NOT NULL REFERENCES plans(id) ON DELETE CASCADE,
    year          INTEGER NOT NULL,
    annual_income REAL    NOT NULL DEFAULT 0,       -- 萬/年
    investment    REAL    NOT NULL DEFAULT 0,       -- 萬 (年初投資部位)
    net_worth     REAL    NOT NULL DEFAULT 0,       -- 萬 (年初淨資產)
    return_rate   REAL    NOT NULL DEFAULT 0,       -- 比率 0.05 = 5%
    pledge_rate   REAL    NOT NULL DEFAULT 0,
    finance_rate  REAL    NOT NULL DEFAULT 0,
    notes         TEXT    NOT NULL DEFAULT '',
    UNIQUE(plan_id, year)
);

CREATE TABLE IF NOT EXISTS monthly_expenses (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    year_id    INTEGER NOT NULL REFERENCES years(id) ON DELETE CASCADE,
    name       TEXT    NOT NULL,
    amount     REAL    NOT NULL DEFAULT 0,          -- 萬/月
    months     INTEGER NOT NULL DEFAULT 12,         -- 該項生效月份數
    sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS annual_expenses (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    year_id    INTEGER NOT NULL REFERENCES years(id) ON DELETE CASCADE,
    name       TEXT    NOT NULL,
    amount     REAL    NOT NULL DEFAULT 0,          -- 萬/年
    sort_order INTEGER NOT NULL DEFAULT 0
);
"""


def init_db() -> None:
    db = sqlite3.connect(DB_PATH)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys = ON")
    db.executescript(SCHEMA)
    db.commit()
    if db.execute("SELECT COUNT(*) AS n FROM plans").fetchone()["n"] == 0:
        seed_default_plan(db)
    db.close()


def seed_default_plan(db: sqlite3.Connection) -> None:
    cur = db.cursor()
    cur.execute(
        "INSERT INTO plans (name, target_amount) VALUES (?, ?)",
        ("基礎計畫", 4000),
    )
    plan_id = cur.lastrowid

    investment = 2561.0
    net_worth = 2561.0
    monthly_items = [
        ("生活費", 8.0, 12),
        ("房貸", 10.0, 12),
        ("信貸", 6.0, 12),
        ("房租", 3.0, 12),
        ("其他", 3.1, 12),
    ]

    for year in range(2026, 2031):
        cur.execute(
            """
            INSERT INTO years
                (plan_id, year, annual_income, investment, net_worth,
                 return_rate, pledge_rate, finance_rate, notes)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
            """,
            (plan_id, year, 280.0, investment, net_worth,
             0.06, 0.025, 0.015, ""),
        )
        year_id = cur.lastrowid
        for i, (n, a, m) in enumerate(monthly_items):
            cur.execute(
                "INSERT INTO monthly_expenses (year_id, name, amount, months, sort_order) "
                "VALUES (?, ?, ?, ?, ?)",
                (year_id, n, a, m, i),
            )
        cur.execute(
            "INSERT INTO annual_expenses (year_id, name, amount, sort_order) "
            "VALUES (?, ?, ?, ?)",
            (year_id, "保險", 6.0, 0),
        )

        # Roll forward (pure preview; user will tweak)
        annual_return = investment * 0.06
        monthly_total = sum(a * m for _, a, m in monthly_items)
        total_expenses = monthly_total + 6.0
        pledge_cost = investment * 0.025
        finance_income = investment * 0.015
        net_cash_flow = 280.0 - total_expenses - pledge_cost + finance_income
        investment = round(investment + annual_return + net_cash_flow, 2)
        net_worth = investment

    db.commit()


# ---------------------------------------------------------------------------
# Calculation
# ---------------------------------------------------------------------------

def compute_year(year_row: dict[str, Any],
                 monthly: list[dict[str, Any]],
                 annual: list[dict[str, Any]]) -> dict[str, Any]:
    investment = float(year_row["investment"])
    net_worth = float(year_row["net_worth"])
    income = float(year_row["annual_income"])
    rr = float(year_row["return_rate"])
    pr = float(year_row["pledge_rate"])
    fr = float(year_row["finance_rate"])

    monthly_total = sum(float(m["amount"]) * int(m["months"]) for m in monthly)
    annual_total = sum(float(a["amount"]) for a in annual)
    total_expenses = monthly_total + annual_total

    annual_return = investment * rr
    pledge_cost = investment * pr
    finance_income = investment * fr
    net_cash_flow = income - total_expenses - pledge_cost + finance_income

    end_investment = investment + annual_return + net_cash_flow
    end_net_worth = net_worth + annual_return + net_cash_flow

    return {
        "monthly_total": round(monthly_total, 2),
        "annual_total": round(annual_total, 2),
        "total_expenses": round(total_expenses, 2),
        "annual_return": round(annual_return, 2),
        "pledge_cost": round(pledge_cost, 2),
        "finance_income": round(finance_income, 2),
        "net_cash_flow": round(net_cash_flow, 2),
        "end_investment": round(end_investment, 2),
        "end_net_worth": round(end_net_worth, 2),
    }


def fetch_plan(plan_id: int) -> dict[str, Any] | None:
    db = get_db()
    plan = db.execute("SELECT * FROM plans WHERE id = ?", (plan_id,)).fetchone()
    if not plan:
        return None
    years = db.execute(
        "SELECT * FROM years WHERE plan_id = ? ORDER BY year", (plan_id,)
    ).fetchall()
    out_years = []
    for y in years:
        ydict = dict(y)
        monthly = [dict(r) for r in db.execute(
            "SELECT * FROM monthly_expenses WHERE year_id = ? "
            "ORDER BY sort_order, id", (y["id"],)
        ).fetchall()]
        annual = [dict(r) for r in db.execute(
            "SELECT * FROM annual_expenses WHERE year_id = ? "
            "ORDER BY sort_order, id", (y["id"],)
        ).fetchall()]
        ydict["monthly_expenses"] = monthly
        ydict["annual_expenses"] = annual
        ydict["computed"] = compute_year(ydict, monthly, annual)
        out_years.append(ydict)
    return {**dict(plan), "years": out_years}


# ---------------------------------------------------------------------------
# Routes — pages
# ---------------------------------------------------------------------------

@app.route("/")
def index() -> str:
    return render_template("index.html")


# ---------------------------------------------------------------------------
# Routes — plans
# ---------------------------------------------------------------------------

@app.get("/api/plans")
def list_plans():
    db = get_db()
    rows = db.execute(
        "SELECT id, name, target_amount, created_at FROM plans ORDER BY id"
    ).fetchall()
    return jsonify([dict(r) for r in rows])


@app.post("/api/plans")
def create_plan():
    data = request.get_json() or {}
    name = (data.get("name") or "").strip() or "未命名計畫"
    target = float(data.get("target_amount") or 4000)
    db = get_db()
    cur = db.execute(
        "INSERT INTO plans (name, target_amount) VALUES (?, ?)", (name, target)
    )
    db.commit()
    return jsonify(fetch_plan(cur.lastrowid))


@app.put("/api/plans/<int:plan_id>")
def update_plan(plan_id: int):
    data = request.get_json() or {}
    db = get_db()
    fields, values = [], []
    for col in ("name", "target_amount"):
        if col in data:
            fields.append(f"{col} = ?")
            values.append(data[col])
    if fields:
        values.append(plan_id)
        db.execute(f"UPDATE plans SET {', '.join(fields)} WHERE id = ?", values)
        db.commit()
    return jsonify(fetch_plan(plan_id))


@app.delete("/api/plans/<int:plan_id>")
def delete_plan(plan_id: int):
    db = get_db()
    db.execute("DELETE FROM plans WHERE id = ?", (plan_id,))
    db.commit()
    return ("", 204)


@app.post("/api/plans/<int:plan_id>/duplicate")
def duplicate_plan(plan_id: int):
    db = get_db()
    src = db.execute("SELECT * FROM plans WHERE id = ?", (plan_id,)).fetchone()
    if not src:
        return ("not found", 404)
    cur = db.execute(
        "INSERT INTO plans (name, target_amount) VALUES (?, ?)",
        (src["name"] + " 副本", src["target_amount"]),
    )
    new_plan_id = cur.lastrowid
    years = db.execute(
        "SELECT * FROM years WHERE plan_id = ? ORDER BY year", (plan_id,)
    ).fetchall()
    for y in years:
        nc = db.execute(
            """INSERT INTO years
               (plan_id, year, annual_income, investment, net_worth,
                return_rate, pledge_rate, finance_rate, notes)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)""",
            (new_plan_id, y["year"], y["annual_income"], y["investment"],
             y["net_worth"], y["return_rate"], y["pledge_rate"],
             y["finance_rate"], y["notes"]),
        )
        new_year_id = nc.lastrowid
        for m in db.execute(
            "SELECT * FROM monthly_expenses WHERE year_id = ?", (y["id"],)
        ).fetchall():
            db.execute(
                "INSERT INTO monthly_expenses "
                "(year_id, name, amount, months, sort_order) "
                "VALUES (?, ?, ?, ?, ?)",
                (new_year_id, m["name"], m["amount"], m["months"],
                 m["sort_order"]),
            )
        for a in db.execute(
            "SELECT * FROM annual_expenses WHERE year_id = ?", (y["id"],)
        ).fetchall():
            db.execute(
                "INSERT INTO annual_expenses "
                "(year_id, name, amount, sort_order) VALUES (?, ?, ?, ?)",
                (new_year_id, a["name"], a["amount"], a["sort_order"]),
            )
    db.commit()
    return jsonify(fetch_plan(new_plan_id))


@app.get("/api/plans/<int:plan_id>")
def get_plan(plan_id: int):
    plan = fetch_plan(plan_id)
    if not plan:
        return ("not found", 404)
    return jsonify(plan)


# ---------------------------------------------------------------------------
# Routes — years
# ---------------------------------------------------------------------------

@app.post("/api/plans/<int:plan_id>/years")
def create_year(plan_id: int):
    data = request.get_json() or {}
    db = get_db()
    last = db.execute(
        "SELECT * FROM years WHERE plan_id = ? ORDER BY year DESC LIMIT 1",
        (plan_id,),
    ).fetchone()

    if "year" in data and data["year"] is not None:
        new_year = int(data["year"])
    elif last:
        new_year = int(last["year"]) + 1
    else:
        new_year = 2026

    if last:
        c = compute_year(
            dict(last),
            [dict(r) for r in db.execute(
                "SELECT * FROM monthly_expenses WHERE year_id = ?", (last["id"],)
            ).fetchall()],
            [dict(r) for r in db.execute(
                "SELECT * FROM annual_expenses WHERE year_id = ?", (last["id"],)
            ).fetchall()],
        )
        defaults = {
            "annual_income": last["annual_income"],
            "investment": c["end_investment"],
            "net_worth": c["end_net_worth"],
            "return_rate": last["return_rate"],
            "pledge_rate": last["pledge_rate"],
            "finance_rate": last["finance_rate"],
        }
    else:
        defaults = {
            "annual_income": 280, "investment": 2561, "net_worth": 2561,
            "return_rate": 0.06, "pledge_rate": 0.025, "finance_rate": 0.015,
        }

    cur = db.execute(
        """INSERT INTO years
           (plan_id, year, annual_income, investment, net_worth,
            return_rate, pledge_rate, finance_rate, notes)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, '')""",
        (plan_id, new_year, defaults["annual_income"], defaults["investment"],
         defaults["net_worth"], defaults["return_rate"],
         defaults["pledge_rate"], defaults["finance_rate"]),
    )
    new_year_id = cur.lastrowid

    if last:
        for m in db.execute(
            "SELECT * FROM monthly_expenses WHERE year_id = ? "
            "ORDER BY sort_order, id", (last["id"],)
        ).fetchall():
            db.execute(
                "INSERT INTO monthly_expenses "
                "(year_id, name, amount, months, sort_order) "
                "VALUES (?, ?, ?, ?, ?)",
                (new_year_id, m["name"], m["amount"], m["months"],
                 m["sort_order"]),
            )
        for a in db.execute(
            "SELECT * FROM annual_expenses WHERE year_id = ? "
            "ORDER BY sort_order, id", (last["id"],)
        ).fetchall():
            db.execute(
                "INSERT INTO annual_expenses "
                "(year_id, name, amount, sort_order) VALUES (?, ?, ?, ?)",
                (new_year_id, a["name"], a["amount"], a["sort_order"]),
            )

    db.commit()
    return jsonify(fetch_plan(plan_id))


@app.put("/api/years/<int:year_id>")
def update_year(year_id: int):
    data = request.get_json() or {}
    db = get_db()
    allowed = {"year", "annual_income", "investment", "net_worth",
               "return_rate", "pledge_rate", "finance_rate", "notes"}
    fields, values = [], []
    for k in allowed:
        if k in data:
            fields.append(f"{k} = ?")
            values.append(data[k])
    if not fields:
        return ("no fields", 400)
    values.append(year_id)
    db.execute(f"UPDATE years SET {', '.join(fields)} WHERE id = ?", values)
    db.commit()
    return ("", 204)


@app.delete("/api/years/<int:year_id>")
def delete_year(year_id: int):
    db = get_db()
    db.execute("DELETE FROM years WHERE id = ?", (year_id,))
    db.commit()
    return ("", 204)


# ---------------------------------------------------------------------------
# Routes — expense items
# ---------------------------------------------------------------------------

@app.post("/api/years/<int:year_id>/monthly_expenses")
def create_monthly(year_id: int):
    data = request.get_json() or {}
    db = get_db()
    nxt = db.execute(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 AS s "
        "FROM monthly_expenses WHERE year_id = ?", (year_id,)
    ).fetchone()["s"]
    cur = db.execute(
        "INSERT INTO monthly_expenses (year_id, name, amount, months, sort_order) "
        "VALUES (?, ?, ?, ?, ?)",
        (year_id, (data.get("name") or "新項目"),
         float(data.get("amount") or 0),
         int(data.get("months") or 12), nxt),
    )
    db.commit()
    return jsonify({"id": cur.lastrowid})


@app.put("/api/monthly_expenses/<int:item_id>")
def update_monthly(item_id: int):
    data = request.get_json() or {}
    db = get_db()
    allowed = {"name", "amount", "months", "sort_order"}
    fields, values = [], []
    for k in allowed:
        if k in data:
            fields.append(f"{k} = ?")
            values.append(data[k])
    if not fields:
        return ("no fields", 400)
    values.append(item_id)
    db.execute(
        f"UPDATE monthly_expenses SET {', '.join(fields)} WHERE id = ?", values
    )
    db.commit()
    return ("", 204)


@app.delete("/api/monthly_expenses/<int:item_id>")
def delete_monthly(item_id: int):
    db = get_db()
    db.execute("DELETE FROM monthly_expenses WHERE id = ?", (item_id,))
    db.commit()
    return ("", 204)


@app.post("/api/years/<int:year_id>/annual_expenses")
def create_annual(year_id: int):
    data = request.get_json() or {}
    db = get_db()
    nxt = db.execute(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 AS s "
        "FROM annual_expenses WHERE year_id = ?", (year_id,)
    ).fetchone()["s"]
    cur = db.execute(
        "INSERT INTO annual_expenses (year_id, name, amount, sort_order) "
        "VALUES (?, ?, ?, ?)",
        (year_id, (data.get("name") or "新項目"),
         float(data.get("amount") or 0), nxt),
    )
    db.commit()
    return jsonify({"id": cur.lastrowid})


@app.put("/api/annual_expenses/<int:item_id>")
def update_annual(item_id: int):
    data = request.get_json() or {}
    db = get_db()
    allowed = {"name", "amount", "sort_order"}
    fields, values = [], []
    for k in allowed:
        if k in data:
            fields.append(f"{k} = ?")
            values.append(data[k])
    if not fields:
        return ("no fields", 400)
    values.append(item_id)
    db.execute(
        f"UPDATE annual_expenses SET {', '.join(fields)} WHERE id = ?", values
    )
    db.commit()
    return ("", 204)


@app.delete("/api/annual_expenses/<int:item_id>")
def delete_annual(item_id: int):
    db = get_db()
    db.execute("DELETE FROM annual_expenses WHERE id = ?", (item_id,))
    db.commit()
    return ("", 204)


# ---------------------------------------------------------------------------
# Simulation & comparison
# ---------------------------------------------------------------------------

def simulate_plan(plan: dict[str, Any], target: float,
                  max_years: int = 50) -> dict[str, Any]:
    years = plan["years"]
    rows: list[dict[str, Any]] = []
    if not years:
        return {"target": target, "rows": rows, "reached_year": None,
                "achievement_rate": 0.0, "final_net_worth": 0.0}

    # Start with explicit years using their own data
    investment = float(years[0]["investment"])
    net_worth = float(years[0]["net_worth"])
    reached_year = None

    for idx, y in enumerate(years):
        c = compute_year(y, y["monthly_expenses"], y["annual_expenses"])
        rows.append({
            "year": int(y["year"]),
            "annual_income": y["annual_income"],
            "total_expenses": c["total_expenses"],
            "annual_return": c["annual_return"],
            "net_cash_flow": c["net_cash_flow"],
            "end_investment": c["end_investment"],
            "end_net_worth": c["end_net_worth"],
            "source": "explicit",
        })
        net_worth = c["end_net_worth"]
        investment = c["end_investment"]
        if reached_year is None and net_worth >= target:
            reached_year = int(y["year"])

    # Continue projection beyond explicit years using the last year's settings
    template = years[-1]
    monthly_total = sum(
        float(m["amount"]) * int(m["months"])
        for m in template["monthly_expenses"]
    )
    annual_total = sum(float(a["amount"]) for a in template["annual_expenses"])
    income = float(template["annual_income"])
    rr = float(template["return_rate"])
    pr = float(template["pledge_rate"])
    fr = float(template["finance_rate"])

    cur_year = int(template["year"])
    extra = 0
    while extra < max_years and (reached_year is None or
                                  net_worth < target * 1.1):
        cur_year += 1
        extra += 1
        annual_return = investment * rr
        pledge_cost = investment * pr
        finance_income = investment * fr
        net_cash_flow = income - monthly_total - annual_total - pledge_cost + finance_income
        investment = round(investment + annual_return + net_cash_flow, 2)
        net_worth = round(net_worth + annual_return + net_cash_flow, 2)
        rows.append({
            "year": cur_year,
            "annual_income": income,
            "total_expenses": round(monthly_total + annual_total, 2),
            "annual_return": round(annual_return, 2),
            "net_cash_flow": round(net_cash_flow, 2),
            "end_investment": investment,
            "end_net_worth": net_worth,
            "source": "projected",
        })
        if reached_year is None and net_worth >= target:
            reached_year = cur_year
        if reached_year is not None and cur_year - reached_year >= 2:
            break

    achievement_rate = (net_worth / target) if target > 0 else 0.0
    return {
        "target": target,
        "rows": rows,
        "reached_year": reached_year,
        "achievement_rate": round(achievement_rate, 4),
        "final_net_worth": net_worth,
    }


@app.get("/api/plans/<int:plan_id>/simulate")
def simulate(plan_id: int):
    plan = fetch_plan(plan_id)
    if not plan:
        return ("not found", 404)
    target = float(request.args.get("target") or plan["target_amount"])
    max_years = int(request.args.get("max_years") or 50)
    result = simulate_plan(plan, target, max_years)
    result["plan_id"] = plan_id
    result["plan_name"] = plan["name"]
    return jsonify(result)


@app.get("/api/plans/compare")
def compare():
    raw_ids = request.args.get("ids", "")
    target_param = request.args.get("target")
    plan_ids = [int(x) for x in raw_ids.split(",") if x.strip().isdigit()]
    out = []
    for pid in plan_ids:
        plan = fetch_plan(pid)
        if not plan:
            continue
        target = float(target_param) if target_param else float(plan["target_amount"])
        sim = simulate_plan(plan, target, 50)
        out.append({
            "plan_id": pid,
            "plan_name": plan["name"],
            "target": target,
            "reached_year": sim["reached_year"],
            "final_net_worth": sim["final_net_worth"],
            "achievement_rate": sim["achievement_rate"],
            "rows": sim["rows"],
        })
    return jsonify(out)


# ---------------------------------------------------------------------------
# Bootstrap
# ---------------------------------------------------------------------------

with app.app_context():
    init_db()


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.environ.get("PORT", 5050)),
            debug=False)
