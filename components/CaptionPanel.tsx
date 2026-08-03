import React, { useEffect, useRef, useState } from 'react';
import { Sparkles, Copy, Check, ChevronDown, Loader2, AlertTriangle } from 'lucide-react';
import { useLocalStorage } from '../lib/useLocalStorage';
import { CAPTION_MODES, CAPTION_EXTRA_OPTIONS, KOBOLD_CAPTION_MODELS } from '../lib/captionOptions';
import { CaptionMode, CaptionTone, CaptionQuantization, CaptionStatus, CaptionConnectionMode } from '../types';

const STAGE_LABELS: Record<string, string> = {
  koboldcpp: 'Downloading KoboldCpp engine…',
  gguf: 'Downloading GGUF model…',
  mmproj: 'Downloading vision projector…',
  starting: 'Starting captioning engine…',
  connecting: 'Connecting to remote KoboldCpp…',
};

interface CaptionPanelProps {
  imageFile: File | null;
  knownTags: string[];
  quantization: CaptionQuantization;
  captionModel?: string | null;
  connectionMode?: CaptionConnectionMode | null;
  remoteUrl?: string;
  apiKey?: string;
}

const CaptionPanel: React.FC<CaptionPanelProps> = ({ imageFile, knownTags, quantization, captionModel, connectionMode, remoteUrl, apiKey }) => {
  const [mode, setMode] = useLocalStorage<CaptionMode>('imagedna:captionMode', 'descriptive');
  const [tone, setTone] = useLocalStorage<CaptionTone>('imagedna:captionTone', 'casual');
  const [useKnownTags, setUseKnownTags] = useLocalStorage<boolean>('imagedna:captionUseKnownTags', true);
  const [selectedExtras, setSelectedExtras] = useLocalStorage<string[]>('imagedna:captionExtras', ['lighting', 'rating']);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [status, setStatus] = useState<CaptionStatus>('idle');
  const [stage, setStage] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const pollRef = useRef<number | null>(null);

  // A freshly uploaded image invalidates any previously composed caption.
  useEffect(() => {
    setStatus('idle');
    setStage(null);
    setCaption('');
    setError('');
  }, [imageFile]);

  useEffect(() => {
    return () => { if (pollRef.current) window.clearInterval(pollRef.current); };
  }, []);

  const toggleExtra = (id: string) => {
    setSelectedExtras(
      selectedExtras.includes(id) ? selectedExtras.filter((x) => x !== id) : [...selectedExtras, id]
    );
  };

  const handleCompose = async () => {
    if (!imageFile) return;
    setStatus('loading');
    setStage(null);
    setError('');

    // Poll load state so a cold-start model download shows real progress,
    // same pattern App.tsx uses for the WD14 tagger's /api/status. `stage`
    // only comes from the Windows KoboldCpp backend (koboldcpp/gguf/mmproj/
    // starting) — undefined on the transformers backend, which just reports
    // status without sub-stages.
    pollRef.current = window.setInterval(async () => {
      try {
        const res = await fetch('/api/caption-status');
        if (!res.ok) return;
        const data = await res.json();
        if (data.status === 'downloading') setStatus('downloading');
        setStage(data.stage ?? null);
      } catch {
        // Transient poll failure — ignore and try again on the next tick.
      }
    }, 1000);

    try {
      const formData = new FormData();
      formData.append('image', imageFile);
      formData.append('mode', mode);
      formData.append('tone', tone);
      formData.append('quantization', quantization);
      if (captionModel) {
        formData.append('caption_model', captionModel);
      }
      if (connectionMode === 'remote') {
        formData.append('kobold_remote_url', remoteUrl ?? '');
        if (apiKey) formData.append('kobold_api_key', apiKey);
      }

      const instructions = selectedExtras
        .map((id) => CAPTION_EXTRA_OPTIONS.find((o) => o.id === id)?.instruction)
        .filter((x): x is string => Boolean(x));
      formData.append('extra_options', JSON.stringify(instructions));

      if (useKnownTags && knownTags.length > 0) {
        formData.append('known_tags', knownTags.join(', '));
      }

      const response = await fetch('/api/caption', { method: 'POST', body: formData });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.error === 'missing_dependencies'
            ? 'Natural-language captioning needs extra packages. Run: pip install -r requirements-joycaption.txt'
            : data.error || 'Captioning failed'
        );
      }

      setCaption(data.caption);
      setStatus('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Captioning failed');
      setStatus('error');
    } finally {
      if (pollRef.current) { window.clearInterval(pollRef.current); pollRef.current = null; }
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(caption);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const isBusy = status === 'loading' || status === 'downloading';

  // On the transformers backend (Docker/dev) there's only ever one model, so
  // captionModel is always null there (see App.tsx) — the kobold backend passes
  // the actual selected id, which may differ from what's currently loaded on the
  // server while a switch is still in flight.
  const currentModelName = captionModel
    ? KOBOLD_CAPTION_MODELS.find((m) => m.id === captionModel)?.name ?? captionModel
    : 'JoyCaption (Beta One)';

  return (
    <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm dark:shadow-2xl dark:shadow-fuchsia-500/5">
      <div className="flex items-center justify-between mb-2">
        <h2 className="text-lg font-semibold flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-fuchsia-500 dark:text-fuchsia-400" />
          Step 2: Natural Language Prompt
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full border border-fuchsia-500/30 bg-fuchsia-500/5 text-fuchsia-600 dark:text-fuchsia-400">
            {currentModelName}
          </span>
        </h2>
        {status === 'done' && (
          <button
            onClick={handleCopy}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              copied
                ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/50'
                : 'bg-fuchsia-600 text-white hover:bg-fuchsia-700 shadow-lg shadow-fuchsia-500/20'
            }`}
          >
            {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied' : 'Copy Prompt'}
          </button>
        )}
      </div>

      <p className="text-xs text-zinc-400 dark:text-zinc-500 mb-4">
        Runs {currentModelName} over the image, grounded in the tags extracted above, to compose
        a natural-language caption instead of a comma-separated tag list.
      </p>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mb-4">
        {CAPTION_MODES.map((m) => (
          <button
            key={m.id}
            onClick={() => setMode(m.id)}
            disabled={isBusy}
            title={m.description}
            className={`text-left px-3 py-2 rounded-lg border text-xs font-medium transition-all disabled:opacity-50 disabled:cursor-not-allowed ${
              mode === m.id
                ? 'border-fuchsia-500 bg-fuchsia-500/5 text-fuchsia-600 dark:text-fuchsia-400'
                : 'border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300 hover:border-zinc-300 dark:hover:border-zinc-600'
            }`}
          >
            {m.label}
          </button>
        ))}
      </div>

      {mode === 'descriptive' && (
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs text-zinc-400 dark:text-zinc-500">Tone:</span>
          {(['casual', 'formal'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTone(t)}
              disabled={isBusy}
              className={`px-3 py-1 rounded-full text-xs font-medium border transition-all disabled:opacity-50 ${
                tone === t
                  ? 'border-fuchsia-500 bg-fuchsia-500/10 text-fuchsia-600 dark:text-fuchsia-400'
                  : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400'
              }`}
            >
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-zinc-500 dark:text-zinc-400">
          Ground with {knownTags.length} extracted tag{knownTags.length === 1 ? '' : 's'} from Step 1
        </span>
        <button
          onClick={() => setUseKnownTags(!useKnownTags)}
          disabled={isBusy}
          className={`relative inline-flex h-5 w-9 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none disabled:opacity-50 ${useKnownTags ? 'bg-fuchsia-600' : 'bg-zinc-200 dark:bg-zinc-700'}`}
        >
          <span className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${useKnownTags ? 'translate-x-4' : 'translate-x-0'}`} />
        </button>
      </div>

      <button
        onClick={() => setShowAdvanced(!showAdvanced)}
        className="flex items-center gap-1 text-xs text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 mb-4"
      >
        <ChevronDown className={`w-3 h-3 transition-transform ${showAdvanced ? 'rotate-180' : ''}`} />
        Advanced details
      </button>

      {showAdvanced && (
        <div className="flex flex-wrap gap-2 mb-4">
          {CAPTION_EXTRA_OPTIONS.map((opt) => (
            <button
              key={opt.id}
              onClick={() => toggleExtra(opt.id)}
              disabled={isBusy}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-all disabled:opacity-50 ${
                selectedExtras.includes(opt.id)
                  ? 'border-fuchsia-500 bg-fuchsia-500/5 text-fuchsia-600 dark:text-fuchsia-400'
                  : 'border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400'
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}

      {status !== 'done' && (
        <button
          onClick={handleCompose}
          disabled={!imageFile || isBusy}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-fuchsia-600 hover:bg-fuchsia-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium rounded-xl transition-colors shadow-lg shadow-fuchsia-500/20"
        >
          {isBusy && <Loader2 className="w-4 h-4 animate-spin" />}
          {status === 'downloading'
            ? (stage && STAGE_LABELS[stage]) || 'Downloading JoyCaption (first run, several GB)…'
            : status === 'loading'
              ? 'Composing…'
              : 'Compose Natural Language Prompt'}
        </button>
      )}

      {status === 'error' && (
        <div className="mt-3 flex items-start gap-2 text-red-500 dark:text-red-400 text-xs">
          <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {status === 'done' && (
        <div className="space-y-3">
          <textarea
            readOnly
            value={caption}
            rows={6}
            className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-sm text-zinc-700 dark:text-zinc-200 rounded-lg px-3 py-2.5 focus:outline-none resize-none leading-relaxed"
          />
          <button
            onClick={handleCompose}
            className="text-xs text-zinc-400 dark:text-zinc-500 hover:text-fuchsia-500 dark:hover:text-fuchsia-400 transition-colors"
          >
            Re-roll with current settings
          </button>
        </div>
      )}
    </div>
  );
};

export default CaptionPanel;
