import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { buildDatasetZip } from './exportZip';

const makeFile = (name: string, content = 'fake image bytes') =>
  new File([content], name, { type: 'image/png' });

describe('buildDatasetZip', () => {
  it('bundles each image with a matching .txt caption of the same base name', async () => {
    const blob = await buildDatasetZip([
      { file: makeFile('cat.png'), rawPrompt: 'cat, whiskers' },
      { file: makeFile('dog.jpg'), rawPrompt: 'dog, tail' },
    ]);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(Object.keys(zip.files).sort()).toEqual(['cat.png', 'cat.txt', 'dog.jpg', 'dog.txt']);
    expect(await zip.file('cat.txt')!.async('string')).toBe('cat, whiskers');
    expect(await zip.file('dog.txt')!.async('string')).toBe('dog, tail');
  });

  it('dedupes same-named files instead of overwriting one another', async () => {
    const blob = await buildDatasetZip([
      { file: makeFile('image.png'), rawPrompt: 'first' },
      { file: makeFile('image.png'), rawPrompt: 'second' },
    ]);
    const zip = await JSZip.loadAsync(await blob.arrayBuffer());
    expect(Object.keys(zip.files).sort()).toEqual(['image.txt', 'image_2.png', 'image_2.txt', 'image.png'].sort());
    expect(await zip.file('image.txt')!.async('string')).toBe('first');
    expect(await zip.file('image_2.txt')!.async('string')).toBe('second');
  });
});
