/** A box as fractions (0-1) of the frame; x, y is the top-left corner. */
export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The outline of an object: [x, y] points as fractions (0-1) of the frame. */
export type Outline = [number, number][];

/** What gets drawn on the viewer: a saved detection or a live one mid-analysis. */
export interface OverlayBox {
  id: string;
  issue_type: string;
  label: string;
  severity: number;
  confidence: number;
  bbox: BBox;
  mask: Outline | null;
  /** The issue was recognised but could only be placed roughly. */
  approximate_location?: boolean;
}

export interface Detection {
  _id: string;
  label: string;
  severity: number;
  severity_label: string;
  confidence: number;
  bbox: BBox | null;
  mask: Outline | null;
  approximate_location?: boolean;
  source: 'image' | 'video' | 'text';
  department: string;
  suggested_action: string;
  snapshot_url?: string | null;
  /** Where the object was in each analysed frame of a video. */
  video?: { first_seen_s: number; last_seen_s: number; frames_seen: number; path: (BBox & { t: number; mask: Outline | null })[] };
  text?: { evidence: string; matched_keyword: string };
  model: { name: string; scores: Record<string, number> };
  links: { incident_id: string; media_id: string | null; issue_type_id: string; memory_ids: string[] };
}

export interface Media {
  _id: string;
  kind: 'image' | 'video';
  file_name: string;
  url: string;
  width?: number | null;
  height?: number | null;
  poster_url?: string;
  poster_time_s?: number;
}

export interface Incident {
  _id: string;
  input_type: 'image' | 'video' | 'text';
  status: 'received' | 'analyzing' | 'completed' | 'failed';
  /** Goes up by one every time the document is updated in MongoDB. */
  version: number;
  title: string | null;
  summary: string | null;
  citizen_text: string | null;
  location: string | null;
  severity: number | null;
  severity_label: string | null;
  detection_count: number;
  is_recurring: boolean;
  error?: string;
  recommendation: { text: string; source: 'memory' | 'standard_procedure'; memory_id: string | null; because: string | null } | null;
  analysis: { device?: string; frames_analyzed?: number; sample_interval_s?: number; duration_ms?: number } | null;
  links: { media_id: string | null; detection_ids: string[]; issue_type_ids: string[]; memory_ids: string[]; related_incident_ids: string[] };
  created_at: string;
  media?: Media | null;
}

export interface Memory {
  _id: string;
  title: string;
  location_tag: string;
  lesson_learned: string;
  recommended_protocol: string;
}

export interface RelatedIncident {
  _id: string;
  title: string | null;
  location: string | null;
  created_at: string;
}

/** One entry of the `activity_log` collection: a single change made to the database. */
export interface DbUpdate {
  _id: string;
  at: string;
  action: 'created' | 'updated' | 'deleted';
  collection: string;
  document_id: string;
  summary: string;
  links: { incident_id: string | null };
}

export interface IncidentDetail {
  incident: Incident;
  detections: Detection[];
  media: Media | null;
  memories: Memory[];
  related: RelatedIncident[];
  updates: DbUpdate[];
}

/** One analysed frame, pushed live while a report is being processed. */
export interface LiveFrame {
  incident_id: string;
  index: number;
  total: number;
  time_s: number;
  image?: string;
  boxes: OverlayBox[];
}

export interface Health {
  database: { connected: boolean; name: string };
  detector: { status: 'not_loaded' | 'loading' | 'ready' | 'failed'; device: string; error: string | null };
}
