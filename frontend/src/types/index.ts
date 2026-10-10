export type InputType = 'image' | 'video' | 'voice' | 'text';

export type ProcessingStatus = 
  | 'received' 
  | 'processing' 
  | 'extracted' 
  | 'structured' 
  | 'memory_linked' 
  | 'completed' 
  | 'failed';

export type VerificationStatus = 
  | 'pending_review' 
  | 'verified' 
  | 'rejected' 
  | 'corrected';

export type IncidentCategory = 
  | 'pothole' 
  | 'garbage' 
  | 'street_light' 
  | 'drainage' 
  | 'water_leak' 
  | 'road_crack' 
  | 'other';

export type SeverityLevel = 'low' | 'medium' | 'high' | 'critical';

export interface ProcessingStage {
  stage: string;
  timestamp: string;
  detail?: string;
}

export interface BoundingBox {
  x: number;
  y: number;
  width: number;
  height: number;
  label: string;
  confidence: number;
  severity?: string;
}

export interface MatchedIncident {
  matched: boolean;
  incident_id?: string;
  title?: string;
  previous_date?: string;
  previous_action?: string;
  previous_outcome?: string;
  recurrence_count?: number;
  match_confidence?: number;
  status: string;
  message?: string;
}

export interface Incident {
  _id: string;
  input_type: InputType;
  incident_type: IncidentCategory;
  processing_status: ProcessingStatus;
  verification_status: VerificationStatus;
  severity: SeverityLevel;
  raw_content?: string;
  extracted_text?: string;
  location?: string;
  confidence_score: number;
  original_file_id?: string;
  file_url?: string;
  bounding_box?: BoundingBox;
  matched_incident?: MatchedIncident;
  evidence_summary: Record<string, any>;
  related_memory_ids: string[];
  recommendation?: string;
  reasoning_trace?: string;
  version: number;
  before_snapshot?: Record<string, any>;
  processing_stages: ProcessingStage[];
  created_at: string;
  updated_at: string;
}

export interface Memory {
  _id: string;
  title: string;
  incident_type: string;
  location_tag: string;
  lesson_learned: string;
  historical_action_taken: string;
  recorded_outcome: string;
  recurrence_risk: string;
  recommended_protocol: string;
  confidence: number;
  is_validated: boolean;
  created_at: string;
  updated_at: string;
}

export interface SystemStats {
  metrics: {
    total_incidents: number;
    completed_rate: number;
    verified_count: number;
    total_memories: number;
    historical_actions: number;
    recorded_outcomes: number;
  };
  by_input_type: {
    image: number;
    video: number;
    voice: number;
    text: number;
  };
  by_category: Record<string, number>;
  by_severity: Record<string, number>;
  database_info: {
    connected: boolean;
    host: string;
    database: string;
  };
}

export interface MemoryAuditEvent {
  _id: string;
  memory_id: string;
  event_type: string;
  previous_protocol?: string;
  new_protocol: string;
  reason: string;
  timestamp: string;
}
