import { describe, it, expect } from 'vitest';
import {
  classifyTag,
  getTagPriority,
  makeExcludeFilter,
  sortByPriority,
  shuffleArray,
  generatePrompt,
  GeneratedTag,
} from './promptGeneration';

describe('classifyTag', () => {
  it('classifies subject count tags as priority 0', () => {
    expect(classifyTag('1girl')).toBe(0);
    expect(classifyTag('multiple_boys')).toBe(0);
  });

  it('classifies solo tags as priority 1', () => {
    expect(classifyTag('solo')).toBe(1);
    expect(classifyTag('solo_focus')).toBe(1);
  });

  it('classifies nudity tags as priority 2', () => {
    expect(classifyTag('nude')).toBe(2);
  });

  it('classifies breast tags as priority 3', () => {
    expect(classifyTag('large_breasts')).toBe(3);
  });

  it('classifies hair tags as priority 4', () => {
    expect(classifyTag('long_hair')).toBe(4);
    expect(classifyTag('ponytail')).toBe(4);
  });

  it('classifies clothing tags as priority 5', () => {
    expect(classifyTag('school_uniform')).toBe(5);
    expect(classifyTag('frilled_skirt')).toBe(5);
  });

  it('classifies background tags as priority 6', () => {
    expect(classifyTag('outdoors')).toBe(6);
    expect(classifyTag('pink_background')).toBe(6);
  });

  it('falls back to priority 7 for unrecognized tags', () => {
    expect(classifyTag('some_unknown_tag')).toBe(7);
  });
});

describe('getTagPriority', () => {
  it('assigns character tags priority 2.5 regardless of label', () => {
    expect(getTagPriority({ label: 'anything', category: 'character' })).toBe(2.5);
  });

  it('delegates to classifyTag for general tags', () => {
    expect(getTagPriority({ label: '1girl', category: 'general' })).toBe(0);
  });
});

describe('sortByPriority', () => {
  it('orders tags by priority ascending without mutating the input', () => {
    const input: GeneratedTag[] = [
      { label: 'outdoors', category: 'general' },
      { label: '1girl', category: 'general' },
      { label: 'some_character', category: 'character' },
      { label: 'solo', category: 'general' },
    ];
    const sorted = sortByPriority(input);
    expect(sorted.map(t => t.label)).toEqual(['1girl', 'solo', 'some_character', 'outdoors']);
    expect(input[0].label).toBe('outdoors'); // original order untouched
  });
});

describe('makeExcludeFilter', () => {
  it('matches on substrings, ignoring underscores', () => {
    const isExcluded = makeExcludeFilter('water');
    expect(isExcluded('watermark')).toBe(true);
    expect(isExcluded('underwater')).toBe(true);
    expect(isExcluded('1girl')).toBe(false);
  });

  it('ignores the last (still-typing) segment in committedOnly mode unless trailing comma', () => {
    const notYetCommitted = makeExcludeFilter('watermark, sig', true);
    expect(notYetCommitted('signature')).toBe(false); // "sig" not committed yet

    const committed = makeExcludeFilter('watermark, sig,', true);
    expect(committed('signature')).toBe(true); // trailing comma commits "sig"
  });
});

describe('shuffleArray', () => {
  it('returns a permutation of the same elements without mutating the original', () => {
    const original = [1, 2, 3, 4, 5];
    const copy = [...original];
    const shuffled = shuffleArray(original);
    expect(shuffled).toHaveLength(original.length);
    expect([...shuffled].sort()).toEqual([...original].sort());
    expect(original).toEqual(copy); // input untouched
  });
});

describe('generatePrompt', () => {
  const modelTags = {
    general: ['1girl', 'solo', 'large_breasts', 'long_hair', 'school_uniform', 'outdoors', 'random_tag'],
    character: ['some_character'],
  };

  const baseOptions = {
    characterEnabled: true,
    characterOnlyMode: false,
    subjectType: '1girl',
    breastConsolidate: false,
    breastSize: 'large_breasts',
    generalEnabled: true,
    generalCount: 10,
    characterCount: 1,
    excludeTags: '',
  };

  it('injects the chosen subject type and a character tag, sorted by priority', () => {
    const result = generatePrompt(modelTags, baseOptions);
    expect(result[0]).toEqual({ label: '1girl', category: 'general' });
    expect(result.some(t => t.label === 'some_character' && t.category === 'character')).toBe(true);
  });

  it('excludes subject-count general tags when character mode is enabled', () => {
    const result = generatePrompt(modelTags, baseOptions);
    // '1girl' only appears once, as the injected subject type, not doubled from the general pool
    expect(result.filter(t => t.label === '1girl')).toHaveLength(1);
  });

  it('injects the chosen breast size and excludes breast tags from the general pool when consolidating', () => {
    const result = generatePrompt(modelTags, { ...baseOptions, breastConsolidate: true, breastSize: 'small_breasts' });
    expect(result.some(t => t.label === 'small_breasts')).toBe(true);
    expect(result.some(t => t.label === 'large_breasts')).toBe(false);
  });

  it('respects the exclude list', () => {
    const result = generatePrompt(modelTags, { ...baseOptions, excludeTags: 'school' });
    expect(result.some(t => t.label === 'school_uniform')).toBe(false);
  });

  it('omits character tags entirely when characterEnabled is false', () => {
    const result = generatePrompt(modelTags, { ...baseOptions, characterEnabled: false });
    expect(result.some(t => t.category === 'character')).toBe(false);
  });
});
