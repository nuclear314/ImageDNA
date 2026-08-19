
import React, { useState, useRef } from 'react';
import { PenLine } from 'lucide-react';
import Dropzone from './Dropzone';
import CaptionPanel from './CaptionPanel';
import { CaptionQuantization, CaptionCapability, CaptionConnectionMode } from '../types';

interface ManualCaptionProps {
  enableJoyCaption: boolean;
  quantization: CaptionQuantization;
  captionModel: string;
  captionCapability: CaptionCapability | null;
  connectionMode: CaptionConnectionMode;
  remoteUrl: string;
  apiKey: string;
}

// Mirrors server.py's known_tags parsing exactly, so what's shown here matches
// what actually gets sent to /api/caption.
function parseTagsInput(raw: string): string[] {
  return raw.split(',').map((t) => t.trim()).filter((t) => t.length > 0);
}

const ManualCaption: React.FC<ManualCaptionProps> = ({
  enableJoyCaption,
  quantization,
  captionModel,
  captionCapability,
  connectionMode,
  remoteUrl,
  apiKey,
}) => {
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [isDragOverPreview, setIsDragOverPreview] = useState(false);
  const [tagsInput, setTagsInput] = useState('');
  const replaceInputRef = useRef<HTMLInputElement>(null);

  const tags = parseTagsInput(tagsInput);

  const handleUpload = (file: File) => {
    setImageFile(file);
    const reader = new FileReader();
    reader.onload = (e) => setPreview(e.target?.result as string);
    reader.readAsDataURL(file);
  };

  if (!enableJoyCaption) {
    return (
      <main className="max-w-3xl mx-auto px-4 py-8 pb-24">
        <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-10 flex flex-col items-center gap-3 text-center">
          <PenLine className="w-10 h-10 text-zinc-300 dark:text-zinc-600" />
          <div>
            <p className="font-medium text-zinc-600 dark:text-zinc-300">Step 2 (JoyCaption) is disabled</p>
            <p className="text-sm text-zinc-400 mt-1">Enable it in Settings to use manual caption input.</p>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 pb-24">
      <div className="flex items-start gap-4 mb-8">
        <div className="w-11 h-11 rounded-2xl bg-indigo-600 dark:bg-indigo-500 flex items-center justify-center shadow-lg shadow-indigo-600/20 shrink-0">
          <PenLine className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-2xl font-bold text-zinc-900 dark:text-white tracking-tight">Manual Caption Input</h2>
          <p className="text-sm text-zinc-500 dark:text-zinc-400 mt-0.5">Supply your own image and tag list directly to Step 2, skipping WD14 tagging</p>
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

      <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm mb-6">
        <label className="block text-sm font-medium text-zinc-700 dark:text-zinc-200 mb-2">Tags</label>
        <textarea
          value={tagsInput}
          onChange={(e) => setTagsInput(e.target.value)}
          placeholder="1girl, blue hair, school uniform, outdoors"
          rows={4}
          className="w-full bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-xl px-4 py-3 text-sm text-zinc-800 dark:text-zinc-200 placeholder:text-zinc-400 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 resize-none"
        />
        <p className="text-xs text-zinc-400 mt-2">Comma-separated. These are sent to the captioner as ground-truth tags, exactly like Step 1's output would be.</p>
        {tags.length === 0 && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-2">
            No tags entered — the caption will be generated from the image alone, without any grounding tags.
          </p>
        )}
      </div>

      <CaptionPanel
        imageFile={imageFile}
        knownTags={tags}
        quantization={quantization}
        captionModel={captionCapability?.backend === 'kobold' ? captionModel : null}
        connectionMode={captionCapability?.backend === 'kobold' ? connectionMode : null}
        remoteUrl={remoteUrl}
        apiKey={apiKey}
      />
    </main>
  );
};

export default ManualCaption;
