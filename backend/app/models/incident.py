from datetime import datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, ConfigDict
from enum import Enum

class InputType(str, Enum):
    IMAGE = "image"
    VIDEO = "video"
    VOICE = "voice"
    TEXT = "text"

class ProcessingStatus(str, Enum):
    RECEIVED = "received"
    PROCESSING = "processing"
    EXTRACTED = "extracted"
    STRUCTURED = "structured"
    MEMORY_LINKED = "memory_linked"
    COMPLETED = "completed"
    FAILED = "failed"

class VerificationStatus(str, Enum):
    PENDING_REVIEW = "pending_review"
    VERIFIED = "verified"
    REJECTED = "rejected"
    CORRECTED = "corrected"

class IncidentType(str, Enum):
    POTHOLE = "pothole"
    GARBAGE = "garbage"
    STREET_LIGHT = "street_light"
    DRAINAGE = "drainage"
    WATER_LEAK = "water_leak"
    ROAD_CRACK = "road_crack"
    OTHER = "other"

class SeverityLevel(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"

class IncidentModel(BaseModel):
    id: str = Field(alias="_id")
    input_type: InputType
    incident_type: IncidentType = IncidentType.OTHER
    processing_status: ProcessingStatus = ProcessingStatus.RECEIVED
    verification_status: VerificationStatus = VerificationStatus.PENDING_REVIEW
    severity: SeverityLevel = SeverityLevel.MEDIUM
    
    # Textual transformations
    raw_content: Optional[str] = None
    extracted_text: Optional[str] = None
    
    # Metadata & references
    location: Optional[str] = "Ward 4, Sector 7 Junction"
    confidence_score: float = 0.0
    original_file_id: Optional[str] = None
    file_url: Optional[str] = None
    
    # Forensic evidence breakdown
    evidence_summary: Dict[str, Any] = Field(default_factory=dict)
    
    # City memory linkages
    related_memory_ids: List[str] = Field(default_factory=list)
    recommendation: Optional[str] = None
    reasoning_trace: Optional[str] = None
    
    # Progression tracking
    version: int = 1
    processing_stages: List[Dict[str, Any]] = Field(default_factory=list)
    created_at: datetime = Field(default_factory=datetime.utcnow)
    updated_at: datetime = Field(default_factory=datetime.utcnow)

    model_config = ConfigDict(
        populate_by_name=True,
        json_encoders={datetime: lambda v: v.isoformat()}
    )

class IncidentCreateText(BaseModel):
    text: str
    location: Optional[str] = "Main Street, Ward 4"

class IncidentVerifyUpdate(BaseModel):
    verification_status: VerificationStatus
    corrected_category: Optional[IncidentType] = None
    corrected_severity: Optional[SeverityLevel] = None
    correction_notes: Optional[str] = None
