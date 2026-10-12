/** A box as fractions (0-1) of the frame; x, y is the top-left corner. */
export interface BBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The outline of an object: [x, y] points as fractions (0-1) of the frame. */
export type Outline = [number, number][];

/** A position as MongoDB stores it: GeoJSON, longitude first. */
export interface GeoPoint {
  type: 'Point';
  coordinates: [number, number];
}

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
  /** Set by a person checking the detection. Rejected ones no longer count towards the report. */
  status: 'open' | 'confirmed' | 'rejected';
  /** Where the object was in each analysed frame of a video. */
  video?: { first_seen_s: number; last_seen_s: number; frames_seen: number; path: (BBox & { t: number; mask: Outline | null })[] };
  text?: { evidence: string; matched_keyword: string };
  model: { name: string; scores: Record<string, number> };
  links: { incident_id: string; media_id: string | null; issue_type_id: string; memory_ids: string[] };
}

/** The part of a detection that is drawn on the picture and named beside it. */
export type DrawnDetection = Pick<
  Detection,
  '_id' | 'label' | 'severity' | 'severity_label' | 'confidence' | 'bbox' | 'mask' | 'approximate_location' | 'source' | 'status' | 'video'
> & { links: { issue_type_id: string } };

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

/** A pointer to the MongoDB document a piece of advice came from. */
export interface DocRef {
  collection: string;
  id: string;
}

export type RecommendationSource = 'memory' | 'history' | 'standard_procedure';

/** How soon a report should be acted on, with the reasons for that level. */
export interface Priority {
  level: 'low' | 'medium' | 'high' | 'urgent';
  label: string;
  /** "Act within 24 hours". */
  respond: string;
  /** 1 (low) to 4 (urgent). */
  rank: number;
  reasons: string[];
}

export interface Recommendation {
  /** The order in a few words: "Repair 3 potholes". */
  headline?: string;
  /** The same advice as one sentence. */
  text: string;
  source: RecommendationSource;
  memory_id: string | null;
  because: string | null;
  priority?: Priority;
  /** Who handles the main problem. */
  department?: string;
  /** The plan, in order. A `similar_case` entry is a hint from elsewhere, not a step. */
  steps?: { text: string; basis: 'memory' | 'history' | 'similar_case' | 'standard'; ref: DocRef | null }[];
  /** The other kinds of problem in the same report, each with its own department and action. */
  also?: { issue_type_id: string; what: string; department: string; action: string; basis: 'memory' | 'standard' }[];
  /** What the crew needs with them. */
  equipment?: string[];
  /** What was tried at this place before and did not hold. */
  avoid?: { text: string; because: string | null; ref: DocRef | null }[];
  evidence?: (DocRef & { label: string; relation: string; relevance?: number | null; distance_m?: number | null })[];
  /** What would have been recommended with no memory at all. */
  baseline?: string;
}

export type WorkStatus = 'open' | 'in_progress' | 'resolved' | 'recurred';

/** What a report is, decided by the reports made before it. */
export interface Registration {
  /** new: nothing like it here before. already_registered: one more report of an open case. recurrence: it was dealt with here and is back. */
  state: 'new' | 'already_registered' | 'recurrence';
  /** The report that stands for the problem (this one, unless it was filed under an open case). */
  case_id: string;
  report_number: number;
  first_reported_at: string;
  departments: string[];
  /** For a recurrence: the earlier, closed report. */
  previous_id: string | null;
  matched_by: 'place' | 'file' | null;
  /** The sentence shown to the person reporting. */
  message: string;
}

/** Something that was done about a past report, and how it turned out. */
export interface Attempt {
  action_id: string;
  what: string;
  result: 'held' | 'came_back' | 'pending';
  observation: string | null;
  days: number | null;
}

/** A past report retrieved for this one: from the same place, or a similar case elsewhere. */
export interface PastCase {
  incident_id: string;
  title: string | null;
  location: string | null;
  created_at: string;
  work_status: WorkStatus;
  tried: Attempt[];
  distance_m: number | null;
  /** How closely its description matches this report's (0-1), when both have one. */
  similarity?: number | null;
  /** Another report of the same open case, rather than a separate occurrence. */
  same_case?: boolean;
}
export type Rating = 'helpful' | 'not_helpful';

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
  geo?: GeoPoint | null;
  location_source?: 'gps' | 'pin' | 'photo' | 'typed' | 'text' | null;
  location_accuracy_m?: number | null;
  severity: number | null;
  severity_label: string | null;
  departments?: string[];
  detection_count: number;
  is_recurring: boolean;
  work_status?: WorkStatus;
  registration?: Registration | null;
  /** On a case: how many times the problem has been reported. */
  report_count?: number | null;
  /** Present on search results: how well it matched and how. */
  match?: { score: number; why: 'keyword' | 'meaning' };
  error?: string;
  recommendation: Recommendation | null;
  feedback?: { rating: Rating; at: string } | null;
  analysis: { device?: string; frames_analyzed?: number; sample_interval_s?: number; duration_ms?: number } | null;
  links: { media_id: string | null; detection_ids: string[]; issue_type_ids: string[]; memory_ids: string[]; related_incident_ids: string[]; action_ids?: string[] };
  created_at: string;
  media?: Media | null;
}

export type MemoryStatus = 'draft' | 'validated' | 'retired';

export interface Memory {
  _id: string;
  title: string;
  status: MemoryStatus;
  location_tag: string | null;
  lesson_learned: string;
  recommended_protocol: string;
  historical_action_taken?: string | null;
  recorded_outcome?: string | null;
  recurrence_risk?: 'low' | 'medium' | 'high' | 'critical';
  /** How many reports it was attached to as evidence. */
  times_used: number;
  /** How many reports it decided the recommendation for. */
  decided?: number;
  issue_label?: string | null;
  is_seed?: boolean;
  links: { issue_type_id: string; learned_from_incident_ids: string[]; used_by_incident_ids: string[] };
}

export interface Outcome {
  _id: string;
  observation: string;
  recurrence_detected: boolean;
  days_to_recurrence: number | null;
  created_at: string;
}

export interface Action {
  _id: string;
  action_type: string;
  notes: string;
  assigned_department: string | null;
  created_at: string;
  outcomes: Outcome[];
}

/** One entry of the `activity_log` collection: a single change made to the database. */
export interface DbUpdate {
  _id: string;
  at: string;
  action: 'created' | 'updated' | 'deleted';
  collection: string;
  document_id: string;
  summary: string;
  /** Created: the fields written. Updated: each changed field as { from, to }, { added } or { removed }. */
  changes?: Record<string, unknown>;
  links: { incident_id: string | null };
}

/** The database as the admin page shows it: its collections, and the latest writes. */
export interface DatabaseOverview {
  database: string;
  collections: { name: string; count: number }[];
  activity: DbUpdate[];
}

/** What the picture viewer needs of a report: enough to draw it, whoever is looking. */
export interface Scannable {
  incident: { _id: string; status: Incident['status']; analysis: { sample_interval_s?: number | null } | null };
  media: Media | null;
  detections: DrawnDetection[];
}

/** A report as the person who sent it may see it. */
export interface PublicReport extends Scannable {
  incident: {
    _id: string;
    status: Incident['status'];
    input_type: Incident['input_type'];
    created_at: string;
    title: string | null;
    citizen_text: string | null;
    location: string | null;
    severity: number | null;
    severity_label: string | null;
    departments: string[] | null;
    error?: string | null;
    analysis: { sample_interval_s?: number | null } | null;
    registration: Pick<Registration, 'state' | 'message' | 'report_number'> | null;
  };
}

export interface IncidentDetail {
  incident: Incident;
  detections: Detection[];
  media: Media | null;
  /** Lessons that bear on this report. */
  memories: Memory[];
  /** For a repeat report: the case it was filed under. */
  case: { _id: string; title: string | null; location: string | null; created_at: string; work_status: WorkStatus; report_count?: number } | null;
  /** What is on record: other reports at this place, and similar cases elsewhere. */
  history: { here: PastCase[]; similar: PastCase[] };
  /** What was done about the report, each action with what was found afterwards. */
  actions: Action[];
  /** Lessons that were drawn from this report. */
  lessons: Memory[];
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

export interface ImpactGroup {
  reports: number;
  helpful: number;
  not_helpful: number;
  resolved: number;
  recurred: number;
}

export interface ImpactRow {
  _id: string;
  title: string | null;
  location: string | null;
  created_at: string;
  severity: number | null;
  source: RecommendationSource;
  text: string;
  baseline: string | null;
  because: string | null;
  avoid: number;
  evidence: number;
  rating: Rating | null;
  work_status: WorkStatus;
  is_recurring: boolean;
}

/** What memory changes: reports split by whether memory shaped their recommendation. */
export interface Impact {
  /** Every report submitted. */
  total_reports: number;
  /** Reports that were given a recommendation. */
  reports: number;
  groups: { memory: ImpactGroup; standard: ImpactGroup };
  memories: { validated: number; draft: number; retired: number; in_use: number };
  open_reports: number;
  recurring_reports: number;
  rows: ImpactRow[];
}

export interface Reevaluation {
  incident_id: string;
  title: string;
  changed: boolean;
  before: Recommendation | null;
  after: Recommendation | null;
}

/** Where a new report is: a position on the map and how it got there. */
export interface PinnedPlace {
  lat: number;
  lng: number;
  accuracy: number | null;
  source: 'gps' | 'pin';
}
