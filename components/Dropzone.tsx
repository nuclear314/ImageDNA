
import React, { useRef, useState } from 'react';
import { Upload, ImagePlus } from 'lucide-react';

interface DropzoneProps {
  onUpload: (file: File) => void;
}

const Dropzone: React.FC<DropzoneProps> = ({ onUpload }) => {
  const [isDragActive, setIsDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true);
    } else if (e.type === 'dragleave') {
      setIsDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      onUpload(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onUpload(e.target.files[0]);
    }
  };

  return (
    <div 
      onDragEnter={handleDrag}
      onDragLeave={handleDrag}
      onDragOver={handleDrag}
      onDrop={handleDrop}
      className={`relative group cursor-pointer transition-all duration-300 ease-out h-[320px] rounded-2xl border-2 border-dashed flex flex-col items-center justify-center gap-4 ${
        isDragActive 
          ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-500/5 shadow-2xl shadow-indigo-500/10' 
          : 'border-zinc-200 dark:border-zinc-800 hover:border-indigo-300 dark:hover:border-zinc-700 bg-zinc-50 dark:bg-zinc-950/50'
      }`}
      onClick={() => fileInputRef.current?.click()}
    >
      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        className="hidden" 
        accept="image/*" 
      />
      
      <div className={`p-5 rounded-2xl transition-all duration-500 ${
        isDragActive ? 'bg-indigo-600 scale-110 shadow-lg' : 'bg-white dark:bg-zinc-900 shadow-sm border border-zinc-100 dark:border-transparent group-hover:bg-zinc-50 dark:group-hover:bg-zinc-800'
      }`}>
        {isDragActive ? (
          <ImagePlus className="w-8 h-8 text-white" />
        ) : (
          <Upload className="w-8 h-8 text-zinc-400 group-hover:text-indigo-500" />
        )}
      </div>

      <div className="text-center px-6">
        <p className="font-semibold text-zinc-700 dark:text-zinc-300 mb-1 group-hover:text-indigo-600 dark:group-hover:text-white transition-colors">
          Click or drop image here
        </p>
        <p className="text-sm text-zinc-500 max-w-[200px] leading-relaxed">
          Supports PNG, JPG, WEBP. Extract prompt from your favorite art.
        </p>
      </div>

      <div className="absolute bottom-4 left-4 right-4 py-2 px-3 rounded-lg bg-white/80 dark:bg-zinc-900/80 border border-zinc-100 dark:border-zinc-800 flex items-center gap-2 group-hover:opacity-0 transition-opacity">
        <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
        <span className="text-[10px] font-bold text-zinc-400 uppercase tracking-widest">System Ready</span>
      </div>
    </div>
  );
};

export default Dropzone;
