import { useEffect, useMemo, useState } from 'react';
import { ChevronRight, FileText, LoaderCircle, Search, Video, X } from 'lucide-react';
import { api } from '../api';
import { TONE, WORK_STATUS, severityColor, timeAgo } from '../format';
import type { Incident } from '../types';
import { LeafletMap } from './LeafletMap';
import { SkeletonRows } from './Parts';

interface Props {
  /** Null until the list has been loaded for the first time. */
  incidents: Incident[] | null;
  /** Reports that arrived while the page was open and have not been opened yet. */
  unseen?: Set<string>;
  /** The report that is being opened: its row waits, and its picture is the one that grows into the report. */
  opening?: string | null;
  onOpen: (id: string) => void;
}

/** Every report: a list to search, and the pinned ones on a map beside it. */
export function Reports({ incidents: loaded, unseen, opening, onOpen }: Props) {
  const incidents = useMemo(() => loaded ?? [], [loaded]);
  const [query, setQuery] = useState('');
  const [found, setFound] = useState<{ query: string; results: Incident[] } | null>(null);
  const [searching, setSearching] = useState(false);
  const [hovered, setHovered] = useState<string | null>(null);

  // Search as the person types, a moment after they stop.
  const q = query.trim();
  useEffect(() => {
    if (!q) return;
    let stale = false;
    const timer = setTimeout(async () => {
      setSearching(true);
      const results = await api.search(q).catch(() => []);
      if (!stale) {
        setFound({ query: q, results });
        setSearching(false);
      }
    }, 280);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [q]);

  const shown = q && found ? found.results : incidents;
  const placed = useMemo(() => shown.filter((i) => i.geo), [shown]);
  const pins = useMemo(
    () =>
      placed.map((i) => ({
        id: i._id,
        lat: i.geo!.coordinates[1],
        lng: i.geo!.coordinates[0],
        color: severityColor(i.severity),
        label: i.title ?? 'Analyzing',
        active: i._id === hovered,
      })),
    [placed, hovered],
  );

  return (
    <div className="screen flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl">Reports</h1>
          <p className="mt-2 text-lg text-dim">
            {loaded === null ? 'Loading' : q && found ? `${found.results.length} of ${incidents.length} match “${found.query}”` : `${incidents.length} in total, ${incidents.filter((i) => i.geo).length} on the map`}
          </p>
        </div>
        <label className="relative w-full sm:w-96">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-faint" />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search reports" aria-label="Search reports by problem, place or description" className="field h-11 px-10" />
          {searching ? (
            <LoaderCircle className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-faint" />
          ) : (
            query && (
              <button type="button" aria-label="Clear the search" onClick={() => setQuery('')} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-faint hover:text-ink">
                <X className="size-4" />
              </button>
            )
          )}
        </label>
      </header>

      <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,34rem)]">
        {loaded === null ? (
          <SkeletonRows rows={7} thumb />
        ) : shown.length === 0 ? (
          <p className="border-y border-line py-10 text-center text-dim">{q ? 'No report matches that.' : 'No reports yet. They appear here as soon as someone sends one from the public page.'}</p>
        ) : (
          <ul key={q && found ? found.query : ''} className="stagger divide-y divide-line border-y border-line">
            {shown.map((i) => (
              <ReportRow key={i._id} incident={i} isNew={!!unseen?.has(i._id)} opening={opening === i._id} onOpen={onOpen} onHover={setHovered} />
            ))}
          </ul>
        )}

        <aside className="lg:sticky lg:top-24 max-lg:order-first">
          <div className="relative h-64 overflow-hidden rounded-[14px] border border-line lg:h-[calc(100vh-11rem)] lg:max-h-[42rem]">
            <LeafletMap pins={pins} fitKey={placed.map((p) => p._id).join()} onSelect={onOpen} className="size-full" />
            {loaded !== null && placed.length === 0 && (
              <p className="pointer-events-none absolute inset-x-8 top-1/2 z-[500] -translate-y-1/2 rounded-xl border border-line bg-card px-4 py-3 text-center text-dim shadow-sm">
                None of these reports has a pinned position.
              </p>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function ReportRow({ incident: i, isNew, opening, onOpen, onHover }: { incident: Incident; isNew: boolean; opening: boolean; onOpen: (id: string) => void; onHover: (id: string | null) => void }) {
  const thumb = i.media?.kind === 'image' ? i.media.url : i.media?.poster_url;
  const repeat = i.registration?.state === 'already_registered';
  const state = i.status === 'failed' ? { label: 'Failed', color: TONE.bad } : repeat ? { label: 'Already registered', color: TONE.accent } : WORK_STATUS[i.work_status ?? 'open'];
  return (
    <li>
      <button type="button" onClick={() => onOpen(i._id)} onMouseEnter={() => onHover(i._id)} onMouseLeave={() => onHover(null)} aria-busy={opening} className={`row-link group px-2 py-3.5 ${opening ? 'bg-ink/[0.04]' : ''}`}>
        <span className="relative size-14 shrink-0 overflow-hidden rounded-[10px] bg-raised" style={opening && thumb ? { viewTransitionName: 'report-media' } : undefined}>
          {thumb ? (
            <img src={thumb} alt="" loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-105" />
          ) : (
            <span className="flex size-full items-center justify-center text-faint">
              <FileText className="size-5" />
            </span>
          )}
          {i.media?.kind === 'video' && <Video className="absolute bottom-1 right-1 size-3 text-white" />}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-2">
            {i.severity != null && <span className="size-2.5 shrink-0 rounded-full" style={{ background: severityColor(i.severity) }} title={`${i.severity_label} severity`} />}
            <span className="truncate font-medium">{i.title ?? (i.status === 'failed' ? 'Analysis failed' : 'Analyzing')}</span>
            {isNew && <span className="shrink-0 rounded-full bg-accent px-2 text-xs font-semibold leading-5 text-white">New</span>}
          </span>
          <span className="block truncate text-sm text-dim">{i.location ?? i.citizen_text ?? 'No location given'}</span>
        </span>
        <span className="shrink-0 text-right">
          <span className="status justify-end" style={{ color: state.color }}>
            {state.label}
          </span>
          <span className="block text-sm text-faint">{timeAgo(i.created_at)}</span>
        </span>
        {opening ? <LoaderCircle className="size-4 shrink-0 animate-spin text-faint" /> : <ChevronRight className="row-arrow size-4" />}
      </button>
    </li>
  );
}
