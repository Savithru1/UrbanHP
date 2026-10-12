import { useEffect, useMemo, useState } from 'react';
import { api } from '../api';
import { TONE } from '../format';
import type { DatabaseOverview, DbUpdate } from '../types';
import { ActivityList } from './Activity';
import { Count, Skeleton, SkeletonRows } from './Parts';

interface Props {
  onOpen: (incidentId: string) => void;
}

/**
 * MongoDB, watched from the admin page: the collections and how many documents each holds,
 * and every write as it happens — the same record Compass shows in `activity_log`.
 */
export function Database({ onOpen }: Props) {
  const [data, setData] = useState<DatabaseOverview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [only, setOnly] = useState<string | null>(null);
  const [live, setLive] = useState(false);
  // Writes that arrived while the page was open, tinted briefly so they catch the eye.
  const [fresh, setFresh] = useState<Set<string>>(() => new Set());

  useEffect(() => {
    api.database().then(setData).catch(() => setError('The database view could not load. Is the backend running?'));

    const source = new EventSource('/api/stream/events');
    source.onopen = () => setLive(true);
    source.onerror = () => setLive(false);
    source.onmessage = (e) => {
      const { event, data: entry } = JSON.parse(e.data) as { event: string; data: DbUpdate };
      if (event !== 'update') return;
      setData((d) => {
        if (!d || d.activity.some((a) => a._id === entry._id)) return d;
        const step = entry.action === 'created' ? 1 : entry.action === 'deleted' ? -1 : 0;
        return {
          ...d,
          // Every write is itself one more document in activity_log.
          collections: d.collections.map((c) => ({ ...c, count: c.count + (c.name === entry.collection ? step : 0) + (c.name === 'activity_log' ? 1 : 0) })),
          activity: [entry, ...d.activity].slice(0, 300),
        };
      });
      setFresh((f) => new Set(f).add(entry._id));
    };
    return () => source.close();
  }, []);

  const shown = useMemo(() => (data ? (only ? data.activity.filter((a) => a.collection === only) : data.activity) : []), [data, only]);

  if (!data) {
    if (error) return <p className="text-bad">{error}</p>;
    return (
      <div className="flex flex-col gap-9" aria-busy="true">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-5 w-1/2 max-w-md" />
        </div>
        <Skeleton className="h-24 w-full rounded-[14px]" />
        <SkeletonRows rows={6} />
      </div>
    );
  }

  return (
    <div className="screen flex flex-col gap-9">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl">Database</h1>
          <p className="mt-2 text-lg text-dim">
            Every write to <span className="font-mono text-base text-ink">{data.database}</span> in MongoDB, as it happens.
          </p>
        </div>
        <span className={`status ${live ? 'is-live' : ''}`} style={{ color: live ? TONE.good : TONE.dim }}>
          <span className="text-dim">{live ? 'Live' : 'Reconnecting'}</span>
        </span>
      </header>

      <section>
        <h2 className="label mb-2">Collections</h2>
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[14px] border border-line bg-line sm:grid-cols-4 xl:grid-cols-8">
          {data.collections.map((c) => (
            <button
              key={c.name}
              type="button"
              aria-pressed={only === c.name}
              onClick={() => setOnly(only === c.name ? null : c.name)}
              title={`Show only writes to ${c.name}`}
              className={`flex flex-col gap-1 px-4 py-3.5 text-left transition-colors ${only === c.name ? 'bg-ink text-white' : 'bg-surface hover:bg-raised'}`}
            >
              <span className={`truncate font-mono text-[13px] ${only === c.name ? 'text-white/70' : 'text-dim'}`}>{c.name}</span>
              <span className="text-2xl font-semibold">
                <Count value={c.count} />
              </span>
            </button>
          ))}
        </div>
      </section>

      <section>
        <div className="mb-1 flex items-baseline justify-between gap-3">
          <h2 className="text-xl font-semibold">
            Writes{only && <span className="ml-2 font-mono text-base font-normal text-dim">{only}</span>}
          </h2>
          {only ? (
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setOnly(null)}>
              Show all collections
            </button>
          ) : (
            <span className="text-sm text-faint">Latest {shown.length}, newest first</span>
          )}
        </div>
        <ActivityList entries={shown} fresh={fresh} wide onOpen={onOpen} />
      </section>
    </div>
  );
}
