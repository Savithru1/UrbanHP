from datetime import datetime
from typing import List, Optional
from pydantic import BaseModel, Field, ConfigDict

class EvaluationModel(BaseModel):
    id: str = Field(alias="_id")
    incident_id: str
    memory_ids_used: List[str]
    previous_recommendation: Optional[str] = None
    new_recommendation: str
    reasoning_trace: str
    changed_due_to_memory_update: bool = False
    created_at: datetime = Field(default_factory=datetime.utcnow)

    model_config = ConfigDict(
        populate_by_name=True,
        json_encoders={datetime: lambda v: v.isoformat()}
    )

class ReEvaluationRequest(BaseModel):
    incident_id: str
    notes: Optional[str] = "Re-evaluating based on updated city memory"
