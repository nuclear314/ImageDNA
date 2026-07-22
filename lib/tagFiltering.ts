import { Tag } from '../types';

export const MASTERPIECE_LABELS = ['masterpiece', 'best_quality', 'highres', 'ultra-detailed', 'ultra_detailed', 'amazing_quality'];
export const BREAST_TAGS = ['breasts', 'flat_chest', 'small_breasts', 'medium_breasts', 'large_breasts', 'huge_breasts', 'gigantic_breasts'];
const DA_EXCLUDED_TAGS = ['1girl', '1boy', 'solo', 'looking_at_viewer'];

export interface TagFilterSettings {
  threshold: number;
  negativeTags: string;
  includeMasterpiece: boolean;
  masterpieceTags: string;
  useUnderscores: boolean;
  consolidateBreasts: boolean;
  breastSize: string;
  daTagLimit: number;
}

export interface FilteredTagResult {
  tags: Tag[];
  rawPrompt: string;
  deviantArtPrompt: string;
  hasBreastTag: boolean;
}

/**
 * Applies the same threshold/exclude/masterpiece/breast-consolidation pipeline used by the
 * single-image Tagger view, so bulk-tagged results stay identical to what a single upload
 * with the same settings would produce.
 */
export function filterAndFormatTags(rawResultTags: Tag[], settings: TagFilterSettings): FilteredTagResult {
  const {
    threshold, negativeTags, includeMasterpiece, masterpieceTags,
    useUnderscores, consolidateBreasts, breastSize, daTagLimit,
  } = settings;

  const negativeList = negativeTags
    .split(',')
    .map(t => t.trim().toLowerCase())
    .filter(t => t.length > 0);

  // Initial filter: Threshold + User Negatives
  let filtered = rawResultTags.filter(tag => {
    const isAboveThreshold = tag.confidence >= threshold;
    const isNotExcluded = !negativeList.includes(tag.label.toLowerCase());
    return isAboveThreshold && isNotExcluded;
  });

  // Strip any tagger-generated masterpiece tags (added synthetically if toggle is on)
  filtered = filtered.filter(tag => !MASTERPIECE_LABELS.includes(tag.label.toLowerCase()));

  // Sort by confidence descending
  filtered.sort((a, b) => b.confidence - a.confidence);

  // Consolidate breast tags into user-selected size (if enabled)
  const hasBreastTag = filtered.some(tag => BREAST_TAGS.includes(tag.label.toLowerCase()));
  if (consolidateBreasts && hasBreastTag) {
    const firstIdx = filtered.findIndex(tag => BREAST_TAGS.includes(tag.label.toLowerCase()));
    const maxConfidence = filtered[firstIdx].confidence;
    filtered = filtered.filter(tag => !BREAST_TAGS.includes(tag.label.toLowerCase()));
    filtered.splice(firstIdx, 0, {
      label: breastSize === 'flat' ? 'flat_chest' : `${breastSize}_breasts`,
      confidence: maxConfidence,
      category: 'general' as const
    });
  }

  // Prepend masterpiece tags if toggle is on
  if (includeMasterpiece) {
    const customTags = masterpieceTags
      .split(',')
      .map(t => t.trim())
      .filter(t => t.length > 0)
      .map(label => ({ label, confidence: 1, category: 'general' as const }));
    filtered = [...customTags, ...filtered];
  }

  // Generate the raw prompt string, normalizing word separators
  const rawPrompt = filtered.map(t =>
    useUnderscores ? t.label.replace(/ /g, '_') : t.label.replace(/_/g, ' ')
  ).join(', ');

  // Generate DeviantArt-compatible tags: lowercase, no spaces, no underscores, hyphens become underscores
  const deviantArtPrompt = filtered
    .filter(tag => {
      const normalized = tag.label.toLowerCase().replace(/ /g, '_');
      return !DA_EXCLUDED_TAGS.includes(normalized) && !normalized.endsWith('_background');
    })
    .slice(0, daTagLimit)
    .map(tag => tag.label.replace(/_/g, '').replace(/-/g, '_').replace(/\s/g, '').toLowerCase())
    .join(' ');

  return {
    tags: filtered,
    rawPrompt,
    deviantArtPrompt,
    hasBreastTag,
  };
}
