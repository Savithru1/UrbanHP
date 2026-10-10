import asyncio
from typing import Set, Dict, Any
from starlette.websockets import WebSocket

class EventBroadcaster:
    def __init__(self):
        self.active_connections: Set[WebSocket] = set()
        self.sse_subscribers: Set[asyncio.Queue] = set()

    async def connect_ws(self, websocket: WebSocket):
        await websocket.accept()
        self.active_connections.add(websocket)

    def disconnect_ws(self, websocket: WebSocket):
        self.active_connections.discard(websocket)

    def subscribe_sse(self) -> asyncio.Queue:
        q = asyncio.Queue()
        self.sse_subscribers.add(q)
        return q

    def unsubscribe_sse(self, q: asyncio.Queue):
        self.sse_subscribers.discard(q)

    async def broadcast(self, event_type: str, data: Dict[str, Any]):
        message = {"event": event_type, "data": data}
        
        # Broadcast to WebSockets
        for ws in list(self.active_connections):
            try:
                await ws.send_json(message)
            except Exception:
                self.disconnect_ws(ws)
                
        # Broadcast to SSE queues
        for q in list(self.sse_subscribers):
            try:
                await q.put(message)
            except Exception:
                self.unsubscribe_sse(q)

broadcaster = EventBroadcaster()
