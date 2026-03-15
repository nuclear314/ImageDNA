import React from 'react';
import { Info } from 'lucide-react';

type Placement = 'top' | 'bottom' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';

interface InfoBaubleProps {
  text: string;
  placement?: Placement;
  width?: string;
}

const placementClasses: Record<Placement, string> = {
  'top':          'bottom-full left-1/2 -translate-x-1/2 mb-2',
  'bottom':       'top-full left-1/2 -translate-x-1/2 mt-2',
  'top-left':     'bottom-full left-0 mb-2',
  'top-right':    'bottom-full right-0 mb-2',
  'bottom-left':  'top-full left-0 mt-2',
  'bottom-right': 'top-full right-0 mt-2',
};

const InfoBauble: React.FC<InfoBaubleProps> = ({
  text,
  placement = 'top-right',
  width = 'w-64',
}) => {
  return (
    <div className="group relative inline-flex">
      <Info className="w-4 h-4 text-zinc-300 dark:text-zinc-600 cursor-help" />
      <div
        className={`absolute ${placementClasses[placement]} ${width} p-3 bg-white dark:bg-zinc-800 text-[11px] leading-relaxed text-zinc-500 dark:text-zinc-400 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10 border border-zinc-200 dark:border-zinc-700 shadow-2xl`}
      >
        {text}
      </div>
    </div>
  );
};

export default InfoBauble;
