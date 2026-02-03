import React, { useState } from 'react';
import { X, Star, Type, Sliders, RotateCcw, AlertTriangle, Share2, Cpu } from 'lucide-react';

interface TaggerModel {
  id: string;
  name: string;
  description: string;
}

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  includeMasterpiece: boolean;
  setIncludeMasterpiece: (val: boolean) => void;
  masterpieceTags: string;
  setMasterpieceTags: (val: string) => void;
  defaultMasterpieceTags: string;
  useUnderscores: boolean;
  setUseUnderscores: (val: boolean) => void;
  consolidateBreasts: boolean;
  setConsolidateBreasts: (val: boolean) => void;
  useDAMode: boolean;
  setUseDAMode: (val: boolean) => void;
  daTagLimit: number;
  setDaTagLimit: (val: number) => void;
  selectedModel: string;
  setSelectedModel: (val: string) => void;
  taggerModels: readonly TaggerModel[];
}

const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  includeMasterpiece,
  setIncludeMasterpiece,
  masterpieceTags,
  setMasterpieceTags,
  defaultMasterpieceTags,
  useUnderscores,
  setUseUnderscores,
  consolidateBreasts,
  setConsolidateBreasts,
  useDAMode,
  setUseDAMode,
  daTagLimit,
  setDaTagLimit,
  selectedModel,
  setSelectedModel,
  taggerModels,
}) => {
  const [showResetConfirm, setShowResetConfirm] = useState(false);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-2xl w-full max-w-md mx-4 animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-zinc-200 dark:border-zinc-800">
          <h2 className="text-lg font-semibold text-zinc-900 dark:text-zinc-100">Settings</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-zinc-100 dark:hover:bg-zinc-800 rounded-lg text-zinc-400 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-4 max-h-[60vh] overflow-y-auto">
          {/* Model Selection */}
          <div>
            <div className="flex items-center gap-3 mb-3">
              <div className="bg-violet-500/10 p-2 rounded-lg">
                <Cpu className="w-4 h-4 text-violet-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">Tagger Model</p>
                <p className="text-[10px] text-zinc-400 dark:text-zinc-500">Select the model used for tag extraction.</p>
              </div>
            </div>
            <div className="ml-11 space-y-2">
              {taggerModels.map((model) => (
                <label
                  key={model.id}
                  className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                    selectedModel === model.id
                      ? 'border-violet-500 bg-violet-500/5'
                      : 'border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600'
                  }`}
                >
                  <input
                    type="radio"
                    name="taggerModel"
                    value={model.id}
                    checked={selectedModel === model.id}
                    onChange={(e) => setSelectedModel(e.target.value)}
                    className="sr-only"
                  />
                  <div className={`w-4 h-4 rounded-full border-2 flex items-center justify-center ${
                    selectedModel === model.id
                      ? 'border-violet-500'
                      : 'border-zinc-300 dark:border-zinc-600'
                  }`}>
                    {selectedModel === model.id && (
                      <div className="w-2 h-2 rounded-full bg-violet-500" />
                    )}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">{model.name}</p>
                    <p className="text-[10px] text-zinc-400 dark:text-zinc-500">{model.description}</p>
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Masterpiece Toggle */}
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-amber-500/10 p-2 rounded-lg">
                  <Star className="w-4 h-4 text-amber-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">Append Masterpiece Tags</p>
                  <p className="text-[10px] text-zinc-400 dark:text-zinc-500">Prepend custom tags to output.</p>
                </div>
              </div>
              <button
                onClick={() => setIncludeMasterpiece(!includeMasterpiece)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${includeMasterpiece ? 'bg-indigo-600' : 'bg-zinc-200 dark:bg-zinc-700'}`}
              >
                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${includeMasterpiece ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
            {includeMasterpiece && (
              <div className="mt-3 ml-11">
                <input
                  type="text"
                  value={masterpieceTags}
                  onChange={(e) => setMasterpieceTags(e.target.value)}
                  placeholder={defaultMasterpieceTags}
                  className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 text-sm text-zinc-700 dark:text-zinc-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 placeholder:text-zinc-400 dark:placeholder:text-zinc-500"
                />
                <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1">Comma-separated list of tags to prepend to the output.</p>
              </div>
            )}
          </div>

          {/* Underscore Toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-sky-500/10 p-2 rounded-lg">
                <Type className="w-4 h-4 text-sky-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">Use Underscores</p>
                <p className="text-[10px] text-zinc-400 dark:text-zinc-500">Join multi-word labels with _ instead of spaces.</p>
              </div>
            </div>
            <button
              onClick={() => setUseUnderscores(!useUnderscores)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${useUnderscores ? 'bg-indigo-600' : 'bg-zinc-200 dark:bg-zinc-700'}`}
            >
              <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${useUnderscores ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>

          {/* Consolidate Breasts Toggle */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-rose-500/10 p-2 rounded-lg">
                <Sliders className="w-4 h-4 text-rose-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">Consolidate Breast Tags</p>
                <p className="text-[10px] text-zinc-400 dark:text-zinc-500">Replace detected breast tags with a single selected size.</p>
              </div>
            </div>
            <button
              onClick={() => setConsolidateBreasts(!consolidateBreasts)}
              className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${consolidateBreasts ? 'bg-indigo-600' : 'bg-zinc-200 dark:bg-zinc-700'}`}
            >
              <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${consolidateBreasts ? 'translate-x-5' : 'translate-x-0'}`} />
            </button>
          </div>

          {/* DeviantArt Mode Toggle */}
          <div>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="bg-orange-500/10 p-2 rounded-lg">
                  <Share2 className="w-4 h-4 text-orange-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">DeviantArt Mode</p>
                  <p className="text-[10px] text-zinc-400 dark:text-zinc-500">Format tags for DeviantArt (lowercase, no spaces).</p>
                </div>
              </div>
              <button
                onClick={() => setUseDAMode(!useDAMode)}
                className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${useDAMode ? 'bg-orange-500' : 'bg-zinc-200 dark:bg-zinc-700'}`}
              >
                <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${useDAMode ? 'translate-x-5' : 'translate-x-0'}`} />
              </button>
            </div>
            {useDAMode && (
              <div className="mt-3 ml-11">
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={5}
                    max={30}
                    value={daTagLimit}
                    onChange={(e) => setDaTagLimit(Number(e.target.value))}
                    className="flex-1 h-2 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-orange-500"
                  />
                  <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200 w-8 text-right">{daTagLimit}</span>
                </div>
                <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-1">Maximum number of tags to copy (5-30).</p>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-zinc-200 dark:border-zinc-800">
          {!showResetConfirm ? (
            <button
              onClick={() => setShowResetConfirm(true)}
              className="flex items-center gap-2 text-sm text-zinc-500 hover:text-red-500 dark:text-zinc-400 dark:hover:text-red-400 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Reset all settings to defaults
            </button>
          ) : (
            <div className="space-y-3">
              <div className="flex items-start gap-2 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <p className="text-sm">This will reset all settings to their defaults. This action cannot be undone.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => {
                    const keys = Object.keys(localStorage).filter(k => k.startsWith('imagedna:'));
                    keys.forEach(k => localStorage.removeItem(k));
                    window.location.reload();
                  }}
                  className="px-3 py-1.5 bg-red-500 hover:bg-red-600 text-white text-sm font-medium rounded-lg transition-colors"
                >
                  Reset Settings
                </button>
                <button
                  onClick={() => setShowResetConfirm(false)}
                  className="px-3 py-1.5 bg-zinc-100 dark:bg-zinc-800 hover:bg-zinc-200 dark:hover:bg-zinc-700 text-zinc-700 dark:text-zinc-300 text-sm font-medium rounded-lg transition-colors"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default SettingsModal;
