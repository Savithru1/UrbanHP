import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import { api } from '../api';
import { Database } from '../components/Database';
import { Memory } from '../components/Memory';
import { Brand, Tabs } from '../components/Parts';
import { ReportView } from '../components/ReportView';
import { Reports } from '../components/Reports';
import { TONE } from '../format';
import { transition } from '../motion';
import type { Health, Incident, IncidentDetail, LiveFrame } from '../types';

type Tab = 'reports' | 'memory' | 'database';

/**
 * The admin page. Reports sent from the public page arrive here; this is where they are read,
 * acted on and learned from, and where the database can be watched as it changes.
 */
export default function AdminApp() {
  const [tab, setTab] = useState<Tab>('reports');
  const [detail, setDetail] = useState<IncidentDetail | null>(null);
  const [live, setLive] = useState<LiveFrame | null>(null);
  // Null until the list has been loaded once, so "no reports" is never shown while it is still on its way.
  const [reports, setReports] = useState<Incident[] | null>(null);
  // Reports that came in while this page was open and have not been opened yet.
  const [unseen, setUnseen] = useState<Set<string>>(() => new Set());
  // The report whose row was clicked and is loading; its picture is the one that grows into the report.
  const [opening, setOpening] = useState<string | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const currentId = useRef<string | null>(null);

  const refresh = useCallback(() => {
    api.list().then(setReports).catch(() => setReports((r) => r ?? []));
  }, []);

  const open = useCallback(async (id: string) => {
    currentId.current = id;
    setOpening(id);
    try {
      const d = await api.get(id);
      if (currentId.current !== id) return;
      transition(() => {
        setDetail(d);
        setTab('reports');
        setOpening(null);
        setUnseen((u) => {
          if (!u.has(id)) return u;
          const next = new Set(u);
          next.delete(id);
          return next;
        });
        window.scrollTo({ top: 0, behavior: 'instant' });
      });
    } catch {
      setOpening(null);
    }
  }, []);

  const close = useCallback(() => {
    currentId.current = null;
    setDetail(null);
    setLive(null);
    setOpening(null);
  }, []);

  /** The open report was changed on the server (a detection checked, an action recorded, …). */
  const reload = useCallback(async () => {
    const id = currentId.current;
    if (id) {
      const d = await api.get(id);
      if (currentId.current === id) setDetail(d);
    }
    refresh();
  }, [refresh]);

  // Everything the public page sends arrives over this stream, as it happens.
  useEffect(() => {
    refresh();
    const source = new EventSource('/api/stream/events');
    source.onmessage = (e) => {
      const { event, data } = JSON.parse(e.data);
      if (event === 'frame') {
        if (data.incident_id === currentId.current) setLive(data);
      } else if (event === 'incident') {
        if (data.incident._id === currentId.current) {
          setDetail((d) => (d ? { ...d, incident: { ...d.incident, ...data.incident } } : d));
        }
        // A report has just come in (or failed): show it in the list straight away.
        if (data.incident.status === 'received') {
          setUnseen((u) => new Set(u).add(data.incident._id));
          refresh();
        } else if (data.incident.status === 'failed') refresh();
      } else if (event === 'update') {
        // A change was just written to MongoDB: show it under the report it belongs to.
        if (data.links.incident_id === currentId.current) {
          setDetail((d) => (d && !d.updates.some((u) => u._id === data._id) ? { ...d, updates: [...d.updates, data] } : d));
        }
      } else if (event === 'completed' || event === 'deleted') {
        if (event === 'completed' && data.incident_id === currentId.current) {
          api.get(data.incident_id).then((d) => currentId.current === d.incident._id && setDetail(d)).catch(() => {});
        }
        refresh();
      }
    };
    return () => source.close();
  }, [refresh]);

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

  const remove = async () => {
    if (!detail || !window.confirm('Delete this report and its detections from MongoDB?')) return;
    await api.remove(detail.incident._id);
    transition(close);
    refresh();
  };

  /** Changing section, or choosing the one you are on, always lands on that section's first screen. */
  const go = (t: Tab) => {
    if (t === tab && !detail) return;
    transition(() => {
      close();
      setTab(t);
    });
  };

  const state = !health
    ? { label: 'Server offline', color: TONE.bad, note: 'Cannot reach the UrbanHP server. Is the backend running?' }
    : !health.database.connected
      ? { label: 'Database offline', color: TONE.bad, note: 'MongoDB is not reachable. Start the MongoDB service and reload.' }
      : health.detector.status === 'failed'
        ? { label: 'Models failed', color: TONE.bad, note: `The detection models failed to load: ${health.detector.error}` }
        : health.detector.status !== 'ready'
          ? { label: 'Loading models', color: TONE.warn, note: 'Loading the detection models, about half a minute. Written reports are already analysed.' }
          : { label: 'Ready', color: TONE.good, note: null };

  const tabs: { id: Tab; label: React.ReactNode }[] = [
    {
      id: 'reports',
      label: (
        <>
          Reports
          {unseen.size > 0 && <span className="settle ml-1.5 rounded-full bg-accent px-1.5 text-xs font-semibold leading-5 text-white">{unseen.size}</span>}
        </>
      ),
    },
    { id: 'memory', label: 'Memory' },
    { id: 'database', label: 'Database' },
  ];

  return (
    <>
      <header className="site-header sticky top-0 z-[1000] border-b border-line bg-bg/90 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-[88rem] items-center gap-5 px-5 sm:gap-10 sm:px-8">
          <Brand note="Admin" onClick={() => go('reports')} />
          <Tabs label="Sections" tabs={tabs} value={tab} onChange={go} className="h-full gap-5 sm:gap-7" />
          <div className="ml-auto flex items-center gap-6 max-md:hidden">
            <a href="/" target="_blank" rel="noreferrer" className="group inline-flex items-center gap-1 text-sm font-medium text-dim transition-colors hover:text-ink">
              Public page <ArrowUpRight className="size-4 transition-transform duration-200 group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
            </a>
            <span className="status" style={{ color: state.color }} title={health ? `MongoDB: ${health.database.name} · models on ${health.detector.device === 'cuda' ? 'GPU' : 'CPU'}` : undefined}>
              <span className="text-dim">{state.label}</span>
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-[88rem] px-5 py-10 sm:px-8">
        {state.note && <p className="fade-in mb-8 border-l-2 border-warn/70 pl-3.5 text-dim">{state.note}</p>}

        {detail ? (
          <div className="screen" key={detail.incident._id}>
            <button type="button" onClick={() => transition(close)} className="btn btn-quiet btn-sm group -ml-2.5 mb-5">
              <ArrowLeft className="size-4 transition-transform duration-200 group-hover:-translate-x-0.5" /> All reports
            </button>
            <ReportView detail={detail} live={live} onDelete={remove} onChanged={reload} onOpen={open} />
          </div>
        ) : tab === 'reports' ? (
          <Reports incidents={reports} unseen={unseen} opening={opening} onOpen={open} />
        ) : tab === 'memory' ? (
          <Memory onOpen={open} onChanged={refresh} />
        ) : (
          <Database onOpen={open} />
        )}
      </main>
    </>
  );
}
