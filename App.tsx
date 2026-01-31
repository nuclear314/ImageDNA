import React, { useState, useMemo, useEffect } from 'react';
import {
  Image as ImageIcon,
  Copy,
  Check,
  RefreshCcw,
  ChevronRight,
  Zap,
  Tag as TagIcon,
  Star
} from 'lucide-react';
import { AppState, Tag } from './types';

// UI Components
import Header from './components/Header';
import Dropzone from './components/Dropzone';
import TagGrid from './components/TagGrid';
import SettingsPanel from './components/SettingsPanel';
import ProcessingState from './components/ProcessingState';

const MASTERPIECE_LABELS = ['masterpiece', 'best_quality', 'highres', 'ultra-detailed', 'ultra_detailed', 'amazing_quality'];

const App: React.FC = () => {
  const [isDarkMode, setIsDarkMode] = useState(true);
  const [state, setState] = useState<AppState>(AppState.IDLE);
  const [image, setImage] = useState<string | null>(null);
  const [rawResultTags, setRawResultTags] = useState<Tag[]>([]);
  const [threshold, setThreshold] = useState(0.35);
  const [negativeTags, setNegativeTags] = useState("");
  const [includeMasterpiece, setIncludeMasterpiece] = useState(false);
  const [copied, setCopied] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  // Derive filtered tags and prompt based on settings
  const result = useMemo(() => {
    if (state !== AppState.RESULT) return null;

    const negativeList = negativeTags
      .split(',')
      .map(t => t.trim().toLowerCase())
      .filter(t => t.length > 0);

    // Initial filter: Threshold + User Negatives
    let filtered = rawResultTags.filter(tag => {
      const isAboveThreshold = tag.confidence >= threshold;
      const isNotExcluded = !negativeList.includes(tag.label.toLowerCase());
      return isAboveThreshold && isNotExcluded;
    });

    // Strip any tagger-generated masterpiece tags (added synthetically if toggle is on)
    filtered = filtered.filter(tag => !MASTERPIECE_LABELS.includes(tag.label.toLowerCase()));

    // Sort by confidence descending
    filtered.sort((a, b) => b.confidence - a.confidence);

    // Prepend masterpiece tags if toggle is on
    if (includeMasterpiece) {
      filtered = [
        { label: 'masterpiece', confidence: 1, category: 'general' as const },
        { label: 'best quality', confidence: 1, category: 'general' as const },
        { label: 'highres', confidence: 1, category: 'general' as const },
        { label: 'ultra-detailed', confidence: 1, category: 'general' as const },
        ...filtered,
      ];
    }

    // Generate the raw prompt string
    const rawPrompt = filtered.map(t => t.label).join(', ');

    return {
      tags: filtered,
      rawPrompt: rawPrompt,
      rating: 'General'
    };
  }, [rawResultTags, threshold, negativeTags, state, includeMasterpiece]);

  const handleInterrogate = async (file: File) => {
    setState(AppState.INTERROGATING);
    try {
      const formData = new FormData();
      formData.append('image', file);

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
    setRawResultTags([]);
    setIncludeMasterpiece(false);
  };

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-[#09090b] text-zinc-900 dark:text-zinc-100 selection:bg-indigo-500/30">
      <Header isDarkMode={isDarkMode} setIsDarkMode={setIsDarkMode} />
      
      <main className="max-w-6xl mx-auto px-4 py-8 pb-24">
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
                      <button onClick={reset} className="bg-white text-black px-4 py-2 rounded-full font-medium shadow-lg transform translate-y-2 group-hover:translate-y-0 transition-all">
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
                <p className="max-w-xs">Upload an image on the left to extract prompt DNA with SmilingWolf's WD14 model.</p>
              </div>
            )}

            {state === AppState.INTERROGATING && (
              <ProcessingState />
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
                      onClick={() => handleCopy(result.rawPrompt)}
                      className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                        copied ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/50' : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-500/20'
                      }`}
                    >
                      {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                      {copied ? 'Copied' : 'Copy All Tags'}
                    </button>
                  </div>

                  <TagGrid tags={result.tags} />

                  {/* Masterpiece Toggle in Output Panel */}
                  <div className="mt-8 pt-6 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="bg-amber-500/10 p-2 rounded-lg">
                        <Star className="w-4 h-4 text-amber-500" />
                      </div>
                      <div>
                        <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">Append Masterpiece Tags</p>
                        <p className="text-[10px] text-zinc-400 dark:text-zinc-500">Shows high-quality booru labels in the grid and appends to copy output.</p>
                      </div>
                    </div>
                    <button 
                      onClick={() => setIncludeMasterpiece(!includeMasterpiece)}
                      className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${includeMasterpiece ? 'bg-indigo-600' : 'bg-zinc-200 dark:bg-zinc-700'}`}
                    >
                      <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${includeMasterpiece ? 'translate-x-5' : 'translate-x-0'}`} />
                    </button>
                  </div>
                </div>

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
      </main>

      <footer className="fixed bottom-0 left-0 right-0 bg-white/80 dark:bg-zinc-900/80 backdrop-blur-xl border-t border-zinc-200 dark:border-zinc-800 p-4 z-50">
        <div className="max-w-6xl mx-auto flex items-center justify-between text-xs text-zinc-500">
          <div className="flex items-center gap-4">
            <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-emerald-500"></div> Model: WD14-ViT v2</span>
            <span className="flex items-center gap-1.5"><div className="w-1.5 h-1.5 rounded-full bg-indigo-500"></div> Engine: ONNX Runtime</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="#" className="hover:text-zinc-800 dark:hover:text-zinc-300 transition-colors underline decoration-zinc-200 dark:decoration-zinc-800">SmilingWolf Dataset</a>
            <a href="#" className="hover:text-zinc-800 dark:hover:text-zinc-300 transition-colors underline decoration-zinc-200 dark:decoration-zinc-800">TOS</a>
            <span className="text-zinc-200 dark:text-zinc-700">|</span>
            <span>ImageDNA © 2026</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
