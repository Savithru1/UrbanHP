import { useCallback, useEffect, useState } from 'react';
import { ChevronRight, Plus, RefreshCw } from 'lucide-react';
import { api } from '../api';
import { ISSUE_LABELS } from '../colors';
import { MEMORY_STATUS, SOURCE_LABEL } from '../format';
import type { Impact, Memory as Lesson, MemoryStatus, Reevaluation } from '../types';
import { LessonForm } from './FollowUp';
import { Count, Skeleton, SkeletonRows } from './Parts';

interface Props {
  onOpen: (id: string) => void;
  /** Lessons or reports changed: the rest of the app should refresh. */
  onChanged: () => void;
}

/**
 * The city's memory: the lessons themselves, and whether remembering changes the advice.
 * Lessons are edited here and past reports re-evaluated against them.
 */
export function Memory({ onOpen, onChanged }: Props) {
  const [impact, setImpact] = useState<Impact | null>(null);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [run, setRun] = useState<{ evaluated: number; changed: Reevaluation[] } | null>(null);
  const [running, setRunning] = useState(false);
  // Lessons were changed since the reports were last re-evaluated.
  const [stale, setStale] = useState(false);
  const [editing, setEditing] = useState<string | 'new' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [i, m] = await Promise.all([api.impact(), api.memories()]);
    setImpact(i);
    setLessons(m);
  }, []);

  useEffect(() => {
    load().catch(() => setError('This page could not load. Is the backend running?'));
  }, [load]);

  const change = async (work: () => Promise<unknown>, makesStale = true) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      setEditing(null);
      if (makesStale) setStale(true);
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const reevaluate = async () => {
    setRunning(true);
    setError(null);
    try {
      setRun(await api.reevaluateAll());
      setStale(false);
      await load();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Re-evaluation failed.');
    } finally {
      setRunning(false);
    }
  };

  if (!impact) {
    if (error) return <p className="text-bad">{error}</p>;
    return (
      <div className="flex flex-col gap-10" aria-busy="true">
        <div className="flex flex-col gap-3">
          <Skeleton className="h-9 w-48" />
          <Skeleton className="h-5 w-2/3 max-w-xl" />
        </div>
        <Skeleton className="h-28 w-full rounded-[14px]" />
        <SkeletonRows rows={4} />
      </div>
    );
  }

  const { memory, standard } = impact.groups;
  const shaped = impact.rows.filter((r) => r.source !== 'standard_procedure');

  return (
    <div className="screen flex flex-col gap-10">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-2xl">
          <h1 className="text-3xl">Memory</h1>
          <p className="mt-2 text-lg text-dim">Lessons from past repairs. A validated lesson replaces the standard procedure when the same problem is reported at the same place again.</p>
        </div>
        <button type="button" onClick={reevaluate} disabled={running} className="btn">
          <RefreshCw className={`size-4 ${running ? 'animate-spin' : ''}`} />
          {running ? 'Re-evaluating' : 'Re-evaluate all reports'}
        </button>
      </header>

      {error && (
        <p className="text-bad" role="alert">
          {error}
        </p>
      )}

      <section className="grid grid-cols-1 divide-line border-y border-line max-sm:divide-y sm:grid-cols-3 sm:divide-x">
        <Figure title="Advice that uses memory">
          <p className="text-4xl font-semibold tabular-nums">
            <Count value={memory.reports} /> <span className="text-base font-normal text-dim">of {impact.reports} cases</span>
          </p>
        </Figure>
        <Figure title="Rated useful">
          <Versus memory={[memory.helpful, memory.helpful + memory.not_helpful]} standard={[standard.helpful, standard.helpful + standard.not_helpful]} />
        </Figure>
        <Figure title="Repairs that held">
          <Versus memory={[memory.resolved, memory.resolved + memory.recurred]} standard={[standard.resolved, standard.resolved + standard.recurred]} />
        </Figure>
      </section>

      {(stale || run) && (
        <section>
          {stale && !running ? (
            <p className="text-warn">Lessons have changed. Reports keep their current advice until they are re-evaluated.</p>
          ) : (
            run && (
              <>
                <h2 className="font-semibold">
                  {run.evaluated} reports re-evaluated. {run.changed.length === 0 ? 'No advice changed.' : `${run.changed.length} ${run.changed.length === 1 ? 'recommendation' : 'recommendations'} changed.`}
                </h2>
                {run.changed.length > 0 && (
                  <ul className="mt-3 divide-y divide-line border-y border-line">
                    {run.changed.map((c) => (
                      <Comparison
                        key={c.incident_id}
                        title={c.title}
                        onOpen={() => onOpen(c.incident_id)}
                        before={[c.before ? SOURCE_LABEL[c.before.source] : 'No advice', c.before?.text ?? '']}
                        after={[c.after ? SOURCE_LABEL[c.after.source] : 'No advice', c.after?.text ?? '']}
                      />
                    ))}
                  </ul>
                )}
              </>
            )
          )}
        </section>
      )}

      <section>
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-xl font-semibold">
            Lessons <span className="ml-1 text-sm font-normal text-dim">{impact.memories.validated} validated{impact.memories.draft > 0 && `, ${impact.memories.draft} draft`}{impact.memories.retired > 0 && `, ${impact.memories.retired} retired`}</span>
          </h2>
          {editing !== 'new' && (
            <button type="button" className="btn btn-sm" onClick={() => setEditing('new')}>
              <Plus className="size-4" /> New lesson
            </button>
          )}
        </div>

        {editing === 'new' && <NewLesson busy={busy} onCancel={() => setEditing(null)} onSave={(body) => change(() => api.addMemory(body))} />}

        <ul className="stagger mt-3 divide-y divide-line border-y border-line">
          {lessons.map((m) => (
            <li key={m._id} className={m.status === 'retired' ? 'opacity-60' : ''}>
              {editing === m._id ? (
                <div className="py-4">
                  <LessonForm
                    editing
                    busy={busy}
                    initial={{ title: m.title, lesson: m.lesson_learned, protocol: m.recommended_protocol }}
                    onCancel={() => setEditing(null)}
                    onSave={({ title, lesson_learned, recommended_protocol }) => change(() => api.editMemory(m._id, { title, lesson_learned, recommended_protocol }))}
                  />
                </div>
              ) : (
                <details className="group">
                  <summary className="row-link cursor-pointer list-none px-2 py-3.5 [&::-webkit-details-marker]:hidden">
                    <ChevronRight className="size-4 shrink-0 text-faint transition-transform group-open:rotate-90" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium">{m.title}</span>
                      <span className="block truncate text-sm text-dim">{[m.issue_label, m.location_tag].filter(Boolean).join(' · ')}</span>
                    </span>
                    <span className="status shrink-0" style={{ color: MEMORY_STATUS[m.status].color }}>
                      {MEMORY_STATUS[m.status].label}
                    </span>
                  </summary>
                  <div className="fade-in flex flex-col gap-3 pb-5 pl-10 pr-2">
                    <p className="text-dim">{m.lesson_learned}</p>
                    <p className="border-l-2 border-accent/50 pl-3.5">{m.recommended_protocol}</p>
                    <div className="flex flex-wrap items-center gap-2">
                      {m.status !== 'validated' && <StatusButton label={m.status === 'retired' ? 'Restore' : 'Validate'} to="validated" id={m._id} busy={busy} change={change} primary />}
                      {m.status === 'validated' && <StatusButton label="Retire" to="retired" id={m._id} busy={busy} change={change} />}
                      <button type="button" className="btn btn-sm" disabled={busy} onClick={() => setEditing(m._id)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        className="btn btn-quiet btn-sm hover:!text-bad"
                        disabled={busy}
                        onClick={() => window.confirm(`Delete the lesson “${m.title}”? Reports that relied on it are re-evaluated.`) && change(() => api.removeMemory(m._id), false)}
                      >
                        Delete
                      </button>
                      <span className="ml-auto text-sm text-faint">
                        Decided the advice for {m.decided ?? 0} {m.decided === 1 ? 'report' : 'reports'}
                      </span>
                    </div>
                  </div>
                </details>
              )}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="text-xl font-semibold">Where memory changed the advice</h2>
        {shaped.length === 0 ? (
          <p className="mt-2 text-dim">Nowhere yet. It happens when a problem is reported at a place that already has a lesson or a recorded repair.</p>
        ) : (
          <ul className="mt-3 divide-y divide-line border-y border-line">
            {shaped.map((r) => (
              <Comparison key={r._id} title={r.title ?? r._id} place={r.location} onOpen={() => onOpen(r._id)} before={['Without memory', r.baseline ?? '']} after={[SOURCE_LABEL[r.source], r.text]} />
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function Figure({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="py-6 sm:px-7 sm:first:pl-0 sm:last:pr-0">
      <h2 className="label mb-2">{title}</h2>
      {children}
    </div>
  );
}

/** The same measure for both groups. Small numbers are shown as counts, never dressed up as percentages. */
function Versus({ memory, standard }: { memory: [number, number]; standard: [number, number] }) {
  const rows: [string, [number, number]][] = [
    ['With memory', memory],
    ['Standard procedure', standard],
  ];
  return (
    <dl className="flex flex-col gap-1">
      {rows.map(([label, [good, total]]) => (
        <div key={label} className="flex items-baseline justify-between gap-3">
          <dt className="text-dim">{label}</dt>
          <dd className="tabular-nums">{total ? `${good} of ${total}` : <span className="text-faint">none yet</span>}</dd>
        </div>
      ))}
    </dl>
  );
}

function Comparison(props: { title: string; place?: string | null; onOpen: () => void; before: [string, string]; after: [string, string] }) {
  return (
    <li className="py-4">
      <button type="button" onClick={props.onOpen} className="text-left font-medium hover:text-accent">
        {props.title}
      </button>
      {props.place && <p className="text-sm text-dim">{props.place}</p>}
      <div className="mt-2 grid grid-cols-1 gap-x-10 gap-y-3 md:grid-cols-2">
        <p className="text-dim">
          <span className="mb-0.5 block text-sm text-faint">{props.before[0]}</span>
          {props.before[1]}
        </p>
        <p>
          <span className="mb-0.5 block text-sm font-medium text-accent">{props.after[0]}</span>
          {props.after[1]}
        </p>
      </div>
    </li>
  );
}

function StatusButton(props: { label: string; to: MemoryStatus; id: string; busy: boolean; primary?: boolean; change: (work: () => Promise<unknown>) => void }) {
  return (
    <button type="button" disabled={props.busy} className={`btn btn-sm ${props.primary ? 'btn-primary' : ''}`} onClick={() => props.change(() => api.editMemory(props.id, { status: props.to }))}>
      {props.label}
    </button>
  );
}

function NewLesson(props: { busy: boolean; onCancel: () => void; onSave: (body: { title: string; lesson_learned: string; recommended_protocol: string; status: 'draft' | 'validated'; issue_type_id: string; location_tag?: string }) => void }) {
  const [issue, setIssue] = useState('pothole');
  const [place, setPlace] = useState('');
  return (
    <div className="mt-3 flex flex-col gap-3 border-t border-line pt-4">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1.5">
          <span className="label">Kind of problem</span>
          <select value={issue} onChange={(e) => setIssue(e.target.value)} className="field">
            {Object.entries(ISSUE_LABELS).map(([id, label]) => (
              <option key={id} value={id}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5">
          <span className="label">Where it applies</span>
          <input value={place} onChange={(e) => setPlace(e.target.value)} placeholder="Street or landmark" className="field" />
        </label>
      </div>
      <LessonForm busy={props.busy} initial={{ title: '', lesson: '', protocol: '' }} onCancel={props.onCancel} onSave={(body) => props.onSave({ ...body, issue_type_id: issue, location_tag: place.trim() || undefined })} />
    </div>
  );
}
