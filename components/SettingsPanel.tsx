
import React from 'react';
import { Settings2, Info, Ban } from 'lucide-react';

interface SettingsPanelProps {
  threshold: number;
  onThresholdChange: (val: number) => void;
  negativeTags: string;
  onNegativeTagsChange: (val: string) => void;
  disabled?: boolean;
}

const SettingsPanel: React.FC<SettingsPanelProps> = ({ 
  threshold, 
  onThresholdChange, 
  negativeTags,
  onNegativeTagsChange,
  disabled 
}) => {
  return (
    <div className={`bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm dark:shadow-none transition-all ${disabled ? 'opacity-50 pointer-events-none' : 'opacity-100'}`}>
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold flex items-center gap-2 text-zinc-800 dark:text-zinc-100">
          <Settings2 className="w-5 h-5 text-zinc-400 dark:text-zinc-500" />
          Parameters
        </h2>
        <div className="group relative">
            <Info className="w-4 h-4 text-zinc-300 dark:text-zinc-600 cursor-help" />
            <div className="absolute bottom-full right-0 mb-2 w-64 p-3 bg-white dark:bg-zinc-800 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 border border-zinc-200 dark:border-zinc-700 shadow-2xl">
                Fine-tune the model's sensitivity and filtering behavior. Changes apply instantly to active results.
            </div>
        </div>
      </div>

      <div className="space-y-8">
        {/* Confidence Threshold */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium text-zinc-500 dark:text-zinc-400">Confidence Threshold</label>
            <div className="flex items-center gap-0.5">
              <input
                type="number"
                min="0"
                max="100"
                step="1"
                value={Math.round(threshold * 100)}
                onChange={(e) => {
                  const val = Math.min(100, Math.max(0, Number(e.target.value) || 0));
                  onThresholdChange(val / 100);
                }}
                className="w-14 text-right text-sm font-bold text-indigo-600 dark:text-indigo-400 mono bg-indigo-50 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/30 rounded-lg px-2 py-0.5 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
              />
              <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400 mono">%</span>
            </div>
          </div>
          <input
            type="range"
            min="0"
            max="100"
            step="1"
            value={Math.round(threshold * 100)}
            onChange={(e) => onThresholdChange(Number(e.target.value) / 100)}
            className="w-full h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-lg appearance-none cursor-pointer accent-indigo-500"
          />
          <div className="flex justify-between mt-2 text-[10px] text-zinc-400 dark:text-zinc-600 font-bold uppercase tracking-wider">
            <span>Sensitive</span>
            <span>Balanced</span>
            <span>Strict</span>
          </div>
        </div>

        {/* Negative Tags Input */}
        <div className="pt-6 border-t border-zinc-100 dark:border-zinc-800">
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-medium text-zinc-500 dark:text-zinc-400 flex items-center gap-2">
              <Ban className="w-4 h-4 text-rose-500" />
              Exclude Tags
            </label>
            <span className="text-[10px] font-bold text-zinc-300 dark:text-zinc-600 uppercase tracking-widest">Global Filter</span>
          </div>
          <textarea 
            value={negativeTags}
            onChange={(e) => onNegativeTagsChange(e.target.value)}
            placeholder="e.g. text, watermarking, signature..."
            className="w-full h-20 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-sm text-zinc-600 dark:text-zinc-300 placeholder:text-zinc-300 dark:placeholder:text-zinc-700 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 resize-none transition-all shadow-inner"
          />
          <p className="mt-2 text-[10px] text-zinc-400 dark:text-zinc-500 italic">
            Comma-separated list of tags to ignore.
          </p>
        </div>
      </div>
    </div>
  );
};

export default SettingsPanel;
