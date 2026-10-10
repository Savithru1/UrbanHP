import { Incident, Memory, SystemStats, VerificationStatus, IncidentCategory, SeverityLevel } from '../types';

const API_BASE = '/api';

export const api = {
  // Incidents
  async getIncidents(category?: string): Promise<Incident[]> {
    const url = category && category !== 'all' ? `${API_BASE}/incidents?category=${category}` : `${API_BASE}/incidents`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch incidents');
    return res.json();
  },

  async getIncident(id: string): Promise<Incident> {
    const res = await fetch(`${API_BASE}/incidents/${id}`);
    if (!res.ok) throw new Error('Failed to fetch incident');
    return res.json();
  },

  async submitText(text: string, location?: string): Promise<Incident> {
    const res = await fetch(`${API_BASE}/incidents/text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, location: location || 'Ward 4, Sector 7' }),
    });
    if (!res.ok) throw new Error('Failed to submit text incident');
    return res.json();
  },

  async uploadMedia(file: File, inputType: 'image' | 'video' | 'voice', location?: string): Promise<Incident> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('input_type', inputType);
    formData.append('location', location || 'Ward 4, Sector 7');

    const res = await fetch(`${API_BASE}/incidents/upload`, {
      method: 'POST',
      body: formData,
    });
    if (!res.ok) throw new Error('Failed to upload media incident');
    return res.json();
  },

  async reEvaluateIncident(id: string): Promise<{ status: string; incident: Incident; evaluation: any }> {
    const res = await fetch(`${API_BASE}/incidents/${id}/re-evaluate`, {
      method: 'POST',
    });
    if (!res.ok) throw new Error('Failed to re-evaluate incident');
    return res.json();
  },

  async verifyIncident(id: string, payload: {
    verification_status: VerificationStatus;
    corrected_category?: IncidentCategory;
    corrected_severity?: SeverityLevel;
    correction_notes?: string;
  }): Promise<Incident> {
    const res = await fetch(`${API_BASE}/incidents/${id}/verify`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to verify incident');
    return res.json();
  },

  async deleteIncident(id: string): Promise<{ status: string }> {
    const res = await fetch(`${API_BASE}/incidents/${id}`, {
      method: 'DELETE',
    });
    if (!res.ok) throw new Error('Failed to delete incident');
    return res.json();
  },

  // Memories
  async getMemories(category?: string): Promise<Memory[]> {
    const url = category && category !== 'all' ? `${API_BASE}/memories?category=${category}` : `${API_BASE}/memories`;
    const res = await fetch(url);
    if (!res.ok) throw new Error('Failed to fetch memories');
    return res.json();
  },

  async getMemory(id: string): Promise<{ memory: Memory; audit_events: any[] }> {
    const res = await fetch(`${API_BASE}/memories/${id}`);
    if (!res.ok) throw new Error('Failed to fetch memory detail');
    return res.json();
  },

  async updateMemory(id: string, payload: {
    recommended_protocol: string;
    lesson_learned?: string;
    recurrence_risk?: string;
    is_validated?: boolean;
    update_reason?: string;
  }): Promise<{ status: string; memory: Memory; event: any }> {
    const res = await fetch(`${API_BASE}/memories/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) throw new Error('Failed to update memory');
    return res.json();
  },

  async getMemoryUniverseGraph(): Promise<{ nodes: any[]; edges: any[] }> {
    const res = await fetch(`${API_BASE}/memories/graph/universe`);
    if (!res.ok) throw new Error('Failed to fetch memory universe graph');
    return res.json();
  },

  // Stats & Health
  async getSystemStats(): Promise<SystemStats> {
    const res = await fetch(`${API_BASE}/stats/overview`);
    if (!res.ok) throw new Error('Failed to fetch system stats');
    return res.json();
  },

  async getHealth(): Promise<{ status: string; database: any }> {
    const res = await fetch(`${API_BASE}/health`);
    if (!res.ok) throw new Error('Failed to fetch health');
    return res.json();
  },
};
