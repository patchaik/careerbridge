"""CareerBridge sample app for Vercel.

A minimal FastAPI app that proves the hosting pipeline works end to end:
  /              -> the web page in public/index.html (served by Vercel's CDN)
  /api/health    -> is the app up, and can it reach Supabase?
  /api/hello     -> a simple JSON endpoint the page calls
  /docs          -> FastAPI's interactive API docs

Vercel finds the `app` object in this file automatically (main.py).
Secrets come from Vercel environment variables, never from the repo.
"""

import os
import time
from datetime import datetime, timezone

from fastapi import FastAPI, Query
from fastapi.responses import RedirectResponse

app = FastAPI(title="CareerBridge sample", version="0.1.0")

STARTED = time.time()


@app.get("/", include_in_schema=False)
def home():
    # The page lives in public/index.html and is served from Vercel's CDN.
    return RedirectResponse("/index.html", status_code=307)


@app.get("/api/health")
def health():
    """Report app status and whether Supabase is reachable. Never returns secrets or data."""
    url = os.getenv("SUPABASE_URL", "").strip().rstrip("/")
    key = os.getenv("SUPABASE_KEY", "").strip()
    if url.endswith("/rest/v1"):
        url = url[: -len("/rest/v1")]

    if not (url and key):
        database = "not_configured"
    else:
        try:
            from supabase import create_client

            create_client(url, key).table("users").select("id").limit(1).execute()
            database = "connected"
        except Exception:  # noqa: BLE001 - details stay in Vercel logs, not the response
            database = "error"

    return {
        "status": "ok",
        "database": database,
        "environment": os.getenv("VERCEL_ENV", "local"),
        "commit": (os.getenv("VERCEL_GIT_COMMIT_SHA") or "local")[:7],
        "uptime_seconds": round(time.time() - STARTED, 1),
    }


@app.get("/api/hello")
def hello(name: str = Query("there", min_length=1, max_length=50)):
    """A tiny endpoint the web page calls to show the API is working."""
    return {
        "message": f"Hello, {name}! CareerBridge is running on Vercel.",
        "time_utc": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }
