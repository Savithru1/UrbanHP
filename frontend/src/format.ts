import type { MemoryStatus, RecommendationSource, WorkStatus } from './types';

/** The page's few colours, for the places that need one outside the stylesheet (map pins, status dots). */
export const TONE = { accent: '#24558a', good: '#2a7a4b', warn: '#8f610d', bad: '#b23a30', dim: '#6b6c70' };

/** One colour per severity level: dark enough to read as text on the light page. */
export const SEVERITY_COLOR: Record<number, string> = {
  1: '#6b6c70',
  2: '#8a6a14',
  3: '#a55a0f',
  4: '#b84a1b',
  5: '#b23a30',
};

export const severityColor = (severity: number | null | undefined) => SEVERITY_COLOR[severity ?? 0] ?? TONE.dim;

export const WORK_STATUS: Record<WorkStatus, { label: string; color: string }> = {
  open: { label: 'Open', color: TONE.dim },
  in_progress: { label: 'Work recorded', color: TONE.accent },
  resolved: { label: 'Resolved', color: TONE.good },
  recurred: { label: 'Came back', color: TONE.bad },
};

export const MEMORY_STATUS: Record<MemoryStatus, { label: string; color: string }> = {
  validated: { label: 'Validated', color: TONE.good },
  draft: { label: 'Draft', color: TONE.warn },
  retired: { label: 'Retired', color: TONE.dim },
};

export const SOURCE_LABEL: Record<RecommendationSource, string> = {
  memory: 'From a lesson learned here',
  history: 'From the history of this place',
  standard_procedure: 'Standard procedure',
};

/** "11 Oct 2026, 09:40" in the reader's own time zone. */
export const dateTime = (iso: string) =>
  new Date(iso).toLocaleString([], { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });

export function timeAgo(iso: string): string {
  const s = Math.max(0, (Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)} d ago`;
  return new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short', year: 'numeric' });
}

export const metres = (m: number) => (m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1)} km`);
