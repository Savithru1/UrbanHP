import { ChevronRight } from 'lucide-react';
import type { DbUpdate } from '../types';

const ACTION: Record<DbUpdate['action'], { label: string; tone: string }> = {
  created: { label: 'Created', tone: 'text-good' },
  updated: { label: 'Updated', tone: 'text-accent' },
  deleted: { label: 'Deleted', tone: 'text-bad' },
};

const clock = (iso: string) => new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
const day = (iso: string) => new Date(iso).toLocaleDateString([], { day: 'numeric', month: 'short' });

/** A stored value as one short line of text. */
function show(value: unknown): string {
  if (value === null || value === undefined) return 'null';
  if (typeof value === 'string') return value.length > 140 ? `${value.slice(0, 137)}…` : value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  const json = JSON.stringify(value);
  return json.length > 160 ? `${json.slice(0, 157)}…` : json;
}

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** One changed field: what it was and what it is now, or what was added to or removed from a list. */
function Change({ field, value }: { field: string; value: unknown }) {
  let body: React.ReactNode = show(value);
  if (isObject(value)) {
    if ('from' in value && 'to' in value) {
      body = (
        <>
          <span className="text-faint">{show(value.from)}</span>
          <span className="mx-2 text-faint">→</span>
          {show(value.to)}
        </>
      );
    } else if ('added' in value) {
      body = (
        <>
          <span className="text-good">added</span> {show(value.added)}
        </>
      );
    } else if ('removed' in value) {
      body = (
        <>
          <span className="text-bad">removed</span> {show(value.removed)}
        </>
      );
    }
  }
  return (
    <>
      <dt className="text-dim">{field}</dt>
      <dd className="min-w-0 break-words">{body}</dd>
    </>
  );
}

interface Props {
  entries: DbUpdate[];
  /** Entries that have just arrived: they are tinted for a moment. */
  fresh?: Set<string>;
  /** Columns side by side (a full page) instead of two stacked lines (a sidebar). */
  wide?: boolean;
  /** Lets a write be traced to the report it belongs to. */
  onOpen?: (incidentId: string) => void;
}

/**
 * Writes to MongoDB, one per line: when, what kind, which collection and document, and why.
 * A line opens to show the fields it wrote. Used for the whole database and for a single report.
 */
export function ActivityList({ entries, fresh, wide, onOpen }: Props) {
  if (entries.length === 0) return <p className="py-6 text-dim">No writes yet.</p>;

  return (
    <ol className="divide-y divide-line">
      {entries.map((e) => {
        const action = ACTION[e.action] ?? ACTION.updated;
        const changes = Object.entries(e.changes ?? {});
        return (
          <li key={e._id} className={fresh?.has(e._id) ? 'flash' : undefined}>
            <details className="group">
              <summary
                className={`cursor-pointer list-none rounded-lg px-2 py-2.5 transition-colors hover:bg-ink/[0.04] [&::-webkit-details-marker]:hidden ${
                  wide ? 'grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 lg:grid-cols-[8.5rem_4.5rem_8rem_minmax(0,1fr)_auto] lg:items-baseline' : 'grid grid-cols-[minmax(0,1fr)_auto] gap-x-3'
                }`}
              >
                {wide ? (
                  // On a narrow screen the four columns collapse into the first one, one under another.
                  <span className="contents max-lg:block max-lg:min-w-0">
                    <time className="whitespace-nowrap font-mono text-[13px] text-faint max-lg:mr-3" dateTime={e.at} title={new Date(e.at).toLocaleString()}>
                      {day(e.at)} {clock(e.at)}
                    </time>
                    <span className={`text-sm font-semibold max-lg:mr-3 ${action.tone}`}>{action.label}</span>
                    <span className="truncate font-mono text-[13px]">{e.collection}</span>
                    <span className="min-w-0 max-lg:mt-0.5 max-lg:block">
                      <span className="block">{e.summary}</span>
                      <span className="block truncate font-mono text-[13px] text-faint">{e.document_id}</span>
                    </span>
                  </span>
                ) : (
                  <>
                    <span className="min-w-0">
                      <span className="flex items-baseline gap-2">
                        <span className={`text-sm font-semibold ${action.tone}`}>{action.label}</span>
                        <span className="truncate font-mono text-[13px]">{e.collection}</span>
                        <time className="ml-auto shrink-0 font-mono text-[13px] text-faint" dateTime={e.at}>
                          {clock(e.at)}
                        </time>
                      </span>
                      <span className="mt-0.5 block text-[15px] text-dim">{e.summary}</span>
                    </span>
                  </>
                )}
                <ChevronRight className="size-4 self-center text-faint transition-transform group-open:rotate-90" />
              </summary>

              <div className={`fade-in pb-4 pr-2 ${wide ? 'pl-2 lg:pl-[24.5rem]' : 'pl-2'}`}>
                {changes.length > 0 ? (
                  <dl className="grid grid-cols-[minmax(0,auto)_minmax(0,1fr)] gap-x-5 gap-y-1 rounded-[10px] bg-raised/60 px-4 py-3 font-mono text-[13px] leading-relaxed">
                    <dt className="text-dim">_id</dt>
                    <dd className="min-w-0 break-words">{e.document_id}</dd>
                    {changes.map(([field, value]) => (
                      <Change key={field} field={field} value={value} />
                    ))}
                  </dl>
                ) : (
                  <p className="font-mono text-[13px] text-faint">{e.document_id}</p>
                )}
                {onOpen && e.links.incident_id && e.action !== 'deleted' && (
                  <button type="button" onClick={() => onOpen(e.links.incident_id!)} className="btn btn-quiet btn-sm mt-2 -ml-2">
                    Open the report it belongs to
                  </button>
                )}
              </div>
            </details>
          </li>
        );
      })}
    </ol>
  );
}
