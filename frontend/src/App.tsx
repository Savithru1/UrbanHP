import { useCallback, useEffect, useRef, useState } from 'react';
import { api } from './api';
import { History } from './components/History';
import { Results } from './components/Results';
import { UploadBox } from './components/UploadBox';
import { Viewer } from './components/Viewer';
import type { Health, Incident, IncidentDetail, LiveFrame } from './types';

export default function App() {
  const [detail, setDetail] = useState<IncidentDetail | null>(null);
  const [live, setLive] = useState<LiveFrame | null>(null);
  const [history, setHistory] = useState<Incident[]>([]);
  const [health, setHealth] = useState<Health | null>(null);
  const [busy, setBusy] = useState(false);
  const [activeId, setActiveId] = useState<string | null>(null);
  const currentId = useRef<string | null>(null);

  const refreshHistory = useCallback(() => api.list().then(setHistory).catch(() => {}), []);

  const open = useCallback(async (id: string) => {
    currentId.current = id;
    const d = await api.get(id);
    if (currentId.current === id) setDetail(d);
  }, []);

  // Live updates from the backend while a report is being analysed.
  useEffect(() => {
    refreshHistory();
    const source = new EventSource('/api/stream/events');
    source.onmessage = (e) => {
      const { event, data } = JSON.parse(e.data);
      if (event === 'frame') {
        if (data.incident_id === currentId.current) setLive(data);
      } else if (event === 'incident') {
        if (data.incident._id === currentId.current) {
          setDetail((d) => (d ? { ...d, incident: { ...d.incident, ...data.incident } } : d));
        }
        if (data.incident.status === 'failed') refreshHistory();
      } else if (event === 'update') {
        // A change was just written to MongoDB: show it under the report it belongs to.
        if (data.links.incident_id === currentId.current) {
          setDetail((d) => (d && !d.updates.some((u) => u._id === data._id) ? { ...d, updates: [...d.updates, data] } : d));
        }
      } else if (event === 'completed' || event === 'deleted') {
        if (event === 'completed' && data.incident_id === currentId.current) open(data.incident_id);
        refreshHistory();
      }
    };
    return () => source.close();
  }, [open, refreshHistory]);

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

  const submit = async (input: { file: File | null; text: string; location: string }) => {
    setBusy(true);
    try {
      const incident = await api.submit(input);
      setLive(null);
      await open(incident._id);
      refreshHistory();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!detail || !window.confirm('Delete this report and its detections from MongoDB?')) return;
    await api.remove(detail.incident._id);
    currentId.current = null;
    setDetail(null);
  };

  const notice = !health
    ? 'Cannot reach the UrbanHP server. Is the backend running?'
    : !health.database.connected
      ? 'MongoDB is not reachable. Start the MongoDB service and reload.'
      : health.detector.status === 'failed'
        ? `The detection model failed to load: ${health.detector.error}`
        : health.detector.status !== 'ready'
          ? 'Loading the detection model… the first start downloads it and can take a few minutes.'
          : null;

  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6">
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">UrbanHP</h1>
        <p className="mt-1 text-muted">Upload a photo, video or description of a street problem. It is detected and saved to MongoDB.</p>
      </header>

      {notice && <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">{notice}</p>}

      <UploadBox busy={busy} onSubmit={submit} />

      {detail && (
        <section className="grid items-start gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
          {detail.media ? (
            <div className="text-center">
              <Viewer detail={detail} live={live} activeId={activeId} />
            </div>
          ) : (
            <blockquote className="rounded-xl border border-line bg-panel p-5 text-lg leading-relaxed">“{detail.incident.citizen_text}”</blockquote>
          )}
          <Results detail={detail} activeId={activeId} onHover={setActiveId} onDelete={remove} />
        </section>
      )}

      <History incidents={history} currentId={detail?.incident._id ?? null} onSelect={open} />
    </main>
  );
}
