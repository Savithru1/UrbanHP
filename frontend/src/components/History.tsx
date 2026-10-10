import { FileText } from 'lucide-react';
import type { Incident } from '../types';

interface Props {
  incidents: Incident[];
  currentId: string | null;
  onSelect: (id: string) => void;
}

/** Earlier reports; click one to open it again. */
export function History({ incidents, currentId, onSelect }: Props) {
  if (incidents.length === 0) return null;

  return (
    <section>
      <h2 className="mb-3 text-sm font-medium text-muted">Recent reports</h2>
      <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {incidents.map((i) => {
          const thumb = i.media?.kind === 'image' ? i.media.url : i.media?.poster_url;
          return (
            <li key={i._id}>
              <button
                type="button"
                onClick={() => onSelect(i._id)}
                className={`flex w-full items-center gap-3 rounded-lg border bg-panel p-2 text-left transition-colors hover:border-muted ${
                  i._id === currentId ? 'border-detect' : 'border-line'
                }`}
              >
                {thumb ? (
                  <img src={thumb} alt="" className="size-12 shrink-0 rounded object-cover" />
                ) : (
                  <span className="flex size-12 shrink-0 items-center justify-center rounded bg-ink text-muted">
                    <FileText className="size-5" />
                  </span>
                )}
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{i.title ?? (i.status === 'failed' ? 'Analysis failed' : 'Analyzing…')}</span>
                  <span className="block truncate text-xs text-muted">
                    {new Date(i.created_at).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
