import type { Action, DatabaseOverview, Health, Impact, Incident, IncidentDetail, Memory, MemoryStatus, Outcome, PinnedPlace, PublicReport, Rating, Reevaluation } from './types';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    const detail = body?.detail;
    throw new Error(typeof detail === 'string' ? detail : detail?.[0]?.msg ?? `Request failed (${res.status})`);
  }
  return res.json();
}

const send = <T>(method: string, url: string, body?: unknown) =>
  request<T>(url, { method, headers: body ? { 'Content-Type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined });

export interface LessonInput {
  title: string;
  lesson_learned: string;
  recommended_protocol: string;
  incident_id?: string;
  issue_type_id?: string;
  location_tag?: string;
  status?: MemoryStatus;
}

export const api = {
  submit(input: { file?: File | null; text?: string; location?: string; place?: PinnedPlace | null }): Promise<Incident> {
    const form = new FormData();
    if (input.file) form.append('file', input.file);
    if (input.text?.trim()) form.append('text', input.text.trim());
    if (input.location?.trim()) form.append('location', input.location.trim());
    if (input.place) {
      form.append('latitude', String(input.place.lat));
      form.append('longitude', String(input.place.lng));
      form.append('location_source', input.place.source);
      if (input.place.accuracy != null) form.append('accuracy_m', String(input.place.accuracy));
    }
    return request('/api/incidents', { method: 'POST', body: form });
  },
  list: (limit = 200) => request<Incident[]>(`/api/incidents?limit=${limit}`),
  // A backend started before follow-ups existed sends no actions or lessons: treat that as none.
  search: (q: string) => request<Incident[]>(`/api/incidents/search?q=${encodeURIComponent(q)}`),
  get: (id: string) => request<IncidentDetail>(`/api/incidents/${id}`),
  remove: (id: string) => send<{ status: string }>('DELETE', `/api/incidents/${id}`),
  health: () => request<Health>('/api/health'),
  /** The trimmed view of a report that the public page is allowed. */
  publicReport: (id: string) => request<PublicReport>(`/api/public/reports/${id}`),
  database: () => request<DatabaseOverview>('/api/database'),

  // After analysis: checking, acting, learning
  verify: (detectionId: string, status: 'open' | 'confirmed' | 'rejected') => send('PATCH', `/api/detections/${detectionId}`, { status }),
  addAction: (incidentId: string, body: { action_type: string; notes: string }) => send<Action>('POST', `/api/incidents/${incidentId}/actions`, body),
  addOutcome: (actionId: string, body: { observation: string; recurrence_detected: boolean; days_to_recurrence?: number | null }) =>
    send<Outcome>('POST', `/api/actions/${actionId}/outcomes`, body),
  rate: (incidentId: string, rating: Rating | null) => send('POST', `/api/incidents/${incidentId}/feedback`, { rating }),
  reevaluate: (incidentId: string) => send<Reevaluation>('POST', `/api/incidents/${incidentId}/reevaluate`),

  // Memory and its lab
  memories: () => request<Memory[]>('/api/memories'),
  addMemory: (body: LessonInput) => send<Memory>('POST', '/api/memories', body),
  editMemory: (id: string, body: Partial<LessonInput>) => send<Memory>('PATCH', `/api/memories/${id}`, body),
  removeMemory: (id: string) => send<{ reevaluated: number }>('DELETE', `/api/memories/${id}`),
  impact: () => request<Impact>('/api/lab/impact'),
  reevaluateAll: () => send<{ evaluated: number; changed: Reevaluation[] }>('POST', '/api/lab/reevaluate'),
};

/** Turns a position into a short street-level name. Returns null when the lookup is unavailable. */
export async function nameOfPlace(lat: number, lng: number, signal?: AbortSignal): Promise<string | null> {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=18&lat=${lat}&lon=${lng}`, { signal });
    if (!res.ok) return null;
    const a = (await res.json()).address ?? {};
    const parts = [a.road ?? a.pedestrian ?? a.neighbourhood, a.suburb ?? a.village ?? a.town, a.city ?? a.state_district ?? a.county];
    const unique = parts.filter((p, i) => p && parts.indexOf(p) === i);
    return unique.length ? unique.join(', ') : null;
  } catch {
    return null;
  }
}
