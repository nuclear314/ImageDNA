
import React from 'react';
import { Tag } from '../types';

interface TagGridProps {
  tags: Tag[];
}

const TagGrid: React.FC<TagGridProps> = ({ tags }) => {
  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'character': return 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-400/10 border-purple-200 dark:border-purple-400/20';
      case 'rating': return 'text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-400/10 border-amber-200 dark:border-amber-400/20';
      case 'meta': return 'text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-400/10 border-emerald-200 dark:border-emerald-400/20';
      default: return 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-400/10 border-indigo-200 dark:border-indigo-400/20';
    }
  };

  return (
    <div className="flex flex-wrap gap-2">
      {tags.map((tag, idx) => (
        <div 
          key={idx}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm font-medium group hover:scale-105 transition-all cursor-default shadow-sm dark:shadow-none ${getCategoryColor(tag.category)}`}
        >
          <span className="mono">{tag.label.replace(/_/g, ' ')}</span>
          <span className="text-[10px] opacity-40 dark:opacity-40 font-bold group-hover:opacity-100 transition-opacity">
            {Math.round(tag.confidence * 100)}%
          </span>
        </div>
      ))}
      {tags.length === 0 && (
        <p className="text-sm text-zinc-400 italic w-full text-center py-4">No tags match current filter settings.</p>
      )}
    </div>
  );
};

export default TagGrid;
