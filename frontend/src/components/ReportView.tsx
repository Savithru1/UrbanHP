import { useMemo, useState } from 'react';
import { ArrowRight, Check, Copy, FileText, MapPin, RefreshCw, ThumbsDown, ThumbsUp, Trash2, Undo2, X } from 'lucide-react';
import { api } from '../api';
import { colorOf } from '../colors';
import { TONE, WORK_STATUS, dateTime, metres, severityColor, timeAgo } from '../format';
import type { Attempt, DbUpdate, Detection, Incident, IncidentDetail, LiveFrame, PastCase, Rating } from '../types';
import { ActivityList } from './Activity';
import { FollowUp } from './FollowUp';
import { LeafletMap } from './LeafletMap';
import { Tabs } from './Parts';
import { Viewer } from './Viewer';

interface Props {
  detail: IncidentDetail;
  live: LiveFrame | null;
  onDelete: () => void;
  /** Something about this report was changed on the server: load it again. */
  onChanged: () => Promise<void>;
  onOpen: (id: string) => void;
}

type Section = 'found' | 'history' | 'followup' | 'database';

const PLACE_SOURCE: Record<string, string> = {
  gps: 'live position',
  pin: 'pinned on the map',
  photo: "from the photo's GPS",
  typed: 'typed in',
  text: 'from the description',
};

/**
 * One report: what it is across the top, the picture on the left, and on the right
 * the recommendation first, then everything it rests on.
 */
export function ReportView({ detail, live, onDelete, onChanged, onOpen }: Props) {
  const { incident, detections, history, updates, media } = detail;
  const [section, setSection] = useState<Section>('found');
  const [activeId, setActiveId] = useState<string | null>(null);
  const done = incident.status === 'completed';
  const failed = incident.status === 'failed';

  const past = history.here.length + history.similar.length;
  const sections: { id: Section; label: string }[] = [
    { id: 'found', label: `Found · ${detections.filter((d) => d.status !== 'rejected').length}` },
    { id: 'history', label: past ? `History · ${past}` : 'History' },
    { id: 'followup', label: 'Follow-up' },
    { id: 'database', label: 'Database' },
  ];
  const work = WORK_STATUS[detail.case?.work_status ?? incident.work_status ?? 'open'];

  return (
    <div className="flex flex-col gap-7">
      <header className="flex flex-wrap items-start justify-between gap-x-8 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-3xl">{failed ? 'Analysis failed' : done ? incident.title : 'Analyzing'}</h1>
          <p className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-dim">
            <span>{dateTime(incident.created_at)}</span>
            {!!incident.departments?.length && <span>· {incident.departments.join(', ')}</span>}
            {incident.location && (
              <span className="inline-flex min-w-0 items-center gap-1.5">
                · <MapPin className="size-4 shrink-0" /> <span className="truncate">{incident.location}</span>
              </span>
            )}
          </p>
        </div>
        {done && (
          <div className="flex flex-wrap gap-x-6 gap-y-1 pt-2">
            {incident.severity != null && (
              <span className="status" style={{ color: severityColor(incident.severity) }}>
                {incident.severity_label} severity
              </span>
            )}
            {incident.registration && (
              <span className="status" style={{ color: work.color }}>
                {work.label}
              </span>
            )}
          </div>
        )}
      </header>

      {done && <Registration detail={detail} onOpen={onOpen} />}

      <div className="grid grid-cols-1 items-start gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="min-w-0 lg:sticky lg:top-24">
          {media ? (
            <div className="text-center">
              <Viewer key={incident._id} detail={detail} live={live} activeId={activeId} caption={done ? captionOf(detail) : undefined} />
            </div>
          ) : (
            <blockquote className="panel p-7 text-2xl leading-snug">
              <span className="label mb-3">Written report</span>
              {incident.citizen_text}
            </blockquote>
          )}
        </div>

        <div className="flex min-w-0 flex-col gap-7">
          {failed && <p className="text-bad">{incident.error ?? 'Unknown error'}</p>}

          {!done && !failed && (
            <section className="card p-6">
              <h2 className="text-xl">Looking at the report</h2>
              <p className="mt-1.5 text-dim">Finding what is wrong, then checking what is already on record for this place.</p>
              <div className="progress my-5" />
              {/* Each line is a write to MongoDB, shown as it happens. */}
              <ActivityList entries={updates} />
            </section>
          )}

          {done && incident.recommendation && <Advice incident={incident} onChanged={onChanged} onShowHistory={() => setSection('history')} />}

          {(done || failed) && (
            <div>
              <Tabs label="Parts of the report" tabs={failed ? sections.slice(3) : sections} value={failed ? 'database' : section} onChange={setSection} className="h-11 gap-7 border-b border-line" />

              <div key={section} className="fade-in flex flex-col gap-6 pt-6">
                {failed ? (
                  <StoredRecord incident={incident} updates={updates} onDelete={onDelete} />
                ) : (
                  <>
                    {section === 'found' && (
                      <>
                        <Found detections={detections} activeId={activeId} onHover={setActiveId} onChanged={onChanged} />
                        {media && incident.citizen_text && (
                          <section>
                            <h2 className="label">Description</h2>
                            <p className="mt-1.5">{incident.citizen_text}</p>
                          </section>
                        )}
                      </>
                    )}
                    {section === 'history' && <History detail={detail} onOpen={onOpen} />}
                    {section === 'followup' &&
                      (detail.case ? (
                        <p className="text-dim">
                          Follow-up is recorded once, on the original report.{' '}
                          <button type="button" className="font-medium text-accent hover:underline" onClick={() => onOpen(detail.case!._id)}>
                            Open it
                          </button>
                        </p>
                      ) : (
                        <FollowUp detail={detail} onChanged={onChanged} />
                      ))}
                    {section === 'database' && <StoredRecord incident={incident} updates={updates} onDelete={onDelete} />}
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function captionOf({ incident, media }: IncidentDetail): string {
  const a = incident.analysis;
  return [
    media?.file_name,
    a?.frames_analyzed && a.frames_analyzed > 1 ? `${a.frames_analyzed} frames` : null,
    a?.duration_ms != null ? `analysed in ${(a.duration_ms / 1000).toFixed(1)} s${a.device ? ` on ${a.device === 'cuda' ? 'GPU' : 'CPU'}` : ''}` : null,
  ]
    .filter(Boolean)
    .join(' · ');
}

/** What this report is: new, one more report of an open case, or a problem that has come back. */
function Registration({ detail, onOpen }: { detail: IncidentDetail; onOpen: (id: string) => void }) {
  const { incident } = detail;
  const reg = incident.registration;
  if (!reg) return null;

  if (reg.state === 'new') {
    return (
      <p className="-mt-2 flex items-center gap-2 text-dim">
        <Check className="size-4 text-good" /> {reg.message}
        {(incident.report_count ?? 1) > 1 && ` Reported ${incident.report_count} times.`}
      </p>
    );
  }

  const repeat = reg.state === 'already_registered';
  const [headline, ...rest] = reg.message.split('. ');
  // The seeded demo history has no page of its own to open.
  const link = repeat ? reg.case_id : reg.previous_id;
  const target = link?.startsWith('inc_hist_') ? null : link;
  return (
    <aside className={`fade-in flex flex-wrap items-center justify-between gap-x-8 gap-y-3 rounded-[14px] border px-5 py-4 ${repeat ? 'border-accent/30 bg-accent/[0.06]' : 'border-warn/35 bg-warn/[0.07]'}`}>
      <div className="min-w-0 max-w-3xl">
        <p className={`text-lg font-semibold ${repeat ? 'text-accent' : 'text-warn'}`}>{headline}</p>
        <p className="mt-0.5">{rest.join('. ')}</p>
        {repeat && detail.case && (
          <p className="mt-1.5 text-sm text-dim">
            First reported {dateTime(detail.case.created_at)} · {detail.case.report_count ?? reg.report_number} reports · {WORK_STATUS[detail.case.work_status].label.toLowerCase()}
          </p>
        )}
      </div>
      {target && (
        <button type="button" className="btn shrink-0" onClick={() => onOpen(target)}>
          {repeat ? 'Open the original' : 'Open the earlier report'} <ArrowRight className="nudge size-4" />
        </button>
      )}
    </aside>
  );
}

const BASIS_NOTE: Record<string, string> = {
  memory: 'Lesson learned at this place',
  history: 'From what was tried here before',
};

const BASED_ON: Record<string, string> = {
  memory: 'A lesson learned here',
  history: 'The history of this place',
  standard_procedure: 'The standard procedure',
};

const PRIORITY_COLOR: Record<string, string> = { urgent: TONE.bad, high: '#b84a1b', medium: TONE.warn, low: TONE.dim };

/** Four bars, filled up to the priority's level. */
function PriorityBars({ rank, color }: { rank: number; color: string }) {
  return (
    <span className="priority-bars" aria-hidden>
      {[1, 2, 3, 4].map((n) => (
        <i key={n} style={n <= rank ? { background: color, animationDelay: `${n * 70}ms` } : undefined} className={n <= rank ? 'is-on' : undefined} />
      ))}
    </span>
  );
}

/**
 * The recommendation — the point of the whole report. An order, how soon and who, then the plan
 * step by step, and under it what the plan rests on and what else the report shows.
 */
function Advice({ incident, onChanged, onShowHistory }: { incident: Incident; onChanged: () => Promise<void>; onShowHistory: () => void }) {
  const rec = incident.recommendation!;
  const [busy, setBusy] = useState(false);
  // Hints from similar cases elsewhere are things to check, not steps of the plan.
  const plan = (rec.steps ?? []).filter((s) => s.basis !== 'similar_case');
  const hints = (rec.steps ?? []).filter((s) => s.basis === 'similar_case');
  // A report analysed before recommendations carried their steps has only the sentence.
  const steps = plan.length ? plan : [{ text: rec.text, basis: 'standard' as const, ref: null }];
  // Where a step comes from is only worth saying when the steps do not all come from the same place.
  const mixed = new Set(steps.map((s) => s.basis)).size > 1;
  const rating = incident.feedback?.rating ?? null;
  const shaped = rec.source !== 'standard_procedure';
  const priority = rec.priority;
  const color = priority ? PRIORITY_COLOR[priority.level] : TONE.dim;
  const records = rec.evidence?.length ?? 0;
  // Departments that the other problems in the report go to.
  const others = new Set((rec.also ?? []).map((a) => a.department).filter((d) => d !== rec.department)).size;

  const act = async (work: () => Promise<unknown>) => {
    setBusy(true);
    try {
      await work();
      await onChanged();
    } finally {
      setBusy(false);
    }
  };
  const rate = (r: Rating) => act(() => api.rate(incident._id, rating === r ? null : r));

  return (
    <section className="card fade-in">
      <header className="px-6 pt-6">
        <p className="label">What to do</p>
        <h2 className="mt-1.5 text-[26px] leading-tight">{rec.headline ?? incident.title}</h2>
      </header>

      {priority && (
        <dl className="mx-6 mt-5 grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-4 gap-y-3.5 border-y border-line py-4">
          <dt className="pt-px text-sm text-dim">Priority</dt>
          <dd>
            <p className="flex flex-wrap items-center gap-x-2">
              <span className="inline-flex items-center gap-2 font-semibold" style={{ color }}>
                <PriorityBars rank={priority.rank} color={color} /> {priority.label}
              </span>
              <span>{priority.respond}</span>
            </p>
            {priority.reasons.length > 0 && <p className="mt-0.5 text-sm text-dim">{priority.reasons.join(' · ')}</p>}
          </dd>

          <dt className="pt-px text-sm text-dim">Handled by</dt>
          <dd>
            <span className="font-semibold">{rec.department}</span>
            {others > 0 && (
              <span className="text-dim">
                {' '}
                and {others} other {others === 1 ? 'department' : 'departments'}
              </span>
            )}
          </dd>

          <dt className="pt-px text-sm text-dim">Based on</dt>
          <dd>
            <span className={`font-semibold ${shaped ? 'text-accent' : ''}`}>{BASED_ON[rec.source]}</span>
            <p className="mt-0.5 text-sm text-dim">
              {records > 0 ? (
                <button type="button" onClick={onShowHistory} className="underline decoration-edge underline-offset-4 transition-colors hover:text-ink hover:decoration-ink">
                  {records} past {records === 1 ? 'record' : 'records'}
                </button>
              ) : (
                'No lesson or repair result for this place yet'
              )}
            </p>
          </dd>
        </dl>
      )}

      <ol className="steps px-6 pt-5">
        {steps.map((s, i) => (
          <li key={i} style={{ '--i': i } as React.CSSProperties}>
            <span className="step-no">{i + 1}</span>
            <div className="min-w-0 pb-5">
              <p className="text-[17px] leading-relaxed">{s.text}</p>
              {mixed && BASIS_NOTE[s.basis] && <p className="mt-0.5 text-sm font-medium text-accent">{BASIS_NOTE[s.basis]}</p>}
            </div>
          </li>
        ))}
      </ol>

      <div className="flex flex-col gap-4 px-6 pb-1 pt-1.5">
        {rec.because && (
          <p className="border-l-2 border-accent/50 pl-3.5 text-dim">
            <span className="font-medium text-ink">Why.</span> {rec.because}
          </p>
        )}

        {!!rec.avoid?.length && (
          <div className="rounded-[10px] bg-bad/[0.07] px-4 py-3">
            <p className="font-semibold text-bad">Do not repeat</p>
            <ul className="mt-1 flex flex-col gap-1.5">
              {rec.avoid.map((a, i) => (
                <li key={i}>
                  {a.text}
                  {a.because && <span className="text-dim"> {a.because}</span>}
                </li>
              ))}
            </ul>
          </div>
        )}

        {hints.map((h, i) => (
          <div key={i} className="rounded-[10px] bg-accent/[0.06] px-4 py-3">
            <p className="font-semibold text-accent">Worth checking</p>
            <p className="mt-1">{h.text}</p>
          </div>
        ))}

        {!!rec.also?.length && (
          <div>
            <p className="label">Also in this report</p>
            <ul className="mt-1 divide-y divide-line">
              {rec.also.map((a) => (
                <li key={a.issue_type_id} className="py-2.5">
                  <p className="flex flex-wrap items-center gap-x-2">
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: colorOf(a.issue_type_id) }} />
                    <span className="font-medium">{a.what}</span>
                    <span className="text-sm text-dim">{a.department}</span>
                  </p>
                  <p className="mt-0.5 pl-[18px] text-[15px] text-dim">{a.action}</p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!!rec.equipment?.length && (
          <p className="text-[15px]">
            <span className="mr-2 text-sm font-medium text-dim">Bring</span>
            {rec.equipment.join(' · ')}
          </p>
        )}

        {shaped && rec.baseline && (
          <details className="text-dim">
            <summary className="cursor-pointer select-none text-sm hover:text-ink">Without memory the advice would have been</summary>
            <p className="mt-1.5 pl-3.5">{rec.baseline}</p>
          </details>
        )}
      </div>

      <footer className="mx-6 mt-4 flex flex-wrap items-center gap-1 border-t border-line py-4 text-sm text-dim">
        <span className="mr-1">Was this useful?</span>
        <button type="button" disabled={busy} onClick={() => rate('helpful')} title="Useful" aria-pressed={rating === 'helpful'}
          className={`btn btn-sm btn-icon ${rating === 'helpful' ? 'border-good/60 bg-good/10 text-good' : 'btn-quiet'}`}>
          <ThumbsUp className="size-4" />
        </button>
        <button type="button" disabled={busy} onClick={() => rate('not_helpful')} title="Not useful" aria-pressed={rating === 'not_helpful'}
          className={`btn btn-sm btn-icon ${rating === 'not_helpful' ? 'border-bad/60 bg-bad/10 text-bad' : 'btn-quiet'}`}>
          <ThumbsDown className="size-4" />
        </button>
        <button type="button" disabled={busy} onClick={() => act(() => api.reevaluate(incident._id))} title="Work the advice out again from what is known now" className="btn btn-quiet btn-sm ml-auto">
          <RefreshCw className={`size-4 ${busy ? 'animate-spin' : ''}`} /> Re-evaluate
        </button>
      </footer>
    </section>
  );
}

/** Everything the models found. A person can confirm each one or throw it out. */
function Found(props: { detections: Detection[]; activeId: string | null; onHover: (id: string | null) => void; onChanged: () => Promise<void> }) {
  const [pending, setPending] = useState<string | null>(null);

  const verify = async (d: Detection, status: Detection['status']) => {
    setPending(d._id);
    try {
      await api.verify(d._id, d.status === status ? 'open' : status);
      await props.onChanged();
    } finally {
      setPending(null);
    }
  };

  if (props.detections.length === 0) return <p className="text-dim">Nothing matching a known street problem was found.</p>;

  return (
    <ul className="stagger -mt-2 divide-y divide-line">
      {props.detections.map((d) => {
        const rejected = d.status === 'rejected';
        return (
          <li
            key={d._id}
            onMouseEnter={() => props.onHover(d._id)}
            onMouseLeave={() => props.onHover(null)}
            className={`flex items-center gap-3.5 rounded-lg px-1 py-3 transition-colors ${d._id === props.activeId ? 'bg-ink/[0.04]' : ''} ${rejected ? 'opacity-50' : ''}`}
          >
            {d.snapshot_url ? (
              <img src={d.snapshot_url} alt="" className="size-12 shrink-0 rounded-lg object-cover" />
            ) : (
              <span className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-raised text-faint">
                <FileText className="size-5" />
              </span>
            )}
            <div className="min-w-0 flex-1">
              <p className="flex items-center gap-2">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: colorOf(d.links.issue_type_id) }} />
                <span className={`truncate font-medium ${rejected ? 'line-through' : ''}`}>{d.label}</span>
              </p>
              <p className="truncate text-sm text-dim">
                <span className="font-medium" style={{ color: severityColor(d.severity) }}>
                  {d.severity_label}
                </span>
                {d.source === 'text' ? ' · from the description' : ` · ${Math.round(d.confidence * 100)}% confident`}
                {d.approximate_location && ' · approximate place'}
                {d.status === 'confirmed' && ' · confirmed'}
                {rejected && ' · rejected'}
              </p>
            </div>
            <div className="flex shrink-0 gap-1">
              <button
                type="button"
                disabled={pending === d._id}
                title={d.status === 'confirmed' ? 'Confirmed. Click to undo' : 'Confirm this detection'}
                onClick={() => verify(d, 'confirmed')}
                className={`btn btn-sm btn-icon ${d.status === 'confirmed' ? 'border-good/60 bg-good/10 text-good' : 'btn-quiet'}`}
              >
                <Check className="size-4" />
              </button>
              <button
                type="button"
                disabled={pending === d._id}
                title={rejected ? 'Rejected. Click to undo' : 'Reject: this is not a real problem'}
                onClick={() => verify(d, 'rejected')}
                className={`btn btn-sm btn-icon ${rejected ? 'border-bad/60 bg-bad/10 text-bad' : 'btn-quiet'}`}
              >
                {rejected ? <Undo2 className="size-4" /> : <X className="size-4" />}
              </button>
            </div>
          </li>
        );
      })}
    </ul>
  );
}

/** What is on record: the other reports at this place, similar cases elsewhere, and the lessons that apply. */
function History({ detail, onOpen }: { detail: IncidentDetail; onOpen: (id: string) => void }) {
  const { incident, history, memories } = detail;
  const geo = incident.geo;
  const pins = useMemo(
    () => (geo ? [{ id: incident._id, lat: geo.coordinates[1], lng: geo.coordinates[0], color: severityColor(incident.severity), active: true }] : []),
    [geo, incident._id, incident.severity],
  );
  const accuracy = useMemo(
    () => (geo && incident.location_accuracy_m ? { lat: geo.coordinates[1], lng: geo.coordinates[0], radius: incident.location_accuracy_m } : null),
    [geo, incident.location_accuracy_m],
  );
  const nothing = history.here.length + history.similar.length + memories.length === 0;

  return (
    <>
      {geo && (
        <section>
          <LeafletMap pins={pins} accuracy={accuracy} fitKey={incident._id} controls={false} className="h-44 w-full rounded-xl border border-line" />
          <p className="mt-2 text-sm text-faint">
            {geo.coordinates[1].toFixed(5)}, {geo.coordinates[0].toFixed(5)}
            {incident.location_source && ` · ${PLACE_SOURCE[incident.location_source]}`}
            {incident.location_accuracy_m != null && ` · within ${Math.round(incident.location_accuracy_m)} m`}
          </p>
        </section>
      )}

      {nothing && <p className="text-dim">Nothing is on record yet for this place or for similar cases.</p>}

      {history.here.length > 0 && <PastList title="At this place" cases={history.here} onOpen={onOpen} originalId={detail.case?._id} />}
      {history.similar.length > 0 && <PastList title="Same kind of problem elsewhere" cases={history.similar} onOpen={onOpen} />}

      {memories.length > 0 && (
        <section>
          <h2 className="label">Lessons that apply</h2>
          <ul className="mt-1 divide-y divide-line">
            {memories.map((m) => (
              <li key={m._id} className="py-3.5">
                <p className="font-medium">{m.title}</p>
                {m.location_tag && <p className="text-sm text-dim">{m.location_tag}</p>}
                <p className="mt-1.5 text-dim">{m.lesson_learned}</p>
                <p className="mt-2 border-l-2 border-accent/50 pl-3.5">{m.recommended_protocol}</p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

function PastList({ title, cases, onOpen, originalId }: { title: string; cases: PastCase[]; onOpen: (id: string) => void; originalId?: string }) {
  return (
    <section>
      <h2 className="label">{title}</h2>
      <ul className="stagger mt-1 divide-y divide-line">
        {cases.map((c) => {
          // Seeded demo history has no page of its own.
          const opens = !c.incident_id.startsWith('inc_hist_');
          const facts = [
            c.location,
            c.distance_m != null ? `${metres(c.distance_m)} away` : null,
            c.incident_id === originalId ? `the original report, ${WORK_STATUS[c.work_status].label.toLowerCase()}` : c.same_case ? 'another report of the same case' : WORK_STATUS[c.work_status].label.toLowerCase(),
            c.similarity ? `${Math.round(c.similarity * 100)}% similar wording` : null,
          ].filter(Boolean);
          return (
            <li key={c.incident_id} className="py-3.5">
              <div className="flex items-baseline justify-between gap-3">
                {opens ? (
                  <button type="button" onClick={() => onOpen(c.incident_id)} className="min-w-0 truncate text-left font-medium hover:text-accent">
                    {c.title ?? c.incident_id}
                  </button>
                ) : (
                  <span className="min-w-0 truncate font-medium">{c.title ?? c.incident_id}</span>
                )}
                <span className="shrink-0 text-sm text-faint">{timeAgo(c.created_at)}</span>
              </div>
              <p className="truncate text-sm text-dim">{facts.join(' · ')}</p>
              {c.tried.map((a) => (
                <Tried key={a.action_id} attempt={a} />
              ))}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function Tried({ attempt }: { attempt: Attempt }) {
  const tone = attempt.result === 'held' ? 'text-good' : attempt.result === 'came_back' ? 'text-bad' : 'text-dim';
  const verdict =
    attempt.result === 'held'
      ? 'Held'
      : attempt.result === 'came_back'
        ? `Came back${attempt.days != null ? ` after ${attempt.days} ${attempt.days === 1 ? 'day' : 'days'}` : ''}`
        : 'No result recorded yet';
  return (
    <p className="mt-2 border-l-2 border-line pl-3.5 text-[15px]">
      {attempt.what} <span className={`font-medium ${tone}`}>{verdict}.</span>
      {attempt.observation && <span className="text-dim"> {attempt.observation}</span>}
    </p>
  );
}

/** Where the report lives in MongoDB, and every change that was written for it. */
function StoredRecord({ incident, updates, onDelete }: { incident: Incident; updates: DbUpdate[]; onDelete: () => void }) {
  const [copied, setCopied] = useState(false);
  const filter = `{ _id: "${incident._id}" }`;
  return (
    <>
      <section>
        <h2 className="label">Document</h2>
        <p className="mt-1.5 font-mono text-[15px]">
          urbanhp.incidents <span className="text-faint">· version {incident.version}</span>
        </p>
        <button
          type="button"
          onClick={() => {
            navigator.clipboard.writeText(filter);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
          title="Copy this filter and paste it into the Compass filter bar"
          className="btn btn-sm mt-2.5 font-mono text-[13px]"
        >
          {copied ? <Check className="size-4 text-good" /> : <Copy className="size-4" />}
          {filter}
        </button>
      </section>
      <section>
        <h2 className="label">
          {updates.length} {updates.length === 1 ? 'write' : 'writes'} for this report
        </h2>
        <ActivityList entries={updates} />
      </section>
      <button type="button" onClick={onDelete} className="btn btn-sm self-start text-bad hover:border-bad/60">
        <Trash2 className="size-4" /> Delete this report
      </button>
    </>
  );
}
