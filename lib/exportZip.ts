import JSZip from 'jszip';

export interface DatasetZipEntry {
  file: File;
  rawPrompt: string;
}

/**
 * Bundles each tagged image together with a matching .txt caption file (same base
 * filename) — the standard LoRA/Kohya dataset-prep convention — so the zip can be
 * dropped straight into a training folder.
 */
export async function buildDatasetZip(entries: DatasetZipEntry[]): Promise<Blob> {
  const zip = new JSZip();
  const usedNames = new Set<string>();

  for (const { file, rawPrompt } of entries) {
    const baseName = dedupeName(stripExtension(file.name), usedNames);
    usedNames.add(baseName);

    // JSZip's file() only accepts string/ArrayBuffer/Uint8Array/Buffer, not a raw
    // File/Blob — it never reads Blobs itself, so the image bytes must be read out first.
    const imageBytes = await file.arrayBuffer();
    zip.file(`${baseName}${getExtension(file.name)}`, imageBytes);
    zip.file(`${baseName}.txt`, rawPrompt);
  }

  return zip.generateAsync({ type: 'blob' });
}

function stripExtension(filename: string): string {
  const idx = filename.lastIndexOf('.');
  return idx > 0 ? filename.slice(0, idx) : filename;
}

function getExtension(filename: string): string {
  const idx = filename.lastIndexOf('.');
  return idx > 0 ? filename.slice(idx) : '';
}

// Guards against two same-named files (e.g. "image.png" from two different source folders)
// silently overwriting each other in the zip.
function dedupeName(base: string, used: Set<string>): string {
  if (!used.has(base)) return base;
  let i = 2;
  while (used.has(`${base}_${i}`)) i++;
  return `${base}_${i}`;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
