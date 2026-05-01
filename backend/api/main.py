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

    # The sweep runs as an independent background task so it always reaches
    # complete_run — even if the SSE client disconnects mid-stream.
    queue: asyncio.Queue = asyncio.Queue()

    async def background_sweep():
        async with _sweep_lock:
            try:
                async for event in run_sweep():
                    await queue.put(event)
            except Exception as e:
                await queue.put({"type": "error", "error": str(e)})
            finally:
                await queue.put(None)  # sentinel: stream is done

    asyncio.create_task(background_sweep())

    async def event_generator():
        try:
            while True:
                try:
                    # Wait up to 25 s; send a keepalive comment if nothing arrives.
                    # This prevents Railway / nginx from closing an idle SSE connection.
                    event = await asyncio.wait_for(queue.get(), timeout=25)
                    if event is None:   # sentinel — sweep finished, close stream
                        break
                    yield {"data": json.dumps(event)}
                except asyncio.TimeoutError:
                    yield {"data": json.dumps({"type": "keepalive"})}
        except asyncio.CancelledError:
            # Client disconnected — background task continues independently.
            pass

    return EventSourceResponse(event_generator())


@app.post("/reset")
async def reset():
    try:
        await asyncio.to_thread(reset_database)
        return {"success": True, "message": "Pipeline reset to demo state"}
    except Exception as e:
        return JSONResponse({"error": str(e)}, status_code=500)
