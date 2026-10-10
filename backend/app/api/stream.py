import asyncio
import json
from datetime import datetime

from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from app.core.events import broadcaster

router = APIRouter(tags=["stream"])


def _json_default(o):
    return o.isoformat() if isinstance(o, datetime) else str(o)


@router.get("/stream/events")
async def sse_events():
    """Server-Sent Events: live analysis progress (incident updates and per-frame detections)."""
    queue = broadcaster.subscribe()

    async def event_generator():
        try:
            yield f"data: {json.dumps({'event': 'connected', 'data': {}})}\n\n"
            while True:
                try:
                    message = await asyncio.wait_for(queue.get(), timeout=15)
                    yield f"data: {json.dumps(message, default=_json_default)}\n\n"
                except asyncio.TimeoutError:
                    yield ": keep-alive\n\n"
        finally:
            broadcaster.unsubscribe(queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )
