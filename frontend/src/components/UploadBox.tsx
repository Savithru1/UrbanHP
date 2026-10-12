import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowRight, ImagePlus, LoaderCircle, LocateFixed, RefreshCw, X } from 'lucide-react';
import { nameOfPlace } from '../api';
import { TONE } from '../format';
import type { PinnedPlace } from '../types';
import { LeafletMap, type MapPin } from './LeafletMap';

interface Props {
  busy: boolean;
  onSubmit: (input: { file: File | null; text: string; location: string; place: PinnedPlace | null }) => Promise<void>;
}

const sizeOf = (bytes: number) => (bytes < 1e6 ? `${Math.max(1, Math.round(bytes / 1e3))} KB` : `${(bytes / 1e6).toFixed(1)} MB`);

/** The one form in the app: a photo or video, a description, and where it is. */
export function UploadBox({ busy, onSubmit }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [location, setLocation] = useState('');
  const [place, setPlace] = useState<PinnedPlace | null>(null);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  // A local preview of the chosen file: the picture itself, or the video ready to play.
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file]);
  useEffect(() => () => void (preview && URL.revokeObjectURL(preview)), [preview]);
  const isVideo = !!file?.type.startsWith('video/');

  const choose = (f: File | undefined | null) => {
    if (!f) return;
    if (!f.type.startsWith('image/') && !f.type.startsWith('video/')) {
      setError('That file is not an image or a video.');
      return;
    }
    setError(null);
    setFile(f);
  };

  const clearFile = () => {
    setFile(null);
    if (picker.current) picker.current.value = '';
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file && !text.trim()) {
      setError('Add a photo or video, or describe the problem.');
      return;
    }
    setError(null);
    try {
      await onSubmit({ file, text, location, place });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  };

  const drop = {
    onDragOver: (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(true);
    },
    onDragLeave: () => setDragging(false),
    onDrop: (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      choose(e.dataTransfer.files[0]);
    },
  };

  return (
    <form onSubmit={submit} className="panel grid grid-cols-1 overflow-hidden lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <input ref={picker} type="file" accept="image/*,video/*" hidden onChange={(e) => choose(e.target.files?.[0])} />

      {file && preview ? (
        // The chosen file, as it will be sent: a picture to look at, or a video to play through first.
        <div {...drop} className={`fade-in flex min-h-[26rem] flex-col border-line max-lg:border-b lg:border-r ${dragging ? 'bg-accent/[0.07]' : 'bg-raised/60'}`}>
          <div className="flex min-h-0 flex-1 items-center justify-center p-5">
            {/* Named so that, on sending, this picture grows into the one that is scanned. */}
            {isVideo ? (
              <video key={preview} src={preview} controls muted playsInline preload="metadata" className="settle max-h-[30rem] w-full rounded-xl bg-ink" style={{ viewTransitionName: 'report-media' }} />
            ) : (
              <img key={preview} src={preview} alt="The chosen file" className="settle max-h-[30rem] w-full object-contain" style={{ viewTransitionName: 'report-media' }} />
            )}
          </div>
          <div className="flex items-center gap-2 border-t border-line bg-surface px-5 py-3">
            <p className="min-w-0 flex-1 truncate">
              <span className="font-medium">{file.name}</span> <span className="text-faint">· {sizeOf(file.size)}</span>
            </p>
            <button type="button" onClick={() => picker.current?.click()} className="btn btn-quiet btn-sm shrink-0">
              <RefreshCw className="size-4" /> Replace
            </button>
            <button type="button" onClick={clearFile} className="btn btn-quiet btn-sm shrink-0">
              <X className="size-4" /> Remove
            </button>
          </div>
        </div>
      ) : (
        <div
          {...drop}
          role="button"
          tabIndex={0}
          aria-label="Choose a photo or video"
          onClick={() => picker.current?.click()}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && picker.current?.click()}
          className={`group relative flex min-h-[26rem] cursor-pointer flex-col items-center justify-center gap-1.5 border-line p-8 text-center transition-colors duration-300 max-lg:border-b lg:border-r ${
            dragging ? 'bg-accent/[0.07]' : 'hover:bg-ink/[0.02]'
          }`}
        >
          {/* A camera's corner marks: they open outwards when a file is brought near. */}
          <span className={`frame group-hover:[--reach:14px] group-focus-visible:[--reach:14px] ${dragging ? '[--frame:var(--color-accent)] [--reach:14px]' : 'group-hover:[--frame:#8a8b8e]'}`} />
          <span
            className={`mb-3 flex size-14 items-center justify-center rounded-2xl border bg-card transition-all duration-300 ease-out group-hover:-translate-y-1 group-hover:shadow-[0_10px_24px_-14px_rgb(28_29_31/0.5)] ${
              dragging ? '-translate-y-1 border-accent/50 text-accent' : 'border-line text-dim'
            }`}
          >
            <ImagePlus className="size-6" strokeWidth={1.6} />
          </span>
          <span className="text-xl font-semibold">Drop a photo or video</span>
          <span className="text-dim">or click to choose a file</span>
        </div>
      )}

      <div className="flex flex-col gap-6 p-6 sm:p-7">
        <label className="field-group flex flex-col gap-2">
          <span className="label">Description</span>
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={4} placeholder="What is wrong? Optional if you add a file." className="field resize-none" />
        </label>

        <LocationPicker place={place} onPlace={setPlace} location={location} onLocation={setLocation} />

        <div className="mt-auto flex items-center justify-between gap-4">
          <p className="text-sm text-bad" role="alert">
            {error}
          </p>
          <button type="submit" disabled={busy} className="btn btn-primary h-12 shrink-0 px-7 text-base">
            {busy ? 'Sending' : 'Send report'}
            {busy ? <LoaderCircle className="size-4 animate-spin" /> : <ArrowRight className="nudge size-4" />}
          </button>
        </div>
      </div>
    </form>
  );
}

interface PickerProps {
  place: PinnedPlace | null;
  onPlace: (p: PinnedPlace | null) => void;
  location: string;
  onLocation: (s: string) => void;
}

/** Where the problem is: the device's live position, or a pin placed and dragged by hand. */
function LocationPicker({ place, onPlace, location, onLocation }: PickerProps) {
  const [locating, setLocating] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // The name in the box was filled in from the pin (so a newer pin may replace it); typing takes that over.
  const named = useRef(false);
  // Raised whenever the map should move to the pin (not while it is being dragged).
  const [fit, setFit] = useState(0);

  const locate = () => {
    if (!navigator.geolocation) {
      setNote('This browser cannot share its location. Click the map to drop a pin instead.');
      return;
    }
    setLocating(true);
    setNote(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        setFit((n) => n + 1);
        onPlace({ lat: pos.coords.latitude, lng: pos.coords.longitude, accuracy: pos.coords.accuracy, source: 'gps' });
      },
      (err) => {
        setLocating(false);
        setNote(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission was denied. Allow it for this page, or click the map to drop a pin.'
            : 'Your position could not be read. Click the map to drop a pin instead.',
        );
      },
      { enableHighAccuracy: true, timeout: 12000, maximumAge: 0 },
    );
  };

  const pin = (lat: number, lng: number, refit: boolean) => {
    if (refit) setFit((n) => n + 1);
    setNote(null);
    onPlace({ lat, lng, accuracy: null, source: 'pin' });
  };

  // Name the pinned place, unless the person has typed their own.
  const lat = place?.lat;
  const lng = place?.lng;
  useEffect(() => {
    if (lat == null || lng == null) return;
    if (location && !named.current) return;
    const stop = new AbortController();
    const timer = setTimeout(async () => {
      const name = await nameOfPlace(lat, lng, stop.signal);
      if (name && !stop.signal.aborted) {
        named.current = true;
        onLocation(name);
      }
    }, 500);
    return () => {
      clearTimeout(timer);
      stop.abort();
    };
    // Only a new position should trigger a lookup, not every keystroke in the name box.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lat, lng]);

  const pins: MapPin[] = useMemo(
    () => (lat != null && lng != null ? [{ id: 'new', lat, lng, color: TONE.accent, draggable: true, active: true }] : []),
    [lat, lng],
  );
  const accuracy = useMemo(
    () => (place?.accuracy && lat != null && lng != null ? { lat, lng, radius: place.accuracy } : null),
    [place?.accuracy, lat, lng],
  );

  return (
    <div className="field-group flex flex-col gap-2">
      <div className="flex items-end justify-between gap-3">
        <label htmlFor="location" className="label">
          Location
        </label>
        <button type="button" onClick={locate} disabled={locating} className="btn btn-quiet btn-sm -mr-2.5 !text-accent">
          {locating ? <LoaderCircle className="size-4 animate-spin" /> : <LocateFixed className="size-4" />}
          {locating ? 'Locating' : 'Use my location'}
        </button>
      </div>
      <input
        id="location"
        value={location}
        onChange={(e) => {
          named.current = false;
          onLocation(e.target.value);
        }}
        placeholder="Street or landmark"
        className="field"
      />
      <div className="relative mt-1 h-52 overflow-hidden rounded-xl border border-line">
        <LeafletMap pins={pins} accuracy={accuracy} fitKey={fit} className="size-full" onPick={(a, b) => pin(a, b, !place)} onDrag={(_, a, b) => pin(a, b, false)} />
        {place && (
          <button
            type="button"
            title="Remove the pin"
            onClick={() => {
              onPlace(null);
              if (named.current) onLocation('');
              named.current = false;
            }}
            className="btn btn-sm btn-icon absolute right-2.5 top-2.5 z-[500]"
          >
            <X className="size-4" />
          </button>
        )}
      </div>
      <p className={`min-h-[1.3rem] text-sm ${note ? 'text-warn' : 'text-faint'}`}>
        {note ??
          (place
            ? `${place.lat.toFixed(5)}, ${place.lng.toFixed(5)} · ${place.source === 'gps' ? `live position${place.accuracy ? `, within ${Math.round(place.accuracy)} m` : ''}` : 'pinned by hand'} · drag the pin to adjust`
            : 'Use your live position, or click the map to drop a pin.')}
      </p>
    </div>
  );
}
