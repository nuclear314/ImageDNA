
import React, { useState, useCallback, useMemo, useEffect } from 'react';
import { 
  Upload, 
  Image as ImageIcon, 
  Copy, 
  Check, 
  RefreshCcw, 
  Settings2, 
  Info, 
  Sparkles, 
  ChevronRight, 
  Zap, 
  Tag as TagIcon, 
  Star 
} from 'lucide-react';
import { AppState, Tag, InterrogationResult } from './types';
import { GoogleGenAI } from "@google/genai";

// UI Components
import Header from './components/Header';
import Dropzone from './components/Dropzone';
import TagGrid from './components/TagGrid';
import SettingsPanel from './components/SettingsPanel';
import ProcessingState from './components/ProcessingState';

const MASTERPIECE_PROMPT = "masterpiece, best quality, highres, ultra-detailed";
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
  const [refinedPrompt, setRefinedPrompt] = useState<string | null>(null);
  const [isRefining, setIsRefining] = useState(false);

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

    // Masterpiece Filter for the Visual Grid
    if (!includeMasterpiece) {
      filtered = filtered.filter(tag => !MASTERPIECE_LABELS.includes(tag.label.toLowerCase()));
    }

    // Generate the raw prompt string
    let rawPrompt = filtered.map(t => t.label).join(', ');
    
    if (includeMasterpiece) {
      const hasAnyMasterpiece = filtered.some(t => MASTERPIECE_LABELS.includes(t.label.toLowerCase()));
      if (!hasAnyMasterpiece) {
        rawPrompt = rawPrompt ? `${rawPrompt}, ${MASTERPIECE_PROMPT}` : MASTERPIECE_PROMPT;
      }
    }

    return {
      tags: filtered,
      rawPrompt: rawPrompt,
      rating: 'General'
    };
  }, [rawResultTags, threshold, negativeTags, state, includeMasterpiece]);

  const handleInterrogate = async (imageData: string) => {
    setState(AppState.INTERROGATING);
    setRefinedPrompt(null);
    await new Promise(resolve => setTimeout(resolve, 2500));

    const rawMockTags: Tag[] = [
      { label: '1girl', confidence: 0.98, category: 'general' },
      { label: 'solo', confidence: 0.95, category: 'general' },
      { label: 'blue_hair', confidence: 0.88, category: 'general' },
      { label: 'long_hair', confidence: 0.85, category: 'general' },
      { label: 'sitting', confidence: 0.72, category: 'general' },
      { label: 'school_uniform', confidence: 0.81, category: 'general' },
      { label: 'outdoors', confidence: 0.65, category: 'general' },
      { label: 'looking_at_viewer', confidence: 0.92, category: 'general' },
      { label: 'masterpiece', confidence: 0.99, category: 'meta' },
      { label: 'best_quality', confidence: 0.99, category: 'meta' },
      { label: 'highres', confidence: 0.95, category: 'meta' },
      { label: 'hatsune_miku', confidence: 0.91, category: 'character' },
    ];

    setRawResultTags(rawMockTags);
    setState(AppState.RESULT);
  };

  const handleFileUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const dataUrl = e.target?.result as string;
      setImage(dataUrl);
      handleInterrogate(dataUrl);
    };
    reader.readAsDataURL(file);
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const refineWithAI = async () => {
    if (!result) return;
    setIsRefining(true);
    try {
      const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `Given these image tags from a WD14 interrogator: "${result.rawPrompt}", write a descriptive, high-quality Stable Diffusion prompt that flows naturally but maintains the essence of these tags. Avoid generic filler.`,
        config: { temperature: 0.7 }
      });
      setRefinedPrompt(response.text || "Failed to refine.");
    } catch (err) {
      console.error(err);
    } finally {
      setIsRefining(false);
    }
  };

  const reset = () => {
    setState(AppState.IDLE);
    setImage(null);
    setRawResultTags([]);
    setRefinedPrompt(null);
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
                <div className="relative group rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-700 aspect-square bg-zinc-50 dark:bg-zinc-950">
                  <img src={image} className="w-full h-full object-contain" alt="Target" />
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                    <button onClick={reset} className="bg-white text-black px-4 py-2 rounded-full font-medium shadow-lg transform translate-y-2 group-hover:translate-y-0 transition-all">
                      Change Image
                    </button>
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

                <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm">
                   <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="bg-indigo-500/10 p-2 rounded-lg">
                        <Sparkles className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
                      </div>
                      <div>
                        <h3 className="font-semibold text-zinc-700 dark:text-zinc-200">AI Prompt Refinement</h3>
                        <p className="text-xs text-zinc-400 dark:text-zinc-500">Convert comma-separated tags into natural flow.</p>
                      </div>
                    </div>
                    {!refinedPrompt && !isRefining && (
                      <button 
                        onClick={refineWithAI}
                        className="text-xs font-semibold px-3 py-2 bg-zinc-50 dark:bg-zinc-800 hover:bg-zinc-100 dark:hover:bg-zinc-700 rounded-lg transition-colors border border-zinc-200 dark:border-zinc-700 text-zinc-600 dark:text-zinc-300"
                      >
                        Refine Tags
                      </button>
                    )}
                   </div>

                   {isRefining ? (
                     <div className="py-8 text-center text-zinc-400 dark:text-zinc-500 animate-pulse italic">
                        Asking Gemini to architect your prompt...
                     </div>
                   ) : refinedPrompt ? (
                     <div className="space-y-4">
                        <div className="bg-zinc-50 dark:bg-zinc-950/50 border border-zinc-100 dark:border-zinc-800 p-4 rounded-xl relative group">
                          <p className="text-sm leading-relaxed text-zinc-600 dark:text-zinc-300 italic">{refinedPrompt}</p>
                          <button 
                            onClick={() => handleCopy(refinedPrompt)}
                            className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity p-2 bg-white dark:bg-zinc-800 hover:bg-zinc-50 dark:hover:bg-zinc-700 border border-zinc-200 dark:border-zinc-700 rounded-lg"
                          >
                            <Copy className="w-4 h-4 text-zinc-400" />
                          </button>
                        </div>
                        <button 
                          onClick={() => setRefinedPrompt(null)}
                          className="text-[10px] uppercase tracking-wider text-zinc-400 dark:text-zinc-600 hover:text-indigo-500 font-bold"
                        >
                          Clear Refinement
                        </button>
                     </div>
                   ) : (
                     <div className="p-4 border border-dashed border-zinc-200 dark:border-zinc-800 rounded-xl text-center">
                        <p className="text-xs text-zinc-400 dark:text-zinc-600">Click refine to generate an artistic natural language prompt.</p>
                     </div>
                   )}
                </div>
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
            <span>ImageDNA © 2024</span>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default App;
