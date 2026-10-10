import asyncio
from typing import Any, Dict, Set


class EventBroadcaster:
    """Fans out live analysis events to every browser listening on the SSE stream."""

    def __init__(self):
        self.subscribers: Set[asyncio.Queue] = set()

    def subscribe(self) -> asyncio.Queue:
        q: asyncio.Queue = asyncio.Queue(maxsize=500)
        self.subscribers.add(q)
        return q

    def unsubscribe(self, q: asyncio.Queue):
        self.subscribers.discard(q)

    async def broadcast(self, event_type: str, data: Dict[str, Any]):
        message = {"event": event_type, "data": data}
        for q in list(self.subscribers):
            try:
                q.put_nowait(message)
            except asyncio.QueueFull:
                # A stalled client must never block the analysis pipeline.
                self.unsubscribe(q)


broadcaster = EventBroadcaster()
