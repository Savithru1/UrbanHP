import { useState } from 'react';
import { Check, Copy, Database, LoaderCircle, MapPin, Trash2 } from 'lucide-react';
import { colorOf } from '../colors';
import type { DbUpdate, IncidentDetail } from '../types';

interface Props {
  detail: IncidentDetail;
  activeId: string | null;
  onHover: (id: string | null) => void;
  onDelete: () => void;
}

const SEVERITY_STYLE: Record<number, string> = {
  1: 'bg-zinc-700/60 text-zinc-200',
  2: 'bg-yellow-500/15 text-yellow-300',
  3: 'bg-amber-500/20 text-amber-300',
  4: 'bg-orange-500/20 text-orange-300',
  5: 'bg-red-500/20 text-red-300',
};

/** What was found, what to do about it, and what was written to MongoDB. */
export function Results({ detail, activeId, onHover, onDelete }: Props) {
  const { incident, detections, media, memories, related, updates } = detail;

  if (incident.status === 'failed') {
    return (
      <div className="flex flex-col gap-5">
        <p className="rounded-lg border border-red-500/40 bg-red-500/10 p-4 text-red-200">Analysis failed: {incident.error ?? 'unknown error'}</p>
        <DatabaseUpdates incidentId={incident._id} version={incident.version} updates={updates} onDelete={onDelete} />
      </div>
    );
  }

  if (incident.status !== 'completed') {
    return (
      <div className="flex flex-col gap-5">
        <p className="flex items-center gap-2 text-muted">
          <LoaderCircle className="size-4 animate-spin" /> Analyzing…
        </p>
        <DatabaseUpdates incidentId={incident._id} version={incident.version} updates={updates} open />
      </div>
    );
  }

  // A lesson learned at this exact place drives the recommendation; otherwise show the closest one for reference.
  const applied = memories.find((m) => m._id === incident.recommendation?.memory_id);
  const lesson = applied ?? memories[0];

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h2 className="text-xl font-semibold">{incident.title}</h2>
        {incident.location && (
          <p className="mt-1 flex items-center gap-1.5 text-sm text-muted">
            <MapPin className="size-4" /> {incident.location}
          </p>
        )}
        {media && incident.citizen_text && <p className="mt-2 text-sm text-muted">“{incident.citizen_text}”</p>}
      </header>

      {detections.length > 0 && (
        <ul className="flex flex-col gap-2">
          {detections.map((d) => (
            <li
              key={d._id}
              onMouseEnter={() => onHover(d._id)}
              onMouseLeave={() => onHover(null)}
              className={`flex gap-3 rounded-lg border p-3 transition-colors ${d._id === activeId ? 'border-zinc-400 bg-white/5' : 'border-line'}`}
            >
              {d.snapshot_url && <img src={d.snapshot_url} alt="" className="size-14 shrink-0 rounded object-cover" />}
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="size-2.5 shrink-0 rounded-sm" style={{ background: colorOf(d.links.issue_type_id).box }} />
                  <span className="font-medium">{d.label}</span>
                  <span className={`rounded px-1.5 py-0.5 text-xs font-medium ${SEVERITY_STYLE[d.severity]}`}>
                    Severity {d.severity} · {d.severity_label}
                  </span>
                </div>
                <p className="mt-0.5 text-sm text-muted">
                  {d.department}
                  {d.source === 'text' ? ' · from the description' : ` · confidence ${d.confidence.toFixed(2)}`}
                  {d.approximate_location && ' · approximate location'}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}

      {incident.recommendation && (
        <section>
          <h3 className="text-sm font-medium text-muted">What to do</h3>
          <p className="mt-1">{incident.recommendation.text}</p>
          {lesson && (
            <p className="mt-2 border-l-2 border-detect pl-3 text-sm text-muted">
              {applied ? 'Learned from a past repair here' : `From a similar case at ${lesson.location_tag}`} — {lesson.lesson_learned}
            </p>
          )}
        </section>
      )}

      {related.length > 0 && (
        <section>
          <h3 className="text-sm font-medium text-muted">Reported before</h3>
          <ul className="mt-1 text-sm">
            {related.map((r) => (
              <li key={r._id}>
                {new Date(r.created_at).toLocaleDateString()} — {r.title ?? r._id}
              </li>
            ))}
          </ul>
        </section>
      )}

      <DatabaseUpdates incidentId={incident._id} version={incident.version} updates={updates} onDelete={onDelete} />
    </div>
  );
}

/** Where the report lives in MongoDB, and every change that was written for it. */
function DatabaseUpdates(props: { incidentId: string; version: number; updates: DbUpdate[]; open?: boolean; onDelete?: () => void }) {
  const [copied, setCopied] = useState(false);
  const filter = `{ _id: "${props.incidentId}" }`;

  return (
    <footer className="border-t border-line pt-4 text-sm text-muted">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Database className="size-4 text-emerald-400" />
        <span>
          Saved in MongoDB · <code className="font-mono text-zinc-300">urbanhp.incidents</code> · version {props.version}
        </span>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(filter);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          title="Copy this filter and paste it into the Compass filter bar"
          className="inline-flex items-center gap-1.5 rounded border border-line px-2 py-1 font-mono text-xs text-zinc-300 hover:border-muted"
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {filter}
        </button>
        {props.onDelete && (
          <button type="button" onClick={props.onDelete} className="ml-auto inline-flex items-center gap-1.5 hover:text-red-300">
            <Trash2 className="size-4" /> Delete
          </button>
        )}
      </div>

      {props.updates.length > 0 && (
        <details className="mt-3" open={props.open}>
          <summary className="cursor-pointer select-none hover:text-zinc-200">
            {props.updates.length} database {props.updates.length === 1 ? 'update' : 'updates'}
          </summary>
          <ol className="mt-2 flex flex-col gap-1.5 font-mono text-xs">
            {props.updates.map((u) => (
              <li key={u._id} className="grid grid-cols-[7.5rem_1fr] gap-x-3">
                <span className="text-zinc-300">{u.collection}</span>
                <span>
                  {u.summary} <span className="text-zinc-600">{u.document_id}</span>
                </span>
              </li>
            ))}
          </ol>
        </details>
      )}
    </footer>
  );
}
