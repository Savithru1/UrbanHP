import { useRef, useState } from 'react';
import { ImageUp, LoaderCircle, X } from 'lucide-react';

interface Props {
  busy: boolean;
  onSubmit: (input: { file: File | null; text: string; location: string }) => Promise<void>;
}

/** The one form in the app: a photo or video, a description, or both. */
export function UploadBox({ busy, onSubmit }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [location, setLocation] = useState('');
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const picker = useRef<HTMLInputElement>(null);

  const choose = (f: File | undefined | null) => {
    if (!f) return;
    if (!f.type.startsWith('image/') && !f.type.startsWith('video/')) {
      setError('That file is not an image or a video.');
      return;
    }
    setError(null);
    setFile(f);
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file && !text.trim()) {
      setError('Add a photo or video, or describe the problem.');
      return;
    }
    setError(null);
    try {
      await onSubmit({ file, text, location });
      setFile(null);
      setText('');
      setLocation('');
      if (picker.current) picker.current.value = '';
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  };

  return (
    <form onSubmit={submit} className="rounded-xl border border-line bg-panel p-4 sm:p-5">
      <div className="grid gap-4 md:grid-cols-2">
        <div
          role="button"
          tabIndex={0}
          onClick={() => picker.current?.click()}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && picker.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            choose(e.dataTransfer.files[0]);
          }}
          className={`flex min-h-36 cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 text-center transition-colors ${
            dragging ? 'border-detect bg-detect/10' : 'border-line hover:border-muted'
          }`}
        >
          <input ref={picker} type="file" accept="image/*,video/*" hidden onChange={(e) => choose(e.target.files?.[0])} />
          {file ? (
            <>
              <span className="max-w-full truncate font-medium">{file.name}</span>
              <span className="text-sm text-muted">{(file.size / 1024 / 1024).toFixed(1)} MB</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setFile(null);
                  if (picker.current) picker.current.value = '';
                }}
                className="mt-1 inline-flex items-center gap-1 text-sm text-muted hover:text-white"
              >
                <X className="size-4" /> Remove
              </button>
            </>
          ) : (
            <>
              <ImageUp className="size-7 text-muted" />
              <span className="font-medium">Drop a photo or video here</span>
              <span className="text-sm text-muted">or click to choose a file</span>
            </>
          )}
        </div>

        <div className="flex flex-col gap-3">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Describe the problem (optional if you add a file)"
            rows={3}
            className="min-h-0 flex-1 resize-none rounded-lg border border-line bg-ink px-3 py-2.5 placeholder:text-muted focus:border-detect focus:outline-none"
          />
          <input
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            placeholder="Location (optional)"
            className="rounded-lg border border-line bg-ink px-3 py-2.5 placeholder:text-muted focus:border-detect focus:outline-none"
          />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between gap-4">
        <p className="text-sm text-red-400" role="alert">
          {error}
        </p>
        <button
          type="submit"
          disabled={busy}
          className="inline-flex shrink-0 items-center gap-2 rounded-lg bg-detect px-5 py-2.5 font-semibold text-black transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {busy && <LoaderCircle className="size-4 animate-spin" />}
          {busy ? 'Uploading…' : 'Analyze'}
        </button>
      </div>
    </form>
  );
}
