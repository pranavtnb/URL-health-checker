# URL Health Monitor Backend
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List, Optional
import requests
import time
import sqlite3
from datetime import datetime
from fastapi.responses import JSONResponse
import logging
import yagmail
import os
from dotenv import load_dotenv
from apscheduler.schedulers.background import BackgroundScheduler

logging.basicConfig(level=logging.INFO)

app = FastAPI()

origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

DB_PATH = "health_monitor.db"

# Load email config from .env
load_dotenv()
EMAIL_USER = os.getenv('EMAIL_USER')
EMAIL_PASS = os.getenv('EMAIL_PASS')
ALERT_RECIPIENT = os.getenv('ALERT_RECIPIENT')

# Add status_code to the DB and error rate tracking
# 1. Update DB schema if needed (for new installs, add status_code)
# 2. Store status_code in each check
# 3. Add /health endpoint

def init_db():
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('''CREATE TABLE IF NOT EXISTS checks (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        url TEXT NOT NULL,
        status TEXT NOT NULL,
        response_time REAL,
        checked_at TEXT NOT NULL,
        status_code INTEGER
    )''')
    conn.commit()
    conn.close()

init_db()

class URLCheckRequest(BaseModel):
    urls: List[str]

class URLCheckResult(BaseModel):
    url: str
    status: str
    response_time: Optional[float]
    checked_at: str
    status_code: Optional[int]

@app.post("/check_urls", response_model=List[URLCheckResult])
def check_urls(request: URLCheckRequest, background_tasks: BackgroundTasks):
    results = []
    checked_at = datetime.utcnow().isoformat()
    for url in request.urls:
        try:
            start = time.time()
            resp = requests.get(url, timeout=5)
            elapsed = time.time() - start
            status_code = resp.status_code
            status = "UP" if 200 <= status_code < 400 else "DOWN"
        except requests.RequestException as ex:
            elapsed = None
            status = "DOWN"
            status_code = None
        results.append({
            "url": url,
            "status": status,
            "response_time": elapsed,
            "checked_at": checked_at,
            "status_code": status_code
        })
    background_tasks.add_task(store_results, results)
    return results

def store_results(results):
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    for result in results:
        c.execute('''INSERT INTO checks (url, status, response_time, checked_at, status_code) VALUES (?, ?, ?, ?, ?)''',
                  (result["url"], result["status"], result["response_time"], result["checked_at"], result["status_code"]))
    conn.commit()
    conn.close()

# Defensive /history endpoint
@app.get("/history", response_model=List[URLCheckResult])
def get_history(url: Optional[str] = None, limit: int = 50):
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        if url:
            c.execute('''SELECT url, status, response_time, checked_at, status_code FROM checks WHERE url = ? ORDER BY checked_at DESC LIMIT ?''', (url, limit))
        else:
            c.execute('''SELECT url, status, response_time, checked_at, status_code FROM checks ORDER BY checked_at DESC LIMIT ?''', (limit,))
        rows = c.fetchall()
        conn.close()
        results = []
        for row in rows:
            try:
                results.append(URLCheckResult(
                    url=row[0],
                    status=row[1],
                    response_time=row[2],
                    checked_at=row[3],
                    status_code=row[4] if len(row) > 4 else None
                ))
            except Exception as e:
                logging.warning(f"/history row error: {e} row={row}")
        return results
    except Exception as e:
        logging.error(f"/history error: {e}")
        return JSONResponse(content={"error": str(e)}, status_code=500)

# Defensive /history_by_url endpoint
@app.get("/history_by_url")
def history_by_url(url: str, limit: int = 30):
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute('''SELECT status, response_time, checked_at, status_code FROM checks WHERE url = ? ORDER BY checked_at DESC LIMIT ?''', (url, limit))
        rows = c.fetchall()
        conn.close()
        # Return most recent first, reverse for chronological order
        rows = rows[::-1]
        out = []
        for r in rows:
            try:
                out.append({
                    "status": r[0],
                    "response_time": r[1],
                    "checked_at": r[2],
                    "status_code": r[3] if len(r) > 3 else None
                })
            except Exception as e:
                logging.warning(f"/history_by_url row error: {e} row={r}")
        return JSONResponse(content=out)
    except Exception as e:
        logging.error(f"/history_by_url error: {e}")
        return JSONResponse(content={"error": str(e)}, status_code=500)

# Defensive /metrics endpoint
@app.get("/metrics")
def get_metrics():
    try:
        conn = sqlite3.connect(DB_PATH)
        c = conn.cursor()
        c.execute('''SELECT url, COUNT(*),
            SUM(CASE WHEN status = 'UP' THEN 1 ELSE 0 END),
            SUM(CASE WHEN (status_code IS NOT NULL AND status_code >= 400 AND status_code < 600) THEN 1 ELSE 0 END)
            FROM checks GROUP BY url''')
        data = c.fetchall()
        conn.close()
        metrics = []
        for row in data:
            url = row[0]
            total = row[1] or 0
            up = row[2] or 0
            error_count = row[3] or 0
            metrics.append({
                "url": url,
                "total_checks": total,
                "up_count": up,
                "up_percent": round(100 * up / total, 2) if total else 0,
                "error_count": error_count,
                "error_rate": round(100 * error_count / total, 2) if total else 0
            })
        return metrics
    except Exception as e:
        logging.error(f"/metrics error: {e}")
        return JSONResponse(content={"error": str(e)}, status_code=500)

scheduler = BackgroundScheduler()

# Track last/next run times
global_last_run = None
global_next_run = None

def scheduled_check():
    global global_last_run, global_next_run
    global_last_run = datetime.utcnow().isoformat()
    conn = sqlite3.connect(DB_PATH)
    c = conn.cursor()
    c.execute('SELECT DISTINCT url FROM checks')
    urls = [row[0] for row in c.fetchall()]
    conn.close()
    if not urls:
        return
    results = []
    checked_at = datetime.utcnow().isoformat()
    for url in urls:
        try:
            start = time.time()
            resp = requests.get(url, timeout=5)
            elapsed = time.time() - start
            status_code = resp.status_code
            status = "UP" if 200 <= status_code < 400 else "DOWN"
        except requests.RequestException as ex:
            elapsed = None
            status = "DOWN"
            status_code = None
        results.append({
            "url": url,
            "status": status,
            "response_time": elapsed,
            "checked_at": checked_at,
            "status_code": status_code
        })
        if status == "DOWN" and EMAIL_USER and EMAIL_PASS and ALERT_RECIPIENT:
            try:
                yag = yagmail.SMTP(EMAIL_USER, EMAIL_PASS)
                yag.send(ALERT_RECIPIENT, f"ALERT: {url} is DOWN", f"{url} is DOWN as of {checked_at}")
            except Exception as e:
                print(f"Failed to send alert for {url}: {e}")
    store_results(results)

scheduler.add_job(scheduled_check, 'interval', minutes=5)
scheduler.start()

@app.get("/schedule/status")
def schedule_status():
    next_run = None
    try:
        jobs = scheduler.get_jobs()
        if jobs:
            next_run = jobs[0].next_run_time.isoformat() if jobs[0].next_run_time else None
    except Exception:
        next_run = None
    return {
        "last_run": global_last_run,
        "next_run": next_run,
        "email_alerts": bool(EMAIL_USER and EMAIL_PASS and ALERT_RECIPIENT)
    }

@app.post("/schedule/run_now")
def run_now(background_tasks: BackgroundTasks):
    background_tasks.add_task(scheduled_check)
    return {"status": "scheduled"}

@app.get("/health")
def health():
    return {"status": "ok"}
