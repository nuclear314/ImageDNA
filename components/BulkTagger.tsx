
import React, { useEffect, useRef, useState } from 'react';
import { Layers, Loader2, Check, X, RefreshCcw, Download, Trash2, AlertCircle, Copy } from 'lucide-react';
import Dropzone from './Dropzone';
import TagGrid from './TagGrid';
import SettingsPanel from './SettingsPanel';
import { BulkItem, Tag } from '../types';
import { filterAndFormatTags } from '../lib/tagFiltering';
import { buildDatasetZip, downloadBlob } from '../lib/exportZip';

interface BulkTaggerProps {
  selectedModel: string;
  threshold: number;
  onThresholdChange: (val: number) => void;
  negativeTags: string;
  onNegativeTagsChange: (val: string) => void;
  includeMasterpiece: boolean;
  masterpieceTags: string;
  useUnderscores: boolean;
  consolidateBreasts: boolean;
  breastSize: string;
  useDAMode: boolean;
  daTagLimit: number;
}

const BulkTagger: React.FC<BulkTaggerProps> = ({
  selectedModel, threshold, onThresholdChange, negativeTags, onNegativeTagsChange,
  includeMasterpiece, masterpieceTags, useUnderscores, consolidateBreasts, breastSize,
  useDAMode, daTagLimit,
}) => {
  const [items, setItems] = useState<BulkItem[]>([]);
  const [isZipping, setIsZipping] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const previewUrlsRef = useRef<string[]>([]);
  const processingIdRef = useRef<string | null>(null);
  const isMountedRef = useRef(true);

  // Preview URLs live for as long as the tab is mounted; revoke them all when it goes away
  // (either the user switches views or closes the app) rather than tracking each individually.
  useEffect(() => {
    return () => {
      isMountedRef.current = false;
      previewUrlsRef.current.forEach(url => URL.revokeObjectURL(url));
    };
  }, []);

  // Sequential processing: one item in flight at a time. Re-fires whenever `items` changes
  // (a new queued item appears, or the current one finishes) until nothing is left to do.
  // Concurrency is gated by `processingIdRef`, not by scanning `items` for a 'processing'
  // status — the setItems call below changes `items` (this effect's own dependency), which
  // would otherwise tear down and re-run the effect mid-fetch and falsely cancel it.
  useEffect(() => {
    if (processingIdRef.current) return;
    const next = items.find(i => i.status === 'queued');
    if (!next) return;

    processingIdRef.current = next.id;
    setItems(prev => prev.map(i => i.id === next.id ? { ...i, status: 'processing' as const } : i));

    (async () => {
      try {
        const formData = new FormData();
        formData.append('image', next.file);
        formData.append('model', selectedModel);

        const response = await fetch('/api/tag', { method: 'POST', body: formData });
        if (!response.ok) throw new Error('Tagging failed');
        const data = await response.json();

        const rawTags: Tag[] = [
          ...Object.entries(data.general_tags).map(([label, confidence]) => ({
            label, confidence: confidence as number, category: 'general' as const
          })),
          ...Object.entries(data.character_tags).map(([label, confidence]) => ({
            label, confidence: confidence as number, category: 'character' as const
          })),
        ];

        if (!isMountedRef.current) return;
        setItems(prev => prev.map(i => i.id === next.id ? { ...i, status: 'done' as const, rawTags } : i));
      } catch (err) {
        if (!isMountedRef.current) return;
        const message = err instanceof Error ? err.message : 'Tagging failed';
        setItems(prev => prev.map(i => i.id === next.id ? { ...i, status: 'error' as const, error: message } : i));
      } finally {
        processingIdRef.current = null;
      }
    })();
  }, [items, selectedModel]);

  const addFile = (file: File) => {
    const previewUrl = URL.createObjectURL(file);
    previewUrlsRef.current.push(previewUrl);
    setItems(prev => [...prev, {
      id: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
      file,
      previewUrl,
      status: 'queued',
    }]);
  };

  const retryItem = (id: string) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, status: 'queued', error: undefined } : i));
  };

  const removeItem = (id: string) => {
    setItems(prev => prev.filter(i => i.id !== id));
  };

  const clearAll = () => {
    setItems([]);
  };

  const getFormatted = (item: BulkItem) => {
    if (!item.rawTags) return null;
    return filterAndFormatTags(item.rawTags, {
      threshold, negativeTags, includeMasterpiece, masterpieceTags,
      useUnderscores, consolidateBreasts, breastSize, daTagLimit,
    });
  };

  const handleCopy = (id: string, text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(prev => (prev === id ? null : prev)), 2000);
  };

  const handleDownloadZip = async () => {
    const doneItems = items.filter(i => i.status === 'done' && i.rawTags);
    if (doneItems.length === 0) return;
    setIsZipping(true);
    try {
      const entries = doneItems.map(item => {
        const formatted = getFormatted(item)!;
        return { file: item.file, rawPrompt: useDAMode ? formatted.deviantArtPrompt : formatted.rawPrompt };
      });
      const blob = await buildDatasetZip(entries);
      downloadBlob(blob, `imagedna-bulk-tags-${Date.now()}.zip`);
    } finally {
      setIsZipping(false);
    }
  };

  const doneCount = items.filter(i => i.status === 'done').length;
  const errorCount = items.filter(i => i.status === 'error').length;
  const totalCount = items.length;

  return (
    <main className="max-w-6xl mx-auto px-4 py-8 pb-24">
      <div className="flex items-center justify-between mb-8">
        <div className="flex items-center gap-4">
          <div className="w-11 h-11 rounded-2xl bg-indigo-600 dark:bg-indigo-500 flex items-center justify-center shadow-lg shadow-indigo-600/20 shrink-0">
            <Layers className="w-5 h-5 text-white" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-zinc-900 dark:text-white tracking-tight">Bulk Tagger</h2>
            <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">Tag many images at once with your current settings</p>
          </div>
        </div>
        {totalCount > 0 && (
          <button
            onClick={clearAll}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-zinc-500 dark:text-zinc-400 hover:text-red-600 dark:hover:text-red-400 border border-zinc-200 dark:border-zinc-700 hover:border-red-300 dark:hover:border-red-800 transition-colors"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Clear All
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        {/* Left Panel: Input & Settings */}
        <div className="lg:col-span-5 space-y-6">
          <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl overflow-hidden p-6 shadow-sm dark:shadow-xl">
            <h2 className="text-lg font-semibold mb-4">Add Images</h2>
            <Dropzone onUpload={addFile} multiple />
          </div>

          <SettingsPanel
            threshold={threshold}
            onThresholdChange={onThresholdChange}
            negativeTags={negativeTags}
            onNegativeTagsChange={onNegativeTagsChange}
          />
        </div>

        {/* Right Panel: Queue & Results */}
        <div className="lg:col-span-7 space-y-6">
          {totalCount === 0 ? (
            <div className="h-full min-h-[400px] flex flex-col items-center justify-center border-2 border-dashed border-zinc-200 dark:border-zinc-800 rounded-3xl text-zinc-400 dark:text-zinc-500 p-12 text-center">
              <div className="bg-white dark:bg-zinc-900 p-4 rounded-2xl mb-4 border border-zinc-100 dark:border-zinc-800">
                <Layers className="w-10 h-10 text-zinc-300 dark:text-zinc-700" />
              </div>
              <h3 className="text-xl font-medium text-zinc-700 dark:text-zinc-300 mb-2">No images yet</h3>
              <p className="max-w-xs">Add images on the left to start tagging them, one at a time, with your current settings.</p>
            </div>
          ) : (
            <>
              {/* Progress summary */}
              <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm dark:shadow-none">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-medium text-zinc-700 dark:text-zinc-200">
                    {doneCount} of {totalCount} tagged
                    {errorCount > 0 && <span className="text-red-500"> · {errorCount} failed</span>}
                  </span>
                  <button
                    onClick={handleDownloadZip}
                    disabled={doneCount === 0 || isZipping}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-indigo-500/20 transition-all"
                  >
                    {isZipping ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
                    {isZipping ? 'Zipping…' : 'Download All (.zip)'}
                  </button>
                </div>
                <div className="w-full h-1.5 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-indigo-500 transition-all duration-300"
                    style={{ width: `${totalCount === 0 ? 0 : ((doneCount + errorCount) / totalCount) * 100}%` }}
                  />
                </div>
              </div>

              {/* Queue */}
              <div className="space-y-3">
                {items.map(item => {
                  const formatted = getFormatted(item);
                  const promptText = formatted ? (useDAMode ? formatted.deviantArtPrompt : formatted.rawPrompt) : '';
                  return (
                    <div key={item.id} className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-4 shadow-sm">
                      <div className="flex items-center gap-4">
                        <img src={item.previewUrl} alt={item.file.name} className="w-14 h-14 object-cover rounded-xl border border-zinc-200 dark:border-zinc-700 shrink-0" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200 truncate">{item.file.name}</p>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            {item.status === 'queued' && <span className="text-xs text-zinc-400">Queued</span>}
                            {item.status === 'processing' && (
                              <span className="flex items-center gap-1.5 text-xs text-indigo-500">
                                <Loader2 className="w-3 h-3 animate-spin" /> Tagging…
                              </span>
                            )}
                            {item.status === 'done' && formatted && (
                              <span className="flex items-center gap-1.5 text-xs text-emerald-500">
                                <Check className="w-3 h-3" /> {formatted.tags.length} tags
                              </span>
                            )}
                            {item.status === 'error' && (
                              <span className="flex items-center gap-1.5 text-xs text-red-500" title={item.error}>
                                <AlertCircle className="w-3 h-3" /> {item.error ?? 'Failed'}
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {item.status === 'done' && (
                            <button
                              onClick={() => handleCopy(item.id, promptText)}
                              className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                                copiedId === item.id
                                  ? 'bg-emerald-500 text-white border-emerald-400'
                                  : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:text-indigo-600 dark:hover:text-white'
                              }`}
                            >
                              {copiedId === item.id ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                              {copiedId === item.id ? 'Copied' : 'Copy'}
                            </button>
                          )}
                          {item.status === 'error' && (
                            <button
                              onClick={() => retryItem(item.id)}
                              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium border border-zinc-200 dark:border-zinc-700 text-zinc-500 dark:text-zinc-400 hover:text-indigo-600 dark:hover:text-white transition-all"
                            >
                              <RefreshCcw className="w-3 h-3" /> Retry
                            </button>
                          )}
                          <button
                            onClick={() => removeItem(item.id)}
                            className="p-1.5 rounded-lg text-zinc-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 transition-colors"
                            title="Remove"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {item.status === 'done' && formatted && formatted.tags.length > 0 && (
                        <div className="mt-3 pt-3 border-t border-zinc-100 dark:border-zinc-800">
                          <TagGrid tags={formatted.tags} />
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      </div>
    </main>
  );
};

export default BulkTagger;
