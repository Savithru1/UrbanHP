import { useEffect, useRef, useState } from 'react';
import { Eye, EyeOff, RotateCcw } from 'lucide-react';
import { colorOf } from '../colors';
import { calm } from '../motion';
import type { BBox, DrawnDetection, LiveFrame, Outline, OverlayBox, Scannable } from '../types';

interface Props {
  detail: Scannable;
  live: LiveFrame | null;
  activeId: string | null;
  /** One quiet line about the file and how it was analysed. */
  caption?: string;
}

/**
 * How the scanner is behaving:
 *   scan    a light bar sweeps the picture again and again while the models are looking
 *   reveal  one last pass: what was found is painted in where the bar has been
 *   idle    the finished result, still
 */
type Phase = 'scan' | 'reveal' | 'idle';

/** The uploaded image or video with every detection outlined on top of it. Mount it with `key={incident._id}`. */
export function Viewer({ detail, live, activeId, caption }: Props) {
  const { incident, media } = detail;
  // A detection a person rejected is no longer drawn.
  const detections = detail.detections.filter((d) => d.status !== 'rejected');
  const done = incident.status === 'completed';
  const analysing = incident.status === 'received' || incident.status === 'analyzing';
  const isImage = media?.kind === 'image';

  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoTime, setVideoTime] = useState(0);
  // The URL of a video this browser failed to play (e.g. an unsupported codec).
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const videoBroken = !!media && brokenUrl === media.url;
  // Width / height of the picture, so it can be scaled up to fill the space without distorting the overlay.
  const [measured, setMeasured] = useState<{ url: string; ratio: number } | null>(null);
  // Show the upload as it came in, with nothing drawn on it.
  const [bare, setBare] = useState(false);

  // A picture that is already analysed is still revealed by one pass of the bar when it is opened.
  const [stage, setStage] = useState<Phase>(() => (calm() ? 'idle' : analysing ? 'scan' : isImage && done ? 'reveal' : 'idle'));
  const liveFrame = !done && live?.incident_id === incident._id ? live : null;
  // For a picture, the result exists as soon as the detector has answered; the bar finishes its pass first.
  const resultReady = done || (isImage && liveFrame !== null);
  // A video has no last pass (its outlines follow the footage), and a failed analysis has nothing to show.
  const phase: Phase = stage === 'scan' && (incident.status === 'failed' || (done && !isImage)) ? 'idle' : stage;

  // Should the pass never report its end (a hidden tab pauses animations), do not wait for it forever.
  useEffect(() => {
    if (phase !== 'scan' || !isImage || !resultReady) return;
    const timer = setTimeout(() => setStage((s) => (s === 'scan' ? 'reveal' : s)), 2600);
    return () => clearTimeout(timer);
  }, [phase, isImage, resultReady]);

  // Follow the playing video so the outlines stay on their targets.
  const playingVideo = media?.kind === 'video' && done && !videoBroken;
  useEffect(() => {
    if (!playingVideo) return;
    let raf = 0;
    const tick = () => {
      const t = videoRef.current?.currentTime ?? 0;
      setVideoTime((prev) => (Math.abs(prev - t) > 0.01 ? t : prev));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playingVideo]);

  if (!media) return null;

  const measure = (w: number, h: number) => {
    if (w > 0 && h > 0) setMeasured((m) => (m?.url === media.url && Math.abs(m.ratio - w / h) < 0.001 ? m : { url: media.url, ratio: w / h }));
  };

  /** A picture is scanned and revealed again; a video starts over from its first frame. */
  const replay = () => {
    setBare(false);
    if (isImage) {
      if (!calm()) setStage('scan');
    } else if (videoRef.current) {
      videoRef.current.currentTime = 0;
      void videoRef.current.play().catch(() => {});
    }
  };

  const step = incident.analysis?.sample_interval_s ?? 0.5;
  let boxes: OverlayBox[];
  let element: React.ReactNode;

  if (isImage) {
    // Nothing is drawn while the bar is still looking: the result arrives with its last pass.
    boxes = phase === 'scan' ? [] : done ? detections.filter((d) => d.bbox).map(toOverlay) : (liveFrame?.boxes ?? []);
    element = <img src={media.url} alt={media.file_name} onLoad={(e) => measure(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)} />;
  } else if (!done) {
    // Analysis in progress: show each frame as the detector finishes it.
    boxes = liveFrame?.boxes ?? [];
    // Measured like the finished video, so the picture keeps one size from the first frame to the result.
    element = liveFrame?.image ? (
      <img src={liveFrame.image} alt="Frame being analysed" onLoad={(e) => measure(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)} />
    ) : (
      <video src={media.url} muted playsInline preload="metadata" onLoadedMetadata={(e) => measure(e.currentTarget.videoWidth, e.currentTarget.videoHeight)} />
    );
  } else if (videoBroken && media.poster_url) {
    // The browser cannot play this format: fall back to the busiest frame.
    boxes = boxesAt(detections, media.poster_time_s ?? 0, step);
    element = <img src={media.poster_url} alt={media.file_name} />;
  } else {
    boxes = boxesAt(detections, videoTime, step);
    element = (
      <video
        ref={videoRef} src={media.url} controls autoPlay loop muted playsInline
        onLoadedMetadata={(e) => measure(e.currentTarget.videoWidth, e.currentTarget.videoHeight)}
        onError={() => setBrokenUrl(media.url)}
      />
    );
  }

  const ratio = media.width && media.height ? media.width / media.height : measured?.url === media.url ? measured.ratio : null;
  const shapes = (lit: boolean) =>
    boxes.map((b) => {
      const color = lit ? '#ffffff' : colorOf(b.issue_type);
      const active = !lit && b.id === activeId;
      return (
        <g key={b.id}>
          {b.mask && (
            <polygon
              points={b.mask.map(([x, y]) => `${x * 100},${y * 100}`).join(' ')}
              fill={color}
              fillOpacity={lit ? 0.4 : active ? 0.42 : 0.22}
              stroke={color}
              strokeWidth={active ? 3 : 2}
              strokeLinejoin="round"
            />
          )}
          {/* With an outline the box is a thin frame around it; without one it is all there is. */}
          {(!lit || !b.mask) && (
            <rect
              x={b.bbox.x * 100} y={b.bbox.y * 100} width={b.bbox.w * 100} height={b.bbox.h * 100}
              fill={b.mask ? 'none' : color}
              fillOpacity={b.mask ? 0 : lit ? 0.3 : 0.14}
              stroke={color}
              strokeOpacity={b.mask ? 0.8 : 1}
              strokeWidth={active ? 2.5 : b.mask ? 1.25 : 2}
              strokeDasharray={b.approximate_location ? '7 5' : undefined}
            />
          )}
        </g>
      );
    });

  const note = analysing ? (media.kind === 'video' && liveFrame ? `Scanning frame ${liveFrame.index} of ${liveFrame.total}` : 'Scanning') : null;
  const canReplay = done && phase === 'idle' && !videoBroken && !(isImage && calm());

  return (
    // The picture and the line under it share one width, so the controls sit under the picture's own edges.
    <div className={ratio ? 'mx-auto' : 'inline-block max-w-full'} style={ratio ? { width: `min(100%, calc(76vh * ${ratio}))` } : undefined}>
      <div className={`viewer${ratio ? ' is-sized' : ''}`} style={ratio ? { aspectRatio: String(ratio) } : undefined}>
        {element}
        <div
          className={`scan is-${phase}${bare ? ' is-bare' : ''}`}
          onAnimationIteration={(e) => {
            // The bar has reached the bottom: if the result is in, its next pass is the one that shows it.
            if (e.animationName === 'sweep' && isImage && resultReady) setStage('reveal');
          }}
          onAnimationEnd={(e) => {
            if (e.animationName === 'sweep-once') setStage('idle');
          }}
        >
          {/* Outlines: drawn in a 0-100 coordinate space stretched over the picture. */}
          <svg className="marks" viewBox="0 0 100 100" preserveAspectRatio="none">
            {shapes(false)}
          </svg>
          {phase !== 'idle' && (
            <svg className="marks-lit" viewBox="0 0 100 100" preserveAspectRatio="none">
              {shapes(true)}
            </svg>
          )}

          {/* Labels are plain HTML so the text is never stretched with the picture. */}
          <div className="mark-labels">
            {boxes.map((b) => {
              // A box near the right edge has its label hung from its right corner, so the name is never cut off.
              const flipped = b.bbox.x > 0.6;
              const side = flipped ? { right: `${Math.max(0, 1 - b.bbox.x - b.bbox.w) * 100}%` } : { left: `${b.bbox.x * 100}%` };
              return (
                <span key={b.id} className={`mark-label${b.bbox.y < 0.08 ? ' is-inside' : ''}${flipped ? ' is-flipped' : ''}`} style={{ ...side, top: `${b.bbox.y * 100}%` }}>
                  <i style={{ background: colorOf(b.issue_type) }} />
                  {b.label}
                  <small>{Math.round(b.confidence * 100)}%</small>
                </span>
              );
            })}
          </div>

          {phase !== 'idle' && (
            <>
              <div className="scan-light" />
              <div className="scan-bar" />
            </>
          )}
          <div className="frame" />
        </div>
        {note && <div className="viewer-note">{note}</div>}
      </div>

      {done && (
        <div className="mt-3 flex flex-wrap items-center gap-x-1 gap-y-2 text-left">
          <button type="button" onClick={replay} disabled={!canReplay} className="btn btn-quiet btn-sm -ml-2" title={isImage ? 'Scan the picture again' : 'Play the video from the start'}>
            <RotateCcw className="size-4" /> Replay
          </button>
          <button type="button" onClick={() => setBare((b) => !b)} className="btn btn-quiet btn-sm" title="Switch between the original upload and the outlined result" aria-pressed={bare}>
            {bare ? <Eye className="size-4" /> : <EyeOff className="size-4" />}
            {bare ? 'Show outlines' : 'Original'}
          </button>
          {caption && <p className="ml-auto min-w-0 truncate text-sm text-faint">{caption}</p>}
        </div>
      )}
    </div>
  );
}

function toOverlay(d: DrawnDetection): OverlayBox {
  return {
    id: d._id, issue_type: d.links.issue_type_id, label: d.label, severity: d.severity, confidence: d.confidence,
    bbox: d.bbox!, mask: d.mask, approximate_location: d.approximate_location,
  };
}

/** Moves an outline drawn for one box so that it fits another (the object has moved between frames). */
function fitOutline(mask: Outline | null, from: BBox, to: BBox): Outline | null {
  if (!mask || from.w <= 0 || from.h <= 0) return null;
  return mask.map(([x, y]) => [to.x + ((x - from.x) / from.w) * to.w, to.y + ((y - from.y) / from.h) * to.h]);
}

/** Where every tracked detection is at time `t` of the video, interpolated between analysed frames. */
function boxesAt(detections: DrawnDetection[], t: number, step: number): OverlayBox[] {
  const out: OverlayBox[] = [];
  for (const d of detections) {
    const path = d.video?.path;
    if (!path?.length) continue;
    // Keep an object on screen slightly before and after the frames it was seen in.
    if (t < path[0].t - step / 2 || t > path[path.length - 1].t + step / 2) continue;

    let i = 0;
    while (i < path.length - 1 && path[i + 1].t <= t) i++;
    const a = path[i];
    const b = path[Math.min(i + 1, path.length - 1)];
    let bbox: BBox = { x: a.x, y: a.y, w: a.w, h: a.h };
    let nearest = a;
    if (b.t > a.t && t > a.t) {
      // The object went unseen for a while between these two frames: do not draw it mid-gap.
      if (b.t - a.t > step * 2.6 && t - a.t > step / 2 && b.t - t > step / 2) continue;
      const k = Math.min(1, (t - a.t) / (b.t - a.t));
      bbox = { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, w: a.w + (b.w - a.w) * k, h: a.h + (b.h - a.h) * k };
      if (k > 0.5) nearest = b;
    }
    out.push({
      id: d._id, issue_type: d.links.issue_type_id, label: d.label, severity: d.severity, confidence: d.confidence,
      bbox, mask: fitOutline(nearest.mask, nearest, bbox), approximate_location: d.approximate_location,
    });
  }
  return out;
}
