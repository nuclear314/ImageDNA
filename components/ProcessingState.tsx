
import React from 'react';
import { Loader2, Fingerprint } from 'lucide-react';

const ProcessingState: React.FC = () => {
  return (
    <div className="h-full min-h-[400px] flex flex-col items-center justify-center border border-zinc-200 dark:border-zinc-800 rounded-3xl bg-white dark:bg-zinc-900/30 overflow-hidden relative shadow-sm dark:shadow-none">
      <div className="absolute inset-0 bg-gradient-to-b from-indigo-500/5 to-transparent"></div>
      
      <div className="relative z-10 flex flex-col items-center text-center">
        <div className="mb-8 relative">
          <div className="w-24 h-24 bg-indigo-50 dark:bg-indigo-500/10 rounded-3xl border border-indigo-200 dark:border-indigo-500/30 flex items-center justify-center relative z-10 shadow-sm">
            <Fingerprint className="w-12 h-12 text-indigo-600 dark:text-indigo-400 animate-pulse" />
          </div>
          {/* Scanning line effect */}
          <div className="absolute top-0 left-[-20px] right-[-20px] h-[2px] bg-indigo-500 shadow-[0_0_20px_#6366f1] animate-[scan_2s_ease-in-out_infinite] z-20"></div>
        </div>

        <h3 className="text-2xl font-bold text-zinc-800 dark:text-white mb-2">Analyzing Prompt DNA</h3>
        <p className="text-zinc-400 dark:text-zinc-500 mb-8 max-w-xs leading-relaxed">
          The WD14 model is interrogating every pixel to identify labels, characters, and styles.
        </p>

        <div className="flex items-center gap-4">
          <div className="w-32 h-1 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden shadow-inner">
            <div className="h-full bg-indigo-500 animate-[progress_2.5s_ease-in-out_infinite]"></div>
          </div>
          <span className="text-[10px] font-bold text-zinc-300 dark:text-zinc-600 uppercase tracking-widest">Inference...</span>
        </div>
      </div>

      <style>{`
        @keyframes scan {
          0% { transform: translateY(0); opacity: 0.2; }
          50% { transform: translateY(96px); opacity: 1; }
          100% { transform: translateY(0); opacity: 0.2; }
        }
        @keyframes progress {
          0% { width: 0%; }
          100% { width: 100%; }
        }
      `}</style>
    </div>
  );
};

export default ProcessingState;
