
import React, { useState, useRef } from 'react';
import { ScanLine, Copy, Check, FileX, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import Dropzone from './Dropzone';

interface ParsedParams {
  positive: string;
  negative: string | null;
  settings: string | null;
}

function parseParameters(raw: string): ParsedParams {
  const negMatch = raw.match(/\nNegative prompt:/);
  if (!negMatch || negMatch.index === undefined) {
    const stepsMatch = raw.match(/\nSteps:/);
    if (stepsMatch && stepsMatch.index !== undefined) {
      return { positive: raw.slice(0, stepsMatch.index).trim(), negative: null, settings: raw.slice(stepsMatch.index + 1).trim() };
    }
    return { positive: raw.trim(), negative: null, settings: null };
  }

  const positive = raw.slice(0, negMatch.index).trim();
  const afterNeg = raw.slice(negMatch.index + '\nNegative prompt:'.length).trim();
  const stepsMatch = afterNeg.match(/\nSteps:/);
  if (stepsMatch && stepsMatch.index !== undefined) {
    return { positive, negative: afterNeg.slice(0, stepsMatch.index).trim(), settings: afterNeg.slice(stepsMatch.index + 1).trim() };
  }
  return { positive, negative: afterNeg.trim(), settings: null };
}

interface ExifSections {
  parameters: string | null;
  text_meta: Record<string, string> | null;
  camera: Record<string, string | number>;
  exposure: Record<string, string | number>;
  image: Record<string, string | number>;
  datetime: Record<string, string>;
  gps: Record<string, string | number> | null;
  raw: Record<string, string | number>;
  dimensions: { width: number; height: number };
}

const ExifExtractor: React.FC = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [exifData, setExifData] = useState<ExifSections | null>(null);
  const [noExif, setNoExif] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const [textMetaOpen, setTextMetaOpen] = useState(false);
  const [isDragOverPreview, setIsDragOverPreview] = useState(false);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [copiedPos, setCopiedPos] = useState(false);
  const [copiedNeg, setCopiedNeg] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);
  const [copiedJson, setCopiedJson] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleUpload = async (file: File) => {
    setExifData(null);
    setNoExif(false);
    setError(null);
    setIsLoading(true);

    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);

    const formData = new FormData();
    formData.append('image', file);

    try {
      const res = await fetch('/api/exif', { method: 'POST', body: formData });
      if (!res.ok) throw new Error(`Server error: ${res.status}`);
      const data = await res.json();
      if (data.exif) {
        setExifData(data.exif);
      } else {
        setNoExif(true);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to extract EXIF data');
    } finally {
      setIsLoading(false);
    }
  };

  const makeCopy = (text: string, set: (v: boolean) => void) => async () => {
    await navigator.clipboard.writeText(text);
    set(true);
    setTimeout(() => set(false), 2000);
  };

  const handleCopyJson = async () => {
    if (!exifData) return;
    await navigator.clipboard.writeText(JSON.stringify(exifData.raw, null, 2));
    setCopiedJson(true);
    setTimeout(() => setCopiedJson(false), 2000);
  };

  const renderSection = (title: string, data: Record<string, string | number> | null | undefined) => {
    if (!data || Object.keys(data).length === 0) return null;
    return (
      <div>
        <h3 className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-2.5">{title}</h3>
        <div className="space-y-1.5">
          {Object.entries(data).map(([key, value]) => (
            <div key={key} className="flex items-baseline gap-3">
              <span className="text-sm text-zinc-400 dark:text-zinc-500 min-w-[160px] shrink-0">{formatKey(key)}</span>
              <span className="text-sm font-medium text-zinc-800 dark:text-zinc-200 break-all">{String(value)}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const hasTraditionalExif = exifData && (
    Object.keys(exifData.camera).length > 0 ||
    Object.keys(exifData.exposure).length > 0 ||
    Object.keys(exifData.image).length > 0 ||
    Object.keys(exifData.datetime).length > 0 ||
    exifData.gps
  );

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 pb-24">
      <div className="flex items-start gap-4 mb-8">
        <div className="w-11 h-11 rounded-2xl bg-indigo-600 dark:bg-indigo-500 flex items-center justify-center shadow-lg shadow-indigo-600/20 shrink-0">
          <ScanLine className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white tracking-tight">EXIF Extractor</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">Read embedded metadata and generation parameters from any image</p>
        </div>
      </div>

      <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm mb-6">
        {preview ? (
          <div
            onDragEnter={(e) => { e.preventDefault(); setIsDragOverPreview(true); }}
            onDragOver={(e) => { e.preventDefault(); setIsDragOverPreview(true); }}
            onDragLeave={() => setIsDragOverPreview(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragOverPreview(false);
              const file = e.dataTransfer.files?.[0];
              if (file) handleUpload(file);
            }}
            onClick={() => replaceInputRef.current?.click()}
            className={`relative flex items-center gap-4 rounded-xl p-3 -m-3 cursor-pointer transition-all duration-200 ${
              isDragOverPreview
                ? 'bg-indigo-50 dark:bg-indigo-500/10 ring-2 ring-indigo-400 dark:ring-indigo-500'
                : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/50'
            }`}
          >
            <input
              type="file"
              accept="image/*"
              ref={replaceInputRef}
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) handleUpload(f); e.target.value = ''; }}
            />
            <img src={preview} alt="Preview" className={`w-20 h-20 object-cover rounded-xl border shrink-0 transition-opacity ${isDragOverPreview ? 'opacity-40 border-indigo-300' : 'border-zinc-200 dark:border-zinc-700'}`} />
            <div>
              {isDragOverPreview ? (
                <p className="text-sm font-semibold text-indigo-600 dark:text-indigo-400">Drop to replace</p>
              ) : (
                <>
                  <p className="text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-1">Image loaded</p>
                  <p className="text-xs text-zinc-400">Drop a new image here or click to browse</p>
                </>
              )}
            </div>
          </div>
        ) : (
          <Dropzone onUpload={handleUpload} />
        )}
      </div>

      {isLoading && (
        <div className="flex items-center justify-center gap-3 py-12 text-zinc-400">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Reading metadata…</span>
        </div>
      )}

      {error && !isLoading && (
        <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-900/50 rounded-2xl p-6 text-center">
          <p className="text-sm font-medium text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}

      {noExif && !isLoading && (
        <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-10 flex flex-col items-center gap-3">
          <FileX className="w-10 h-10 text-zinc-300 dark:text-zinc-600" />
          <div className="text-center">
            <p className="font-medium text-zinc-600 dark:text-zinc-300">No metadata found</p>
            <p className="text-sm text-zinc-400 mt-1">This image has no embedded EXIF or generation data.</p>
          </div>
        </div>
      )}

      {exifData && !isLoading && (
        <div className="space-y-4">
          {/* Generation Parameters card — shown prominently when present */}
          {exifData.parameters && (() => {
            const { positive, negative, settings } = parseParameters(exifData.parameters);
            return (
              <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm space-y-5">
                <h3 className="font-semibold text-zinc-900 dark:text-white">Generation Parameters</h3>

                {/* Positive prompt */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-500">Positive</span>
                    <button
                      onClick={makeCopy(positive, setCopiedPos)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                        copiedPos ? 'bg-emerald-500 text-white border-emerald-400' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:text-indigo-600 dark:hover:text-white'
                      }`}
                    >
                      {copiedPos ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copiedPos ? 'Copied!' : 'Copy'}
                    </button>
                  </div>
                  <pre className="text-xs text-zinc-700 dark:text-zinc-300 bg-emerald-50 dark:bg-emerald-950/20 rounded-xl p-4 whitespace-pre-wrap break-words leading-relaxed font-mono border border-emerald-100 dark:border-emerald-900/30">
                    {positive}
                  </pre>
                </div>

                {/* Negative prompt */}
                {negative && (
                  <div>
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-[10px] font-bold uppercase tracking-widest text-rose-500">Negative</span>
                      <button
                        onClick={makeCopy(negative, setCopiedNeg)}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                          copiedNeg ? 'bg-emerald-500 text-white border-emerald-400' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:text-indigo-600 dark:hover:text-white'
                        }`}
                      >
                        {copiedNeg ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        {copiedNeg ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                    <pre className="text-xs text-zinc-700 dark:text-zinc-300 bg-rose-50 dark:bg-rose-950/20 rounded-xl p-4 whitespace-pre-wrap break-words leading-relaxed font-mono border border-rose-100 dark:border-rose-900/30">
                      {negative}
                    </pre>
                  </div>
                )}

                {/* Settings line */}
                {settings && (
                  <div>
                    <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">Settings</span>
                    <pre className="mt-2 text-xs text-zinc-600 dark:text-zinc-400 bg-zinc-50 dark:bg-zinc-950/60 rounded-xl p-4 whitespace-pre-wrap break-words leading-relaxed font-mono border border-zinc-100 dark:border-zinc-800">
                      {settings}
                    </pre>
                  </div>
                )}

                {/* Full parameters */}
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">Full Parameters</span>
                    <button
                      onClick={makeCopy(exifData.parameters!, setCopiedAll)}
                      className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-all ${
                        copiedAll ? 'bg-emerald-500 text-white border-emerald-400' : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:text-indigo-600 dark:hover:text-white'
                      }`}
                    >
                      {copiedAll ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                      {copiedAll ? 'Copied!' : 'Copy All'}
                    </button>
                  </div>
                  <pre className="text-xs text-zinc-500 dark:text-zinc-500 bg-zinc-50 dark:bg-zinc-950/60 rounded-xl p-4 whitespace-pre-wrap break-words leading-relaxed font-mono border border-zinc-100 dark:border-zinc-800">
                    {exifData.parameters}
                  </pre>
                </div>
              </div>
            );
          })()}

          {/* Other PNG text chunks */}
          {exifData.text_meta && Object.keys(exifData.text_meta).length > 0 && (
            <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl shadow-sm overflow-hidden">
              <button
                onClick={() => setTextMetaOpen(o => !o)}
                className="w-full flex items-center justify-between px-6 py-4 hover:bg-zinc-50 dark:hover:bg-zinc-800/50 transition-colors"
              >
                <h3 className="font-semibold text-zinc-900 dark:text-white">Image Text Data</h3>
                {textMetaOpen ? <ChevronUp className="w-4 h-4 text-zinc-400" /> : <ChevronDown className="w-4 h-4 text-zinc-400" />}
              </button>
              {textMetaOpen && (
                <div className="px-6 pb-6 space-y-3 border-t border-zinc-100 dark:border-zinc-800 pt-4">
                  {Object.entries(exifData.text_meta).map(([key, value]) => (
                    <div key={key}>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-1">{key}</p>
                      <pre className="text-xs text-zinc-700 dark:text-zinc-300 bg-zinc-50 dark:bg-zinc-950/60 rounded-lg p-3 whitespace-pre-wrap break-words font-mono border border-zinc-100 dark:border-zinc-800">
                        {value}
                      </pre>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Traditional EXIF */}
          {hasTraditionalExif && (
            <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm">
              <div className="flex items-center justify-between mb-6">
                <div>
                  <h3 className="font-semibold text-zinc-900 dark:text-white">EXIF Metadata</h3>
                  <p className="text-xs text-zinc-400 mt-0.5">{exifData.dimensions.width} × {exifData.dimensions.height}px</p>
                </div>
                <button
                  onClick={handleCopyJson}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium border transition-all ${
                    copiedJson
                      ? 'bg-emerald-500 text-white border-emerald-400'
                      : 'bg-zinc-100 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:text-indigo-600 dark:hover:text-white'
                  }`}
                >
                  {copiedJson ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                  {copiedJson ? 'Copied!' : 'Copy JSON'}
                </button>
              </div>
              <div className="divide-y divide-zinc-100 dark:divide-zinc-800 space-y-5">
                {renderSection('Camera', exifData.camera) && <div>{renderSection('Camera', exifData.camera)}</div>}
                {renderSection('Exposure', exifData.exposure) && <div className="pt-5">{renderSection('Exposure', exifData.exposure)}</div>}
                {renderSection('Image', { ...exifData.image, Width: exifData.dimensions.width, Height: exifData.dimensions.height }) && (
                  <div className="pt-5">{renderSection('Image', { ...exifData.image, Width: exifData.dimensions.width, Height: exifData.dimensions.height })}</div>
                )}
                {renderSection('Date & Time', exifData.datetime) && <div className="pt-5">{renderSection('Date & Time', exifData.datetime)}</div>}
                {exifData.gps && <div className="pt-5">{renderSection('GPS', exifData.gps)}</div>}
              </div>
            </div>
          )}

          {/* Dimensions-only fallback when no other sections rendered */}
          {!hasTraditionalExif && !exifData.parameters && (!exifData.text_meta || Object.keys(exifData.text_meta).length === 0) && (
            <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm">
              <p className="text-sm text-zinc-400">{exifData.dimensions.width} × {exifData.dimensions.height}px — no readable metadata fields.</p>
            </div>
          )}
        </div>
      )}
    </main>
  );
};

function formatKey(key: string): string {
  return key.replace(/([A-Z])/g, ' $1').trim();
}

export default ExifExtractor;
