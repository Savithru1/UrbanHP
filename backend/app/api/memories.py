import uuid
from datetime import datetime
from typing import Optional, List
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.core.database import get_database
from app.core.events import broadcaster
from app.models.memory import MemoryUpdateModel

router = APIRouter(prefix="/memories", tags=["memories"])

class NewMemoryPayload(BaseModel):
    title: str
    incident_type: str
    location_tag: str
    lesson_learned: str
    historical_action_taken: str
    recorded_outcome: str
    recommended_protocol: str
    recurrence_risk: str = "high"

@router.get("")
@router.get("/")
async def list_memories(category: Optional[str] = None):
    db = get_database()
    query = {}
    if category and category != "all":
        query["incident_type"] = category
    cursor = db.memories.find(query).sort("created_at", -1)
    memories = await cursor.to_list(length=100)
    return memories

@router.get("/{memory_id}")
async def get_memory(memory_id: str):
    db = get_database()
    mem = await db.memories.find_one({"_id": memory_id})
    if not mem:
        raise HTTPException(status_code=404, detail="Memory not found")
        
    events_cursor = db.memory_events.find({"memory_id": memory_id}).sort("timestamp", -1)
    events = await events_cursor.to_list(length=50)
    return {
        "memory": mem,
        "audit_events": events
    }

@router.put("/{memory_id}")
async def update_memory(memory_id: str, payload: MemoryUpdateModel):
    """
    ACT 4 OF DEMO:
    Updates a validated civic memory with new field inspection evidence.
    Also creates an entry in memory_events to preserve audit history!
    """
    db = get_database()
    existing = await db.memories.find_one({"_id": memory_id})
    if not existing:
        raise HTTPException(status_code=404, detail="Memory not found")
        
    now = datetime.utcnow()
    update_dict = {
        "recommended_protocol": payload.recommended_protocol,
        "updated_at": now
    }
    if payload.lesson_learned:
        update_dict["lesson_learned"] = payload.lesson_learned
    if payload.recurrence_risk:
        update_dict["recurrence_risk"] = payload.recurrence_risk
    if payload.is_validated is not None:
        update_dict["is_validated"] = payload.is_validated
        
    await db.memories.update_one({"_id": memory_id}, {"$set": update_dict})
    
    # Audit event record
    event_doc = {
        "_id": f"mev_{uuid.uuid4().hex[:8]}",
        "memory_id": memory_id,
        "event_type": "updated",
        "previous_protocol": existing.get("recommended_protocol"),
        "new_protocol": payload.recommended_protocol,
        "reason": payload.update_reason,
        "timestamp": now
    }
    await db.memory_events.insert_one(event_doc)
    
    updated_memory = await db.memories.find_one({"_id": memory_id})
    await broadcaster.broadcast("memory_update", updated_memory)
    return {
        "status": "updated",
        "memory": updated_memory,
        "event": event_doc
    }

@router.post("/")
async def create_memory(payload: NewMemoryPayload):
    db = get_database()
    now = datetime.utcnow()
    mem_id = f"mem_{uuid.uuid4().hex[:8]}"
    doc = {
        "_id": mem_id,
        "title": payload.title,
        "incident_type": payload.incident_type,
        "location_tag": payload.location_tag,
        "lesson_learned": payload.lesson_learned,
        "historical_action_taken": payload.historical_action_taken,
        "recorded_outcome": payload.recorded_outcome,
        "recommended_protocol": payload.recommended_protocol,
        "recurrence_risk": payload.recurrence_risk,
        "confidence": 0.90,
        "is_validated": True,
        "created_at": now,
        "updated_at": now
    }
    await db.memories.insert_one(doc)
    return doc

@router.get("/graph/universe")
async def get_city_memory_universe_graph():
    """
    Returns structured nodes and edges for the xyflow / React Flow
    'City Memory Universe' screen, linking:
    Incident -> Action -> Outcome -> Validated Memory -> Recommendation
    """
    db = get_database()
    
    incidents = await db.incidents.find({}).limit(15).to_list(length=15)
    memories = await db.memories.find({}).limit(10).to_list(length=10)
    actions = await db.actions.find({}).limit(10).to_list(length=10)
    outcomes = await db.outcomes.find({}).limit(10).to_list(length=10)
    
    nodes = []
    edges = []
    
    # 1. Incident nodes (Column 1)
    y_inc = 50
    for inc in incidents:
        node_id = f"node_inc_{inc['_id']}"
        nodes.append({
            "id": node_id,
            "type": "incidentNode",
            "position": {"x": 50, "y": y_inc},
            "data": {
                "id": inc["_id"],
                "label": inc.get("incident_type", "incident").upper(),
                "type": inc.get("input_type", "text"),
                "status": inc.get("processing_status"),
                "severity": inc.get("severity", "medium"),
                "location": inc.get("location", "Ward 4"),
                "extracted": inc.get("extracted_text", "")[:60] + "..." if inc.get("extracted_text") else "Processing...",
                "doc": inc
            }
        })
        y_inc += 140

    # 2. Memory nodes (Column 2)
    y_mem = 80
    for mem in memories:
        node_id = f"node_mem_{mem['_id']}"
        nodes.append({
            "id": node_id,
            "type": "memoryNode",
            "position": {"x": 420, "y": y_mem},
            "data": {
                "id": mem["_id"],
                "title": mem.get("title"),
                "category": mem.get("incident_type"),
                "lesson": mem.get("lesson_learned", "")[:80] + "...",
                "protocol": mem.get("recommended_protocol", ""),
                "risk": mem.get("recurrence_risk", "high"),
                "doc": mem
            }
        })
        y_mem += 160

    # 3. Action & Outcome nodes (Column 3)
    y_act = 100
    for act in actions:
        act_id = f"node_act_{act['_id']}"
        nodes.append({
            "id": act_id,
            "type": "actionNode",
            "position": {"x": 800, "y": y_act},
            "data": {
                "id": act["_id"],
                "action": act.get("action_type"),
                "dept": act.get("assigned_department"),
                "contractor": act.get("contractor"),
                "doc": act
            }
        })
        y_act += 130
        
    y_out = 100
    for out in outcomes:
        out_id = f"node_out_{out['_id']}"
        nodes.append({
            "id": out_id,
            "type": "outcomeNode",
            "position": {"x": 1150, "y": y_out},
            "data": {
                "id": out["_id"],
                "observation": out.get("observation", "")[:70] + "...",
                "recurrence": out.get("recurrence_detected", False),
                "doc": out
            }
        })
        y_out += 130

    # Edges: link incidents to their memories
    edge_idx = 1
    for inc in incidents:
        related_ids = inc.get("related_memory_ids", [])
        for rel in related_ids:
            mem_target = f"node_mem_{rel}"
            # Check if memory node exists
            if any(n["id"] == mem_target for n in nodes):
                edges.append({
                    "id": f"e_inc_mem_{edge_idx}",
                    "source": f"node_inc_{inc['_id']}",
                    "target": mem_target,
                    "animated": True,
                    "label": "Vector Match",
                    "style": {"stroke": "#38bdf8", "strokeWidth": 2}
                })
                edge_idx += 1

    # Link historical actions to outcomes
    for out in outcomes:
        act_ref = out.get("action_id")
        if act_ref:
            act_source = f"node_act_{act_ref}"
            out_target = f"node_out_{out['_id']}"
            if any(n["id"] == act_source for n in nodes) and any(n["id"] == out_target for n in nodes):
                edges.append({
                    "id": f"e_act_out_{edge_idx}",
                    "source": act_source,
                    "target": out_target,
                    "animated": False,
                    "label": "Led to Outcome",
                    "style": {"stroke": "#f59e0b", "strokeWidth": 2}
                })
                edge_idx += 1

    return {
        "nodes": nodes,
        "edges": edges
    }
