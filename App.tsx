import React, { useState, useMemo, useEffect, useRef } from 'react';
import {
  Image as ImageIcon,
  Copy,
  Check,
  RefreshCcw,
  ChevronRight,
  Zap,
  Tag as TagIcon,
  Sliders
} from 'lucide-react';
import { AppState, AppView, Tag, CaptionQuantization, CaptionCapability } from './types';
import { filterAndFormatTags } from './lib/tagFiltering';
import { useLocalStorage } from './lib/useLocalStorage';

// UI Components
import Header from './components/Header';
import Dropzone from './components/Dropzone';
import TagGrid from './components/TagGrid';
import SettingsPanel from './components/SettingsPanel';
import ProcessingState from './components/ProcessingState';
import SettingsModal from './components/SettingsModal';
import PromptGenerator from './components/PromptGenerator';
import ExifExtractor from './components/ExifExtractor';
import BulkTagger from './components/BulkTagger';
import CaptionPanel from './components/CaptionPanel';

const DEFAULT_MASTERPIECE_TAGS = 'masterpiece, best quality, highres, ultra-detailed';
const BREAST_SIZES = ['flat', 'small', 'medium', 'large', 'huge', 'gigantic'];
const APP_VERSION = 'v2.4';

const TAGGER_MODELS = [
  { id: 'SmilingWolf/wd-eva02-large-tagger-v3', name: 'EVA02 Large v3', description: 'Best accuracy (default)' },
  { id: 'SmilingWolf/wd-v1-4-moat-tagger-v2', name: 'MOAT v2', description: 'Good balance of speed and accuracy' },
  { id: 'SmilingWolf/wd-swinv2-tagger-v3', name: 'SwinV2 v3', description: 'Fast and efficient' },
] as const;

// Windows-only (KoboldCpp/GGUF backend) — ignored by the transformers backend
// (Docker/dev), which only ever has one caption model. IDs must match the keys
// of joycaptioner_kobold.py's KOBOLD_CAPTION_MODELS catalog.
const KOBOLD_CAPTION_MODELS = [
  { id: 'joycaption-beta-one', name: 'JoyCaption Beta One', description: 'General-purpose descriptive captioning (default)' },
  { id: 'nsfwvision-v5', name: 'NSFWVision v5 (Qwen3.5 9B)', description: 'NSFW-oriented captioning' },
] as const;

const App: React.FC = () => {
  const [isDarkMode, setIsDarkMode] = useLocalStorage('imagedna:darkMode', true);
  const [state, setState] = useState<AppState>(AppState.IDLE);
  const [image, setImage] = useState<string | null>(null);
  const [currentFile, setCurrentFile] = useState<File | null>(null);
  const [rawResultTags, setRawResultTags] = useState<Tag[]>([]);
  const [threshold, setThreshold] = useLocalStorage('imagedna:threshold', 0.35);
  const [negativeTags, setNegativeTags] = useLocalStorage('imagedna:negativeTags', '');
  const [includeMasterpiece, setIncludeMasterpiece] = useLocalStorage('imagedna:includeMasterpiece', false);
  const [masterpieceTags, setMasterpieceTags] = useLocalStorage('imagedna:masterpieceTags', DEFAULT_MASTERPIECE_TAGS);
  const [useUnderscores, setUseUnderscores] = useLocalStorage('imagedna:useUnderscores', false);
  const [breastSize, setBreastSize] = useLocalStorage('imagedna:breastSize', 'medium');
  const [consolidateBreasts, setConsolidateBreasts] = useLocalStorage('imagedna:consolidateBreasts', false);
  const [useDAMode, setUseDAMode] = useLocalStorage('imagedna:useDAMode', false);
  const [daTagLimit, setDaTagLimit] = useLocalStorage('imagedna:daTagLimit', 30);
  const [selectedModel, setSelectedModel] = useLocalStorage<string>('imagedna:selectedModel', TAGGER_MODELS[0].id);
  const [enableJoyCaption, setEnableJoyCaption] = useLocalStorage('imagedna:enableJoyCaption', false);
  const [captionQuantization, setCaptionQuantization] = useLocalStorage<CaptionQuantization>('imagedna:captionQuantization', '4bit');
  const [captionModel, setCaptionModel] = useLocalStorage<string>('imagedna:captionModel', KOBOLD_CAPTION_MODELS[0].id);
  const [copied, setCopied] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [currentView, setCurrentView] = useState<AppView>('tagger');
  const [modelStatus, setModelStatus] = useState<{ status: string; model: string | null } | null>(null);
  const [captionCapability, setCaptionCapability] = useState<CaptionCapability | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // One-time check (not polled — GPU presence can't change during a running session)
  // backing the header's fast/slow caption speed indicator.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/caption-capability')
      .then((res) => res.json())
      .then((data: CaptionCapability) => {
        if (cancelled) return;
        setCaptionCapability(data);
        // A stored quantization from before this backend was detected (or from
        // switching machines) may belong to the other backend's disjoint value
        // set — reset to that backend's own default rather than sending a
        // meaningless value to /api/caption.
        const validQuants = data.backend === 'kobold' ? ['Q4_K_M', 'Q5_K_M', 'Q6_K'] : ['4bit', '8bit', 'bf16'];
        if (!validQuants.includes(captionQuantization)) {
          setCaptionQuantization((data.backend === 'kobold' ? 'Q4_K_M' : '4bit') as CaptionQuantization);
        }
      })
      .catch(() => { /* leave as null — badge just stays hidden */ });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Poll model load status while interrogating, so the processing screen can show a
  // real "downloading the model" message on a first-run cold start instead of a fake
  // fixed-duration animation. Stops automatically once state leaves INTERROGATING.
  useEffect(() => {
    if (state !== AppState.INTERROGATING) return;
    let cancelled = false;

    const poll = async () => {
      try {
        const res = await fetch('/api/status');
        if (!res.ok || cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        setModelStatus(data);
        if (data.status === 'error') setState(AppState.ERROR);
      } catch {
        // Transient poll failure — ignore and try again on the next tick.
      }
    };

    poll();
    const id = setInterval(poll, 1000);
    return () => { cancelled = true; clearInterval(id); };
  }, [state]);

  // Re-run tagging when model changes and we have an image loaded
  const previousModelRef = useRef(selectedModel);
  useEffect(() => {
    if (previousModelRef.current !== selectedModel && currentFile && (state === AppState.RESULT || state === AppState.ERROR)) {
      handleInterrogate(currentFile);
    }
    previousModelRef.current = selectedModel;
  }, [selectedModel, currentFile, state]);

  // Derive filtered tags and prompt based on settings
  const result = useMemo(() => {
    if (state !== AppState.RESULT) return null;

    const formatted = filterAndFormatTags(rawResultTags, {
      threshold, negativeTags, includeMasterpiece, masterpieceTags,
      useUnderscores, consolidateBreasts, breastSize, daTagLimit,
    });

    return { ...formatted, rating: 'General' };
  }, [rawResultTags, threshold, negativeTags, state, includeMasterpiece, masterpieceTags, useUnderscores, breastSize, consolidateBreasts, daTagLimit]);

  const handleInterrogate = async (file: File) => {
    setState(AppState.INTERROGATING);
    try {
      const formData = new FormData();
      formData.append('image', file);
      formData.append('model', selectedModel);

      const response = await fetch('/api/tag', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Tagging failed');

      const data = await response.json();

      const tags: Tag[] = [
        ...Object.entries(data.general_tags).map(([label, confidence]) => ({
          label, confidence: confidence as number, category: 'general' as const
        })),
        ...Object.entries(data.character_tags).map(([label, confidence]) => ({
          label, confidence: confidence as number, category: 'character' as const
        })),
      ];

      setRawResultTags(tags);
      setState(AppState.RESULT);
    } catch (err) {
      console.error(err);
      setState(AppState.ERROR);
    }
  };

  const handleFileUpload = (file: File) => {
    setCurrentFile(file);
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setImage(dataUrl);
      handleInterrogate(file);
    };
    reader.readAsDataURL(file);
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const reset = () => {
    setState(AppState.IDLE);
    setImage(null);
    setCurrentFile(null);
    setRawResultTags([]);
    setIncludeMasterpiece(false);
  };

  const handleChangeImage = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleFileUpload(e.target.files[0]);
    }
    // Reset input value so same file can be selected again
    e.target.value = '';
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[#09090b] text-zinc-900 dark:text-zinc-100 selection:bg-indigo-500/30">
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInputChange}
        className="hidden"
        accept="image/*"
      />
      <Header isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} onSettingsClick={() => setIsSettingsOpen(true)} currentView={currentView} onViewChange={setCurrentView} captionCapability={enableJoyCaption ? captionCapability : null} />

      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        includeMasterpiece={includeMasterpiece}
        setIncludeMasterpiece={setIncludeMasterpiece}
        masterpieceTags={masterpieceTags}
        setMasterpieceTags={setMasterpieceTags}
        defaultMasterpieceTags={DEFAULT_MASTERPIECE_TAGS}
        useUnderscores={useUnderscores}
        setUseUnderscores={setUseUnderscores}
        consolidateBreasts={consolidateBreasts}
        setConsolidateBreasts={setConsolidateBreasts}
        useDAMode={useDAMode}
        setUseDAMode={setUseDAMode}
        daTagLimit={daTagLimit}
        setDaTagLimit={setDaTagLimit}
        selectedModel={selectedModel}
        setSelectedModel={setSelectedModel}
        taggerModels={TAGGER_MODELS}
        enableJoyCaption={enableJoyCaption}
        setEnableJoyCaption={(val) => {
          setEnableJoyCaption(val);
          if (val) {
            // Kick off the (potentially multi-GB, kobold-backend) download/load in
            // the background as soon as the user opts in, rather than waiting for
            // their first Compose click — progress surfaces via CaptionPanel's
            // existing /api/caption-status poll.
            fetch('/api/caption-enable', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ quantization: captionQuantization, caption_model: captionModel }),
            }).catch(() => { /* best-effort — errors surface via /api/caption-status */ });
          }
        }}
        captionQuantization={captionQuantization}
        setCaptionQuantization={setCaptionQuantization}
        captionCapability={captionCapability}
        captionModel={captionModel}
        setCaptionModel={setCaptionModel}
        captionModels={KOBOLD_CAPTION_MODELS}
      />
      
      {currentView === 'promptGenerator' && (
        <PromptGenerator selectedModel={selectedModel} />
      )}

      {currentView === 'exifExtractor' && (
        <ExifExtractor />
      )}

      {currentView === 'bulk' && (
        <BulkTagger
          selectedModel={selectedModel}
          threshold={threshold}
          onThresholdChange={setThreshold}
          negativeTags={negativeTags}
          onNegativeTagsChange={setNegativeTags}
          includeMasterpiece={includeMasterpiece}
          masterpieceTags={masterpieceTags}
          useUnderscores={useUnderscores}
          consolidateBreasts={consolidateBreasts}
          breastSize={breastSize}
          useDAMode={useDAMode}
          daTagLimit={daTagLimit}
        />
      )}

      {currentView === 'tagger' && <main className="max-w-6xl mx-auto px-4 py-8 pb-24">
        {/* Step Indicator */}
        <div className="flex items-center gap-4 mb-8 text-sm font-medium">
          <div className={`flex items-center gap-2 ${state === AppState.IDLE ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-400 dark:text-zinc-500'}`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center border ${state === AppState.IDLE ? 'border-indigo-400 bg-indigo-500/10' : 'border-zinc-200 dark:border-zinc-700'}`}>1</span>
            <span>Upload Image</span>
          </div>
          <ChevronRight className="w-4 h-4 text-zinc-300 dark:text-zinc-700" />
          <div className={`flex items-center gap-2 ${state === AppState.INTERROGATING ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-400 dark:text-zinc-500'}`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center border ${state === AppState.INTERROGATING ? 'border-indigo-400 bg-indigo-500/10' : 'border-zinc-200 dark:border-zinc-700'}`}>2</span>
            <span>Interrogating</span>
          </div>
          <ChevronRight className="w-4 h-4 text-zinc-300 dark:text-zinc-700" />
          <div className={`flex items-center gap-2 ${state === AppState.RESULT ? 'text-indigo-600 dark:text-indigo-400' : 'text-zinc-400 dark:text-zinc-500'}`}>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center border ${state === AppState.RESULT ? 'border-indigo-400 bg-indigo-400/10' : 'border-zinc-200 dark:border-zinc-700'}`}>3</span>
            <span>Use Tags</span>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Left Panel: Input & Settings */}
          <div className="lg:col-span-5 space-y-6">
            <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden p-6 shadow-sm dark:shadow-xl">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold flex items-center gap-2">
                  <ImageIcon className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
                  Source Material
                </h2>
                {image && (
                  <button 
                    onClick={reset}
                    className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-400 transition-colors"
                  >
                    <RefreshCcw className="w-4 h-4" />
                  </button>
                )}
              </div>

              {!image ? (
                <Dropzone onUpload={handleFileUpload} />
              ) : (
                <div
                  className={`relative group rounded-xl overflow-hidden border aspect-square bg-zinc-50 dark:bg-zinc-950 transition-all ${isDragOver ? 'border-indigo-500 ring-2 ring-indigo-500/50' : 'border-zinc-200 dark:border-zinc-700'}`}
                  onDragEnter={(e) => { e.preventDefault(); setIsDragOver(true); }}
                  onDragLeave={(e) => { e.preventDefault(); setIsDragOver(false); }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragOver(false);
                    if (e.dataTransfer.files?.[0]) {
                      handleFileUpload(e.dataTransfer.files[0]);
                    }
                  }}
                >
                  <img src={image} className="w-full h-full object-contain" alt="Target" />
                  <div className={`absolute inset-0 bg-black/40 transition-opacity flex items-center justify-center ${isDragOver ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                    {isDragOver ? (
                      <span className="bg-indigo-600 text-white px-4 py-2 rounded-full font-medium shadow-lg">Drop to replace</span>
                    ) : (
                      <button onClick={handleChangeImage} className="bg-white text-black px-4 py-2 rounded-full font-medium shadow-lg transform translate-y-2 group-hover:translate-y-0 transition-all">
                        Change Image
                      </button>
                    )}
                  </div>
                </div>
              )}
            </div>

            <SettingsPanel 
              threshold={threshold} 
              onThresholdChange={setThreshold}
              negativeTags={negativeTags}
              onNegativeTagsChange={setNegativeTags}
              disabled={state === AppState.INTERROGATING}
            />
          </div>

          {/* Right Panel: Output */}
          <div className="lg:col-span-7 space-y-6">
            {state === AppState.IDLE && (
              <div className="h-full min-h-[400px] flex flex-col items-center justify-center border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-3xl text-zinc-400 dark:text-zinc-500 p-12 text-center">
                <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl mb-4 border border-zinc-100 dark:border-zinc-800">
                  <Zap className="w-10 h-10 text-zinc-300 dark:text-zinc-700" />
                </div>
                <h3 className="text-xl font-medium text-zinc-700 dark:text-zinc-300 mb-2">Ready for Interrogation</h3>
                <p className="max-w-xs">Upload an image on the left to extract prompt DNA.</p>
              </div>
            )}

            {state === AppState.INTERROGATING && (
              <ProcessingState status={modelStatus?.status} />
            )}

            {state === AppState.RESULT && result && (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm dark:shadow-2xl dark:shadow-indigo-500/5">
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-semibold flex items-center gap-2">
                      <TagIcon className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
                      Extracted Tags
                      <span className="ml-2 text-xs font-normal text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full">
                        {result.tags.length} labels found
                      </span>
                    </h2>
                    <button
                      onClick={() => handleCopy(useDAMode ? result.deviantArtPrompt : result.rawPrompt)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                        copied
                          ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/50'
                          : useDAMode
                            ? 'bg-orange-500 text-white hover:bg-orange-600 shadow-lg shadow-orange-500/20'
                            : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-500/20'
                      }`}
                      title={useDAMode ? 'DeviantArt format: lowercase, no spaces, max 30 tags' : 'Copy all tags'}
                    >
                      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      {copied ? 'Copied' : useDAMode ? `Copy Tags` : 'Copy Tags'}
                    </button>
                  </div>

                  <TagGrid tags={result.tags} />

                  {/* Breast Size Dropdown (shown when consolidation is enabled and breast tags detected) */}
                  {consolidateBreasts && result.hasBreastTag && (
                    <div className="mt-8 pt-6 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className="bg-rose-500/10 p-2 rounded-lg">
                          <Sliders className="w-4 h-4 text-rose-500" />
                        </div>
                        <div>
                          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">Breast Size</p>
                          <p className="text-[10px] text-zinc-400 dark:text-zinc-500">Select size to replace detected breast tags.</p>
                        </div>
                      </div>
                      <select
                        value={breastSize}
                        onChange={(e) => setBreastSize(e.target.value)}
                        className="bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-sm font-medium text-zinc-700 dark:text-zinc-200 rounded-lg px-3 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 cursor-pointer"
                      >
                        {BREAST_SIZES.map(size => (
                          <option key={size} value={size}>{size === 'flat' ? 'Flat chest' : size.charAt(0).toUpperCase() + size.slice(1)}</option>
                        ))}
                      </select>
                    </div>
                  )}
                </div>

                {enableJoyCaption && (
                  <CaptionPanel
                    imageFile={currentFile}
                    knownTags={result.tags.map(t => t.label)}
                    quantization={captionQuantization}
                    captionModel={captionCapability?.backend === 'kobold' ? captionModel : null}
                  />
                )}
              </div>
            )}

            {state === AppState.ERROR && (
              <div className="h-full min-h-[400px] flex flex-col items-center justify-center border-2 border-dashed border-red-200 dark:border-red-900 rounded-3xl text-red-400 dark:text-red-500 p-12 text-center">
                <h3 className="text-xl font-medium text-red-600 dark:text-red-400 mb-2">Tagging Failed</h3>
                <p className="max-w-xs">Could not connect to the tagger. Make sure server.py is running.</p>
                <button onClick={reset} className="mt-4 px-4 py-2 bg-red-500/10 text-red-600 dark:text-red-400 rounded-lg text-sm hover:bg-red-500/20 transition-colors">Try Again</button>
              </div>
            )}
          </div>
        </div>
      </main>}

      <footer className="fixed bottom-0 left-0 right-0 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border-t border-zinc-200 dark:border-zinc-800 p-4 z-50">
        <div className="max-w-6xl mx-auto flex items-center justify-between text-xs text-zinc-500">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div> Model: {TAGGER_MODELS.find(m => m.id === selectedModel)?.name ?? 'Unknown'}</span>
            <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div> Engine: ONNX Runtime</span>
          </div>
          <div className="flex items-center gap-4">
            <span>ImageDNA © 2026</span>
            <span className="text-zinc-300 dark:text-zinc-700">•</span>
            <span>{APP_VERSION}</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
