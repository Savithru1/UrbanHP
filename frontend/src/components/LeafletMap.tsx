import { useEffect, useRef } from 'react';
import L from 'leaflet';

export interface MapPin {
  id: string;
  lat: number;
  lng: number;
  color: string;
  /** Shown when the pointer rests on the pin. */
  label?: string;
  active?: boolean;
  draggable?: boolean;
}

interface Props {
  pins: MapPin[];
  className?: string;
  /** The view is fitted to the pins whenever this value changes. */
  fitKey?: string | number;
  /** How uncertain a position is: drawn as a circle of that radius in metres. */
  accuracy?: { lat: number; lng: number; radius: number } | null;
  controls?: boolean;
  onPick?: (lat: number, lng: number) => void;
  onDrag?: (id: string, lat: number, lng: number) => void;
  onSelect?: (id: string) => void;
}

// With no pins to show, the map opens on India.
const HOME: [number, number] = [22.6, 79.0];

/** A street map with report pins. A thin wrapper so the rest of the app never touches Leaflet. */
export function LeafletMap({ pins, className, fitKey, accuracy, controls = true, onPick, onDrag, onSelect }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const map = useRef<L.Map | null>(null);
  const layer = useRef<L.LayerGroup | null>(null);
  const circle = useRef<L.Circle | null>(null);
  // The pins on the map by id: a pin that is already there is moved or restyled, never drawn again.
  const markers = useRef(new Map<string, L.Marker>());
  // The map is built once; it reaches the latest callbacks through this.
  const handlers = useRef({ onPick, onDrag, onSelect });
  useEffect(() => {
    handlers.current = { onPick, onDrag, onSelect };
  });
  const fitted = useRef<string | number | undefined>(undefined);

  useEffect(() => {
    if (!el.current) return;
    const m = L.map(el.current, { zoomControl: controls, attributionControl: true, scrollWheelZoom: controls, dragging: controls }).setView(HOME, 4);
    // OpenStreetMap's own tiles need no key; they are toned down in CSS (.leaflet-tile-pane).
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors',
    }).addTo(m);
    m.attributionControl.setPrefix(false);
    layer.current = L.layerGroup().addTo(m);
    m.on('click', (e) => handlers.current.onPick?.(e.latlng.lat, e.latlng.lng));
    map.current = m;

    // The map must be told when its box changes size (tabs, responsive layout).
    const watch = new ResizeObserver(() => m.invalidateSize());
    watch.observe(el.current);
    const pinsOnMap = markers.current;
    return () => {
      watch.disconnect();
      m.remove();
      map.current = layer.current = circle.current = null;
      pinsOnMap.clear();
      fitted.current = undefined;
    };
  }, [controls]);

  useEffect(() => {
    const m = map.current;
    const group = layer.current;
    if (!m || !group) return;
    const known = markers.current;
    const wanted = new Set(pins.map((p) => p.id));
    for (const [id, marker] of known) {
      if (!wanted.has(id)) {
        marker.remove();
        known.delete(id);
      }
    }

    let arriving = 0;
    for (const pin of pins) {
      let marker = known.get(pin.id);
      if (!marker) {
        // A new pin drops into place, a moment after the one before it.
        const icon = L.divIcon({
          className: '',
          html: `<div class="map-dot is-new" style="animation-delay:${Math.min(arriving++, 12) * 35}ms"></div>`,
          iconSize: [16, 16],
          iconAnchor: [8, 8],
        });
        const added = L.marker([pin.lat, pin.lng], { icon, draggable: !!pin.draggable, keyboard: false });
        added.on('click', () => handlers.current.onSelect?.(pin.id));
        added.on('dragend', () => {
          const at = added.getLatLng();
          handlers.current.onDrag?.(pin.id, at.lat, at.lng);
        });
        added.addTo(group);
        known.set(pin.id, added);
        marker = added;
      } else {
        const at = marker.getLatLng();
        if (at.lat !== pin.lat || at.lng !== pin.lng) marker.setLatLng([pin.lat, pin.lng]);
      }

      const dot = marker.getElement()?.firstElementChild as HTMLElement | null | undefined;
      if (dot) {
        dot.style.setProperty('--pin', pin.color);
        dot.classList.toggle('is-active', !!pin.active);
      }
      marker.setZIndexOffset(pin.active ? 1000 : 0);
      if (pin.label) {
        // Text goes in as a node: titles come from user input and must never be parsed as HTML.
        const text = document.createElement('span');
        text.textContent = pin.label;
        if (marker.getTooltip()) marker.setTooltipContent(text);
        else marker.bindTooltip(text, { direction: 'top', offset: [0, -8], opacity: 1 });
      }
    }

    if (fitKey !== fitted.current) {
      fitted.current = fitKey;
      if (pins.length === 1) m.setView([pins[0].lat, pins[0].lng], Math.max(m.getZoom(), 16), { animate: true });
      else if (pins.length > 1) m.fitBounds(L.latLngBounds(pins.map((p) => [p.lat, p.lng] as [number, number])), { padding: [48, 48], maxZoom: 16 });
    }
  }, [pins, fitKey]);

  useEffect(() => {
    const m = map.current;
    if (!m) return;
    circle.current?.remove();
    circle.current = accuracy
      ? L.circle([accuracy.lat, accuracy.lng], { radius: accuracy.radius, color: '#24558a', weight: 1, fillColor: '#24558a', fillOpacity: 0.1, interactive: false }).addTo(m)
      : null;
  }, [accuracy]);

  return <div ref={el} className={className} />;
}
