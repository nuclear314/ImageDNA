import { describe, it, expect } from 'vitest';
import { filterAndFormatTags, TagFilterSettings } from './tagFiltering';
import { Tag } from '../types';

const baseSettings: TagFilterSettings = {
  threshold: 0.35,
  negativeTags: '',
  includeMasterpiece: false,
  masterpieceTags: 'masterpiece, best quality',
  useUnderscores: false,
  consolidateBreasts: false,
  breastSize: 'medium',
  daTagLimit: 30,
};

const tag = (label: string, confidence: number, category: Tag['category'] = 'general'): Tag =>
  ({ label, confidence, category });

describe('filterAndFormatTags', () => {
  it('filters out tags below the confidence threshold', () => {
    const result = filterAndFormatTags([
      tag('1girl', 0.9),
      tag('barely_there', 0.1),
    ], baseSettings);
    expect(result.tags.map(t => t.label)).toEqual(['1girl']);
  });

  it('excludes tags in the negative list (case-insensitive)', () => {
    const result = filterAndFormatTags([
      tag('1girl', 0.9),
      tag('watermark', 0.8),
    ], { ...baseSettings, negativeTags: 'Watermark' });
    expect(result.tags.map(t => t.label)).toEqual(['1girl']);
  });

  it('strips any synthetic masterpiece tags from the raw results', () => {
    const result = filterAndFormatTags([
      tag('1girl', 0.9),
      tag('masterpiece', 0.99),
    ], baseSettings);
    expect(result.tags.some(t => t.label === 'masterpiece')).toBe(false);
  });

  it('sorts tags by confidence descending', () => {
    const result = filterAndFormatTags([
      tag('low', 0.4),
      tag('high', 0.95),
      tag('mid', 0.6),
    ], baseSettings);
    expect(result.tags.map(t => t.label)).toEqual(['high', 'mid', 'low']);
  });

  it('consolidates breast tags into the chosen size when enabled', () => {
    const result = filterAndFormatTags([
      tag('1girl', 0.9),
      tag('large_breasts', 0.8),
      tag('small_breasts', 0.7),
    ], { ...baseSettings, consolidateBreasts: true, breastSize: 'huge' });
    const breastTags = result.tags.filter(t => t.label.endsWith('breasts') || t.label === 'flat_chest');
    expect(breastTags).toHaveLength(1);
    expect(breastTags[0].label).toBe('huge_breasts');
    expect(result.hasBreastTag).toBe(true);
  });

  it('leaves breast tags untouched when consolidation is disabled', () => {
    const result = filterAndFormatTags([
      tag('large_breasts', 0.8),
      tag('small_breasts', 0.7),
    ], baseSettings);
    expect(result.tags.map(t => t.label)).toEqual(['large_breasts', 'small_breasts']);
  });

  it('prepends custom masterpiece tags when enabled', () => {
    const result = filterAndFormatTags([tag('1girl', 0.9)], {
      ...baseSettings, includeMasterpiece: true, masterpieceTags: 'masterpiece, best quality',
    });
    expect(result.tags.map(t => t.label)).toEqual(['masterpiece', 'best quality', '1girl']);
  });

  it('formats the raw prompt with spaces by default, underscores when toggled', () => {
    const tags = [tag('long_hair', 0.9)];
    expect(filterAndFormatTags(tags, baseSettings).rawPrompt).toBe('long hair');
    expect(filterAndFormatTags(tags, { ...baseSettings, useUnderscores: true }).rawPrompt).toBe('long_hair');
  });

  it('builds a DeviantArt prompt that excludes DA-excluded tags and background tags, capped at the tag limit', () => {
    const result = filterAndFormatTags([
      tag('1girl', 0.95),
      tag('solo', 0.9),
      tag('long_hair', 0.85),
      tag('outdoor_background', 0.8),
    ], { ...baseSettings, daTagLimit: 1 });
    // '1girl' and 'solo' are DA-excluded, 'outdoor_background' ends with _background
    expect(result.deviantArtPrompt).toBe('longhair');
  });
});
