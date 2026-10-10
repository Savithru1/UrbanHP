from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, ConfigDict

class MemoryModel(BaseModel):
    id: str = Field(alias="_id")
    title: str
    incident_type: str
    location_tag: str
    lesson_learned: str
    historical_action_taken: str
    recorded_outcome: str
    recurrence_risk: str = "high"  # low, medium, high, critical
    recommended_protocol: str
    confidence: float = 0.88
    is_validated: bool = True
    embedding: Optional[List[float]] = None
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    model_config = ConfigDict(
        populate_by_name=True,
        json_encoders={datetime: lambda v: v.isoformat()}
    )

class MemoryUpdateModel(BaseModel):
    lesson_learned: Optional[str] = None
    recommended_protocol: str
    recurrence_risk: Optional[str] = None
    is_validated: Optional[bool] = None
    update_reason: str = "Field inspection verified failure of previous protocol"

class MemoryEventModel(BaseModel):
    id: str = Field(alias="_id")
    memory_id: str
    event_type: str  # created, updated, superseded, verified
    previous_protocol: Optional[str] = None
    new_protocol: str
    reason: str
    timestamp: datetime = Field(default_factory=datetime.utcnow)

class ActionModel(BaseModel):
    id: str = Field(alias="_id")
    incident_id: str
    action_type: str
    assigned_department: str
    contractor: Optional[str] = None
    notes: str
    status: str = "completed"
    created_at: datetime = Field(default_factory=datetime.utcnow)

class OutcomeModel(BaseModel):
    id: str = Field(alias="_id")
    action_id: str
    incident_id: str
    observation: str
    recurrence_detected: bool = False
    days_to_recurrence: Optional[int] = None
    inspector_notes: str
    created_at: datetime = Field(default_factory=datetime.utcnow)
