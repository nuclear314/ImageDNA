
import React from 'react';
import { Fingerprint, Github, Sun, Moon, Settings, Dices } from 'lucide-react';
import { AppView } from '../types';

interface HeaderProps {
  isDarkMode: boolean;
  setIsDarkMode: (val: boolean) => void;
  onSettingsClick: () => void;
  currentView: AppView;
  onViewChange: (view: AppView) => void;
}

const Header: React.FC<HeaderProps> = ({ isDarkMode, setIsDarkMode, onSettingsClick, currentView, onViewChange }) => {
  return (
    <header className="border-b border-zinc-200 dark:border-zinc-800 bg-white/50 dark:bg-[#09090b]/50 backdrop-blur-md sticky top-0 z-50 transition-colors">
      <div className="max-w-6xl mx-auto px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 bg-indigo-600 dark:bg-indigo-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-600/20 dark:shadow-indigo-500/20">
            <Fingerprint className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold tracking-tight text-zinc-900 dark:bg-gradient-to-r dark:from-white dark:to-zinc-400 dark:bg-clip-text dark:text-transparent">
              ImageDNA
            </h1>
            <p className="text-[10px] uppercase tracking-[0.2em] font-bold text-indigo-600 dark:text-indigo-500 leading-none">
              {currentView === 'tagger' ? 'WD14 Interrogator' : 'Prompt Generator'}
            </p>
          </div>
          <button
            onClick={() => onViewChange(currentView === 'tagger' ? 'promptGenerator' : 'tagger')}
            className={`ml-4 flex items-center gap-2 px-3 py-1.5 rounded-xl text-sm font-medium transition-all border shadow-sm ${
              currentView === 'promptGenerator'
                ? 'bg-indigo-600 text-white border-indigo-500 shadow-indigo-500/20'
                : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:text-indigo-600 dark:hover:text-white'
            }`}
            title={currentView === 'promptGenerator' ? 'Back to Tagger' : 'Random Prompt Generator'}
          >
            <Dices className="w-4 h-4" />
            <span className="hidden sm:inline">
              {currentView === 'promptGenerator' ? 'Tagger' : 'Prompt Gen'}
            </span>
          </button>
        </div>
        
        <div className="flex items-center gap-4 md:gap-6">
          <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-zinc-500 dark:text-zinc-400">
            <a href="https://github.com/nuclear314/ImageDNA/blob/main/README.md" className="hover:text-indigo-600 dark:hover:text-white transition-colors">Documentation</a>
          </nav>
          
          <div className="flex items-center gap-3">
            <button
              onClick={onSettingsClick}
              className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-white transition-all border border-zinc-200 dark:border-zinc-700 shadow-sm"
              title="Settings"
            >
              <Settings className="w-4.5 h-4.5" />
            </button>
            <button
              onClick={() => setIsDarkMode(!isDarkMode)}
              className="p-2 rounded-xl bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-white transition-all border border-zinc-200 dark:border-zinc-700 shadow-sm"
              title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {isDarkMode ? <Sun className="w-4.5 h-4.5" /> : <Moon className="w-4.5 h-4.5" />}
            </button>
            <div className="w-px h-6 bg-zinc-200 dark:bg-zinc-800"></div>
            <a href="https://github.com/nuclear314/ImageDNA" target="_blank" rel="noreferrer" className="text-zinc-400 hover:text-zinc-900 dark:hover:text-white transition-colors">
              <Github className="w-5 h-5" />
            </a>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
