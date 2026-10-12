import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, TriangleAlert } from 'lucide-react';
import { api } from '../api';
import { colorOf } from '../colors';
import { Brand } from '../components/Parts';
import { UploadBox } from '../components/UploadBox';
import { Viewer } from '../components/Viewer';
import { severityColor } from '../format';
import { transition } from '../motion';
import type { Health, LiveFrame, PinnedPlace, PublicReport } from '../types';

/**
 * The public page. It does one thing: take a report — a photo, a video or a description, and where —
 * and tell the person who sent it that it is registered. Everything after that happens on the admin page.
 */
export default function UserApp() {
  const [report, setReport] = useState<PublicReport | null>(null);
  const [live, setLive] = useState<LiveFrame | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [busy, setBusy] = useState(false);
  const currentId = useRef<string | null>(null);

  const load = useCallback(async (id: string) => {
    const r = await api.publicReport(id);
    if (currentId.current === id) setReport(r);
  }, []);

  // While the report is analysed the server pushes its progress; only this person's own report is listened for.
  useEffect(() => {
    const source = new EventSource('/api/stream/events');
    source.onmessage = (e) => {
      const { event, data } = JSON.parse(e.data);
      const id = currentId.current;
      if (!id) return;
      if (event === 'frame' && data.incident_id === id) setLive(data);
      else if (event === 'incident' && data.incident._id === id) {
        setReport((r) => (r ? { ...r, incident: { ...r.incident, status: data.incident.status, error: data.incident.error } } : r));
      } else if (event === 'completed' && data.incident_id === id) load(id).catch(() => {});
    };
    return () => source.close();
  }, [load]);

  // Should a pushed update be missed, asking again every few seconds still gets the result.
  const pending = report && (report.incident.status === 'received' || report.incident.status === 'analyzing') ? report.incident._id : null;
  useEffect(() => {
    if (!pending) return;
    const timer = setInterval(() => load(pending).catch(() => {}), 4000);
    return () => clearInterval(timer);
  }, [pending, load]);

  // Poll until the detection model has finished loading.
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const check = async () => {
      const h = await api.health().catch(() => null);
      setHealth(h);
      if (!h || h.detector.status !== 'ready') timer = setTimeout(check, 2500);
    };
    check();
    return () => clearTimeout(timer);
  }, []);

  const submit = async (input: { file: File | null; text: string; location: string; place: PinnedPlace | null }) => {
    setBusy(true);
    try {
      const incident = await api.submit(input);
      currentId.current = incident._id;
      const r = await api.publicReport(incident._id);
      // The chosen picture grows into the one that is scanned.
      transition(() => {
        setLive(null);
        setReport(r);
        window.scrollTo({ top: 0, behavior: 'instant' });
      });
    } finally {
      setBusy(false);
    }
  };

  const again = () => {
    if (!report) return;
    transition(() => {
      currentId.current = null;
      setReport(null);
      setLive(null);
    });
  };

  const note = !health
    ? 'The service cannot be reached right now. Please try again in a moment.'
    : !health.database.connected
      ? 'The service is not fully available right now. Please try again in a moment.'
      : health.detector.status === 'failed'
        ? 'Photos and videos cannot be checked right now. Written reports still work.'
        : health.detector.status !== 'ready'
          ? 'Getting ready to check photos and videos, about half a minute. Written reports already work.'
          : null;

  return (
    <>
      <header className="site-header sticky top-0 z-[1000] border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[88rem] items-center px-5 sm:px-8">
          <Brand onClick={again} />
        </div>
      </header>

      <main className="mx-auto max-w-[88rem] px-5 py-10 sm:px-8">
        {note && <p className="fade-in mb-8 border-l-2 border-warn/70 pl-3.5 text-dim">{note}</p>}

        {report ? (
          <div className="screen" key={report.incident._id}>
            <button type="button" onClick={again} className="btn btn-quiet btn-sm group -ml-2.5 mb-5">
              <ArrowLeft className="size-4 transition-transform duration-200 group-hover:-translate-x-0.5" /> Report another problem
            </button>
            <div className="grid grid-cols-1 items-start gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
              <div className="min-w-0">
                {report.media ? (
                  <div className="text-center">
                    <Viewer key={report.incident._id} detail={report} live={live} activeId={null} />
                  </div>
                ) : (
                  <blockquote className="panel p-7 text-2xl leading-snug">
                    <span className="label mb-3">Your report</span>
                    {report.incident.citizen_text}
                  </blockquote>
                )}
              </div>
              <Receipt report={report} onAgain={again} />
            </div>
          </div>
        ) : (
          <div className="screen flex flex-col gap-7">
            <header>
              <h1 className="text-4xl">Report a street problem</h1>
              <p className="mt-2.5 text-lg text-dim">Add a photo or video, say what is wrong, and pin where it is.</p>
            </header>
            <UploadBox busy={busy} onSubmit={submit} />
          </div>
        )}
      </main>
    </>
  );
}

/** A tick that draws itself: the ring first, then the mark. */
function Tick() {
  return (
    <svg viewBox="0 0 24 24" className="tick mt-0.5 size-7 shrink-0 text-good" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="10" transform="rotate(-90 12 12)" />
      <path d="m7.5 12.4 3 3 6-6.4" />
    </svg>
  );
}

/** What the sender is told: that it is being checked, then whether it is registered, and what was seen in it. */
function Receipt({ report, onAgain }: { report: PublicReport; onAgain: () => void }) {
  const { incident, detections } = report;

  if (incident.status === 'failed') {
    return (
      <section className="card settle p-6">
        <h1 className="flex items-center gap-2.5 text-2xl">
          <TriangleAlert className="size-6 text-bad" /> This report could not be checked
        </h1>
        <p className="mt-2 text-dim">Something went wrong while it was being analysed. Nothing was registered. Please send it again.</p>
        <button type="button" onClick={onAgain} className="btn btn-primary mt-6">
          Try again
        </button>
      </section>
    );
  }

  if (incident.status !== 'completed') {
    return (
      <section className="card p-6">
        <h1 className="text-2xl">Checking your report</h1>
        <p className="mt-2 text-dim">It has been received. A photo takes a few seconds; a video takes longer, frame by frame.</p>
        <div className="progress mt-6" />
      </section>
    );
  }

  const reg = incident.registration;
  // The first sentence is the answer; the rest explains it.
  const [headline, ...rest] = (reg?.message ?? 'Received').split('. ');
  const tone = reg?.state === 'already_registered' ? 'text-accent' : reg?.state === 'recurrence' ? 'text-warn' : 'text-ink';

  return (
    // Keyed by the outcome, so the card settles in afresh when "checking" turns into the answer.
    <section key="done" className="card settle p-6">
      <h1 className={`flex items-start gap-3 text-2xl ${tone}`}>
        {reg?.state === 'new' && <Tick />}
        {headline.replace(/\.$/, '')}
      </h1>
      {rest.length > 0 && <p className="mt-2 text-[17px] leading-relaxed">{rest.join('. ')}</p>}
      {!reg && <p className="mt-2 text-[17px] leading-relaxed text-dim">No known street problem was recognised in it automatically, so nothing was assigned to a department.</p>}

      {detections.length > 0 && (
        <div className="mt-6">
          <h2 className="label">What was found</h2>
          <ul className="stagger mt-1 divide-y divide-line">
            {detections.map((d) => (
              <li key={d._id} className="flex items-center gap-3 py-2.5">
                <span className="size-2.5 shrink-0 rounded-full" style={{ background: colorOf(d.links.issue_type_id) }} />
                <span className="min-w-0 flex-1 truncate font-medium">{d.label}</span>
                <span className="shrink-0 text-sm font-medium" style={{ color: severityColor(d.severity) }}>
                  {d.severity_label}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <dl className="mt-6 grid grid-cols-[auto_minmax(0,1fr)] gap-x-5 gap-y-1.5 border-t border-line pt-5 text-[15px]">
        <dt className="text-dim">Reference</dt>
        <dd className="truncate font-mono">{incident._id}</dd>
        {incident.location && (
          <>
            <dt className="text-dim">Location</dt>
            <dd className="truncate">{incident.location}</dd>
          </>
        )}
        {!!incident.departments?.length && (
          <>
            <dt className="text-dim">Handled by</dt>
            <dd className="truncate">{incident.departments.join(', ')}</dd>
          </>
        )}
      </dl>

      <button type="button" onClick={onAgain} className="btn btn-primary mt-6 w-full">
        Report another problem <ArrowRight className="nudge size-4" />
      </button>
    </section>
  );
}
