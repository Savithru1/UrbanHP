from datetime import datetime
from typing import Optional, Dict, Any
from pydantic import BaseModel, Field, ConfigDict

class MediaAssetModel(BaseModel):
    id: str = Field(alias="_id")
    incident_id: str
    file_name: str
    file_type: str
    file_size_bytes: int
    storage_path: str
    url: str
    metadata: Dict[str, Any] = Field(default_factory=dict)
    created_at: datetime = Field(default_factory=datetime.utcnow)

    model_config = ConfigDict(
        populate_by_name=True,
        json_encoders={datetime: lambda v: v.isoformat()}
    )
