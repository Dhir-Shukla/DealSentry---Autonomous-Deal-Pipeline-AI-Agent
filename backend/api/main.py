import asyncio
import json

from dotenv import load_dotenv

load_dotenv()

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from sse_starlette.sse import EventSourceResponse

from agent.orchestrator import run_sweep
from db.reset import reset_database

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

_sweep_lock = asyncio.Lock()


@app.get("/health")
async def health():
    return {"status": "ok"}


@app.post("/sweep")
async def sweep():
    if _sweep_lock.locked():
        return JSONResponse({"error": "Sweep already in progress"}, status_code=409)

    async def event_generator():
        async with _sweep_lock:
            async for event in run_sweep():
                yield {"data": json.dumps(event)}

    return EventSourceResponse(event_generator())


@app.post("/reset")
async def reset():
    try:
        await asyncio.to_thread(reset_database)
        return {"success": True, "message": "Pipeline reset to demo state"}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)
