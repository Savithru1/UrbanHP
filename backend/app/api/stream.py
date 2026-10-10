import json
import asyncio
from fastapi import APIRouter, WebSocket, WebSocketDisconnect
from fastapi.responses import StreamingResponse
from app.core.events import broadcaster

router = APIRouter(tags=["stream"])

@router.websocket("/ws/updates")
async def websocket_updates(websocket: WebSocket):
    await broadcaster.connect_ws(websocket)
    try:
        while True:
            # Keep-alive listener
            data = await websocket.receive_text()
            if data == "ping":
                await websocket.send_text("pong")
    except WebSocketDisconnect:
        broadcaster.disconnect_ws(websocket)
    except Exception:
        broadcaster.disconnect_ws(websocket)

@router.get("/stream/events")
async def sse_events():
    queue = broadcaster.subscribe_sse()
    
    async def event_generator():
        try:
            # Initial connection confirmation
            yield f"data: {json.dumps({'event': 'connected', 'message': 'UrbanHP Live Stream Active'})}\n\n"
            while True:
                message = await queue.get()
                yield f"data: {json.dumps(message, default=str)}\n\n"
        except asyncio.CancelledError:
            broadcaster.unsubscribe_sse(queue)
            
    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no"
        }
    )
