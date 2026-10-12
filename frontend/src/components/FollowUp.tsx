import { useState } from 'react';
import { LoaderCircle, Plus } from 'lucide-react';
import { api } from '../api';
import { MEMORY_STATUS, timeAgo } from '../format';
import type { Action, IncidentDetail } from '../types';

const ACTION_TYPES = ['Temporary repair', 'Permanent repair', 'Clean-up', 'Inspection', 'Other'];

interface Props {
  detail: IncidentDetail;
  onChanged: () => Promise<void>;
}

/**
 * How a report turns into memory: what was done about it, whether that held,
 * and the lesson worth keeping for the next report at this place.
 */
export function FollowUp({ detail, onChanged }: Props) {
  const { incident, actions, lessons } = detail;
  const [form, setForm] = useState<'action' | 'lesson' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = async (work: () => Promise<unknown>) => {
    setBusy(true);
    setError(null);
    try {
      await work();
      setForm(null);
      await onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'That could not be saved.');
    } finally {
      setBusy(false);
    }
  };

  const outcomes = actions.flatMap((a) => a.outcomes.map((o) => ({ action: a, outcome: o })));
  const last = outcomes[outcomes.length - 1];
  const stage = lessons.length ? 3 : outcomes.length ? 2 : actions.length ? 1 : 0;

  return (
    <>
      <ol className="flex items-center gap-2 text-sm">
        {['Action', 'Outcome', 'Lesson'].map((name, i) => (
          <li key={name} className={`flex items-center gap-2 whitespace-nowrap ${stage > i ? 'text-ink' : 'text-faint'}`}>
            {i > 0 && <span className="h-px w-5 bg-line" />}
            <span className={`size-1.5 rounded-full ${stage > i ? 'bg-accent' : 'bg-edge'}`} />
            {name}
          </li>
        ))}
      </ol>

      {actions.length === 0 && form === null && <p className="text-dim">Nothing recorded yet. When this is dealt with, record what was done: it is how the next report here gets better advice.</p>}

      {actions.length > 0 && (
        <ul className="stagger divide-y divide-line border-y border-line">
          {actions.map((a) => (
            <li key={a._id} className="py-3">
              <div className="flex items-baseline justify-between gap-3">
                <span className="font-medium capitalize">{a.action_type.replace(/_/g, ' ')}</span>
                <span className="shrink-0 text-xs text-faint">{timeAgo(a.created_at)}</span>
              </div>
              <p className="text-sm text-dim">{a.notes}</p>
              {a.outcomes.map((o) => (
                <p key={o._id} className="mt-1.5 border-l border-line pl-3 text-sm">
                  <span className={o.recurrence_detected ? 'text-bad' : 'text-good'}>
                    {o.recurrence_detected ? `Came back${o.days_to_recurrence != null ? ` after ${o.days_to_recurrence} ${o.days_to_recurrence === 1 ? 'day' : 'days'}` : ''}.` : 'Held.'}
                  </span>{' '}
                  <span className="text-dim">{o.observation}</span>
                </p>
              ))}
              {a.outcomes.length === 0 && <OutcomeForm action={a} busy={busy} onSave={(body) => run(() => api.addOutcome(a._id, body))} />}
            </li>
          ))}
        </ul>
      )}

      {lessons.length > 0 && (
        <section>
          <h2 className="label">Lesson kept from this report</h2>
          <ul className="mt-1.5 divide-y divide-line border-y border-line">
            {lessons.map((m) => (
              <li key={m._id} className="py-3">
                <div className="flex items-baseline justify-between gap-3">
                  <span className="min-w-0 truncate font-medium">{m.title}</span>
                  <span className="status shrink-0" style={{ color: MEMORY_STATUS[m.status].color }}>
                    {MEMORY_STATUS[m.status].label}
                  </span>
                </div>
                <p className="mt-1.5 border-l-2 border-accent/50 pl-3.5">{m.recommended_protocol}</p>
              </li>
            ))}
          </ul>
        </section>
      )}

      {form === 'action' && <ActionForm busy={busy} onCancel={() => setForm(null)} onSave={(body) => run(() => api.addAction(incident._id, body))} />}

      {form === 'lesson' && (
        <LessonForm
          busy={busy}
          onCancel={() => setForm(null)}
          initial={{
            title: capitalise(`${incident.title?.replace(/^\d+\s+/, '') ?? 'Problem'}${incident.location ? ` at ${incident.location}` : ''}`).slice(0, 110),
            lesson: last ? `${last.action.notes.replace(/[.\s]+$/, '')} ${last.outcome.recurrence_detected ? 'did not hold' : 'held'}: ${last.outcome.observation}` : '',
            protocol: last && !last.outcome.recurrence_detected ? last.action.notes : '',
          }}
          onSave={(body) => run(() => api.addMemory({ ...body, incident_id: incident._id }))}
        />
      )}

      {error && (
        <p className="text-sm text-bad" role="alert">
          {error}
        </p>
      )}

      {form === null && (
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-sm" onClick={() => setForm('action')}>
            <Plus className="size-4" /> Record what was done
          </button>
          {outcomes.length > 0 && (
            <button type="button" className="btn btn-sm" onClick={() => setForm('lesson')}>
              <Plus className="size-4" /> Keep the lesson
            </button>
          )}
        </div>
      )}
    </>
  );
}

const capitalise = (text: string) => text.charAt(0).toUpperCase() + text.slice(1);

/** One of several options, shown as a row of buttons with the chosen one filled. */
function Choice<T extends string>(props: { options: readonly T[]; value: T; onChange: (v: T) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {props.options.map((o) => (
        <button key={o} type="button" onClick={() => props.onChange(o)} className={`btn btn-sm ${o === props.value ? 'border-ink !bg-ink text-white' : ''}`}>
          {o}
        </button>
      ))}
    </div>
  );
}

function ActionForm(props: { busy: boolean; onCancel: () => void; onSave: (body: { action_type: string; notes: string }) => void }) {
  const [type, setType] = useState(ACTION_TYPES[0]);
  const [notes, setNotes] = useState('');
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        props.onSave({ action_type: type, notes });
      }}
    >
      <Choice options={ACTION_TYPES} value={type} onChange={setType} />
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} required minLength={3} rows={2} placeholder="What exactly was done?" className="field resize-none" />
      <FormButtons busy={props.busy} onCancel={props.onCancel} label="Save" />
    </form>
  );
}

const RESULTS = ['The repair held', 'The problem came back'] as const;

function OutcomeForm(props: { action: Action; busy: boolean; onSave: (body: { observation: string; recurrence_detected: boolean; days_to_recurrence: number | null }) => void }) {
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState<(typeof RESULTS)[number]>(RESULTS[0]);
  const [days, setDays] = useState('');
  const [observation, setObservation] = useState('');
  const cameBack = result === RESULTS[1];

  if (!open) {
    return (
      <button type="button" className="btn btn-sm mt-2.5" onClick={() => setOpen(true)}>
        <Plus className="size-4" /> Record how it turned out
      </button>
    );
  }
  return (
    <form
      className="mt-3 flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        props.onSave({ observation, recurrence_detected: cameBack, days_to_recurrence: cameBack && days !== '' ? Number(days) : null });
      }}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <Choice options={RESULTS} value={result} onChange={setResult} />
        {cameBack && (
          <label className="flex items-center gap-2 text-sm text-dim">
            after
            <input type="number" min={0} max={3650} value={days} onChange={(e) => setDays(e.target.value)} className="field h-[30px] w-16 px-2 py-0 text-sm" />
            days
          </label>
        )}
      </div>
      <textarea value={observation} onChange={(e) => setObservation(e.target.value)} required minLength={3} rows={2} placeholder="What did the inspection find?" className="field resize-none" />
      <FormButtons busy={props.busy} onCancel={() => setOpen(false)} label="Save" />
    </form>
  );
}

export function LessonForm(props: {
  busy: boolean;
  initial: { title: string; lesson: string; protocol: string };
  onCancel: () => void;
  onSave: (body: { title: string; lesson_learned: string; recommended_protocol: string; status: 'draft' | 'validated' }) => void;
  /** Editing an existing lesson: its status is changed elsewhere. */
  editing?: boolean;
}) {
  const [title, setTitle] = useState(props.initial.title);
  const [lesson, setLesson] = useState(props.initial.lesson);
  const [protocol, setProtocol] = useState(props.initial.protocol);
  const [validated, setValidated] = useState(true);
  return (
    <form
      className="flex flex-col gap-3"
      onSubmit={(e) => {
        e.preventDefault();
        props.onSave({ title, lesson_learned: lesson, recommended_protocol: protocol, status: validated ? 'validated' : 'draft' });
      }}
    >
      <label className="flex flex-col gap-1.5">
        <span className="label">Name of the lesson</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} required minLength={3} maxLength={120} className="field" />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="label">What was learned</span>
        <textarea value={lesson} onChange={(e) => setLesson(e.target.value)} required minLength={3} rows={2} className="field resize-none" />
      </label>
      <label className="flex flex-col gap-1.5">
        <span className="label">What to do next time</span>
        <textarea
          value={protocol}
          onChange={(e) => setProtocol(e.target.value)}
          required
          minLength={3}
          rows={2}
          placeholder="This becomes the recommendation when the problem is reported at this place again."
          className="field resize-none"
        />
      </label>
      {!props.editing && (
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={validated} onChange={(e) => setValidated(e.target.checked)} className="size-4 accent-[#24558a]" />
          Validated: use it for recommendations straight away
        </label>
      )}
      <FormButtons busy={props.busy} onCancel={props.onCancel} label={props.editing ? 'Save changes' : 'Save lesson'} />
    </form>
  );
}

function FormButtons(props: { busy: boolean; onCancel: () => void; label: string }) {
  return (
    <div className="flex justify-end gap-2">
      <button type="button" className="btn btn-quiet btn-sm" onClick={props.onCancel}>
        Cancel
      </button>
      <button type="submit" disabled={props.busy} className="btn btn-primary btn-sm">
        {props.busy && <LoaderCircle className="size-4 animate-spin" />}
        {props.label}
      </button>
    </div>
  );
}
