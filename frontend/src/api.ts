import type { Health, Incident, IncidentDetail } from './types';

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.detail ?? `Request failed (${res.status})`);
  }
  return res.json();
}

export const api = {
  submit(input: { file?: File | null; text?: string; location?: string }): Promise<Incident> {
    const form = new FormData();
    if (input.file) form.append('file', input.file);
    if (input.text?.trim()) form.append('text', input.text.trim());
    if (input.location?.trim()) form.append('location', input.location.trim());
    return request('/api/incidents', { method: 'POST', body: form });
  },
  list: () => request<Incident[]>('/api/incidents'),
  get: (id: string) => request<IncidentDetail>(`/api/incidents/${id}`),
  remove: (id: string) => request<{ status: string }>(`/api/incidents/${id}`, { method: 'DELETE' }),
  health: () => request<Health>('/api/health'),
};
