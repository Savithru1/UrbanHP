import { useEffect, useRef, useState } from 'react';
import { colorOf } from '../colors';
import type { BBox, Detection, IncidentDetail, LiveFrame, Outline, OverlayBox } from '../types';

interface Props {
  detail: IncidentDetail;
  live: LiveFrame | null;
  activeId: string | null;
}

/** The uploaded image or video with every detection outlined, boxed and labelled on top of it. */
export function Viewer({ detail, live, activeId }: Props) {
  const { incident, media, detections } = detail;
  const done = incident.status === 'completed';
  const videoRef = useRef<HTMLVideoElement>(null);
  const [videoTime, setVideoTime] = useState(0);
  // The URL of a video this browser failed to play (e.g. an unsupported codec).
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const videoBroken = !!media && brokenUrl === media.url;
  // Width / height of the picture, so it can be scaled up to fill the space without distorting the overlay.
  const [measured, setMeasured] = useState<{ url: string; ratio: number } | null>(null);

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
    if (w > 0 && h > 0) setMeasured({ url: media.url, ratio: w / h });
  };

  const liveFrame = !done && live?.incident_id === incident._id ? live : null;
  const step = incident.analysis?.sample_interval_s ?? 0.5;

  let boxes: OverlayBox[];
  let element: React.ReactNode;

  if (media.kind === 'image') {
    boxes = done ? detections.filter((d) => d.bbox).map(toOverlay) : (liveFrame?.boxes ?? []);
    element = <img src={media.url} alt={media.file_name} onLoad={(e) => measure(e.currentTarget.naturalWidth, e.currentTarget.naturalHeight)} />;
  } else if (!done) {
    // Analysis in progress: show each frame as the detector finishes it.
    boxes = liveFrame?.boxes ?? [];
    element = liveFrame?.image ? <img src={liveFrame.image} alt="Frame being analysed" /> : <video src={media.url} muted playsInline preload="metadata" />;
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

  const analysing = incident.status === 'received' || incident.status === 'analyzing';
  const when = new Date(incident.created_at);
  const status = incident.status === 'completed' ? 'Complete' : incident.status === 'failed' ? 'Failed' : 'Analyzing';

  return (
    <div
      className={`viewer${ratio ? ' is-sized' : ''}`}
      style={ratio ? { aspectRatio: String(ratio), width: `min(100%, calc(72vh * ${ratio}))` } : undefined}
    >
      {element}
      <div className="viewer-overlay">
        {analysing && media.kind === 'image' && <div className="scanline" />}

        {/* Outlines and boxes: drawn in a 0-100 coordinate space stretched over the picture. */}
        <svg viewBox="0 0 100 100" preserveAspectRatio="none">
          {boxes.map((b) => {
            const color = colorOf(b.issue_type);
            const active = b.id === activeId;
            return (
              <g key={b.id}>
                {b.mask && (
                  <polygon
                    points={b.mask.map(([x, y]) => `${x * 100},${y * 100}`).join(' ')}
                    fill={color.fill}
                    fillOpacity={active ? 0.75 : 0.55}
                    stroke={color.fill}
                    strokeWidth={1}
                  />
                )}
                <rect
                  x={b.bbox.x * 100}
                  y={b.bbox.y * 100}
                  width={b.bbox.w * 100}
                  height={b.bbox.h * 100}
                  fill="none"
                  stroke={color.box}
                  strokeWidth={active ? 4 : 2.5}
                  strokeDasharray={b.approximate_location ? '8 6' : undefined}
                />
              </g>
            );
          })}
        </svg>

        {/* Labels are plain HTML so the text is never stretched with the picture. */}
        {boxes.map((b) => (
          <span
            key={b.id}
            className={`det-label${b.bbox.y < 0.06 ? ' is-inside' : ''}`}
            style={{ left: `${b.bbox.x * 100}%`, top: `${b.bbox.y * 100}%`, background: colorOf(b.issue_type).box }}
          >
            {b.label.toLowerCase()} {b.confidence.toFixed(2)}
            <span className="det-severity">severity {b.severity}</span>
          </span>
        ))}

        <div className="hud">
          <div className="hud-title">Road inspection • AI detection</div>
          <dl>
            <dt>Date:</dt>
            <dd>{when.toLocaleDateString('en-CA')}</dd>
            <dt>Time:</dt>
            <dd>{when.toLocaleTimeString('en-GB')}</dd>
            <dt>Source:</dt>
            <dd>{media.kind}</dd>
            {liveFrame && media.kind === 'video' && (
              <>
                <dt>Frame:</dt>
                <dd>
                  {liveFrame.index} / {liveFrame.total}
                </dd>
              </>
            )}
            <dt>Detections:</dt>
            <dd>{done ? detections.filter((d) => d.bbox).length : boxes.length}</dd>
            <dt>Status:</dt>
            <dd className="accent">{status}</dd>
          </dl>
        </div>
      </div>
    </div>
  );
}

function toOverlay(d: Detection): OverlayBox {
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
function boxesAt(detections: Detection[], t: number, step: number): OverlayBox[] {
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
