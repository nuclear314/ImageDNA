import React, { useState, useEffect } from 'react';
import { Dices, Copy, Check, Loader2, Tag as TagIcon, SlidersHorizontal, Users, Layers, Ban, Sliders } from 'lucide-react';
import { ModelTags } from '../types';

interface PromptGeneratorProps {
  selectedModel: string;
}

const shuffleArray = <T,>(arr: T[]): T[] => {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

const TAG_GROUPS = [
  {
    priority: 0,
    test: (tag: string) => /^[0-9]+(girl|boy|futa|other)s?$/.test(tag) || /^multiple_(girl|boy|other)s$/.test(tag),
  },
  {
    priority: 1,
    test: (tag: string) => tag === 'solo' || tag === 'solo_focus',
  },
  {
    priority: 2,
    test: (tag: string) => ['nude', 'naked', 'completely_nude', 'topless', 'bottomless', 'covered_nipples', 'nipples', 'areolae', 'pussy', 'censored', 'uncensored', 'nude_cover'].includes(tag),
  },
  // priority 2.5 = character tags (assigned in getTagPriority)
  {
    priority: 3,
    test: (tag: string) => ['breasts', 'flat_chest', 'small_breasts', 'medium_breasts', 'large_breasts', 'huge_breasts', 'gigantic_breasts'].includes(tag),
  },
  {
    priority: 4,
    test: (tag: string) => /_hair$/.test(tag) || ['ponytail', 'twintails', 'twin_braids', 'braid', 'side_braid', 'french_braid', 'hair_bun', 'double_bun', 'pigtails', 'ahoge', 'bangs', 'blunt_bangs', 'side_ponytail', 'low_ponytail', 'high_ponytail', 'hair_over_one_eye', 'hair_between_eyes', 'sidelocks', 'hime_cut', 'bob_cut', 'pixie_cut', 'messy_hair', 'drill_hair', 'ringlets'].includes(tag),
  },
  {
    priority: 5,
    test: (tag: string) => ['dress', 'skirt', 'shirt', 'blouse', 'pants', 'shorts', 'jacket', 'coat', 'hoodie', 'sweater', 'uniform', 'school_uniform', 'sailor_uniform', 'military_uniform', 'maid', 'maid_outfit', 'kimono', 'yukata', 'bikini', 'swimsuit', 'one-piece_swimsuit', 'leotard', 'bodysuit', 'armor', 'cape', 'cloak', 'hat', 'ribbon', 'bow', 'necktie', 'scarf', 'gloves', 'boots', 'shoes', 'sandals', 'thighhighs', 'pantyhose', 'stockings', 'socks', 'knee_boots', 'high_heels', 'miniskirt', 'pleated_skirt', 'long_skirt', 'detached_sleeves', 'elbow_gloves', 'choker', 'collar', 'necklace', 'earrings', 'bracelet', 'hairband', 'headband', 'tiara', 'crown', 'glasses', 'sunglasses', 'apron', 'corset', 'belt', 'vest', 'cardigan', 'tank_top', 'crop_top', 't-shirt', 'sports_bra', 'bra', 'panties', 'underwear', 'lingerie', 'garter_belt', 'garter_straps', 'thong', 'fully_clothed'].includes(tag) || /_dress$/.test(tag) || /_shirt$/.test(tag) || /_uniform$/.test(tag) || /_outfit$/.test(tag) || /_armor$/.test(tag) || /_hat$/.test(tag) || /_ribbon$/.test(tag) || /_bow$/.test(tag) || /_skirt$/.test(tag),
  },
  {
    priority: 6,
    test: (tag: string) => /_background$/.test(tag) || ['indoors', 'outdoors', 'night', 'day', 'sunset', 'sunrise', 'rain', 'snow', 'underwater', 'sky', 'cloudy_sky', 'starry_sky', 'city', 'forest', 'beach', 'ocean', 'field', 'garden', 'classroom', 'bedroom', 'bathroom', 'kitchen', 'hallway', 'castle', 'ruins', 'cave', 'mountain', 'river', 'lake', 'street', 'alley', 'rooftop', 'balcony', 'window', 'scenery', 'landscape'].includes(tag),
  },
];

const classifyTag = (tag: string): number => {
  for (const group of TAG_GROUPS) {
    if (group.test(tag)) return group.priority;
  }
  return 7;
};

const getTagPriority = (tag: { label: string; category: 'general' | 'character' }): number => {
  if (tag.category === 'character') return 2.5;
  return classifyTag(tag.label);
};

const PromptGenerator: React.FC<PromptGeneratorProps> = ({ selectedModel }) => {
  const [modelTags, setModelTags] = useState<ModelTags | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [generalEnabled, setGeneralEnabled] = useState(true);
  const [characterEnabled, setCharacterEnabled] = useState(true);
  const [generalCount, setGeneralCount] = useState(15);
  const characterCount = 1;

  const [subjectType, setSubjectType] = useState<string>('1girl');
  const [breastConsolidate, setBreastConsolidate] = useState(false);
  const [breastSize, setBreastSize] = useState<string>('large_breasts');
  const [excludeTags, setExcludeTags] = useState('');

  const [generatedTags, setGeneratedTags] = useState<{ label: string; category: 'general' | 'character' }[]>([]);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const fetchTags = async () => {
      setIsLoading(true);
      setError(null);
      try {
        const res = await fetch(`/api/tags?model=${encodeURIComponent(selectedModel)}`);
        if (!res.ok) throw new Error('Failed to fetch tags');
        const data: ModelTags = await res.json();
        if (!cancelled) {
          setModelTags(data);
          setGeneratedTags([]);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load tags');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };
    fetchTags();
    return () => { cancelled = true; };
  }, [selectedModel]);

  const makeExcludeFilter = (raw: string, committedOnly = false) => {
    const parts = raw.split(',').map(t => t.trim().toLowerCase());
    // committedOnly: ignore the last segment (still being typed) unless raw ends with comma
    const list = committedOnly
      ? (raw.endsWith(',') ? parts : parts.slice(0, -1)).filter(t => t.length > 0)
      : parts.filter(t => t.length > 0);
    return (tag: string) =>
      list.some(ex => tag.toLowerCase().replace(/_/g, ' ').includes(ex) || tag.toLowerCase().includes(ex));
  };

  // Live-update subject type in existing prompt without re-rolling
  useEffect(() => {
    if (generatedTags.length === 0) return;
    const without = generatedTags.filter(t => t.category !== 'general' || classifyTag(t.label) !== 0);
    if (subjectType !== 'none') {
      without.unshift({ label: subjectType, category: 'general' as const });
    }
    without.sort((a, b) => getTagPriority(a) - getTagPriority(b));
    setGeneratedTags(without);
  }, [subjectType]);

  // Live-update breast size in existing prompt without re-rolling
  useEffect(() => {
    if (generatedTags.length === 0) return;
    const without = generatedTags.filter(t => t.category !== 'general' || classifyTag(t.label) !== 3);
    if (breastConsolidate) {
      without.push({ label: breastSize, category: 'general' as const });
    }
    without.sort((a, b) => getTagPriority(a) - getTagPriority(b));
    setGeneratedTags(without);
  }, [breastSize, breastConsolidate]);

  // Live-remove excluded tags — only apply committed terms (followed by comma)
  useEffect(() => {
    if (generatedTags.length === 0) return;
    const isExcluded = makeExcludeFilter(excludeTags, true);
    const filtered = generatedTags.filter(t => !isExcluded(t.label));
    if (filtered.length !== generatedTags.length) {
      setGeneratedTags(filtered);
    }
  }, [excludeTags]);

  const handleGenerate = () => {
    if (!modelTags) return;

    const isExcluded = makeExcludeFilter(excludeTags);

    const result: { label: string; category: 'general' | 'character' }[] = [];

    // When character is enabled, inject the user-chosen subject type instead of random
    if (characterEnabled && subjectType !== 'none') {
      result.push({ label: subjectType, category: 'general' as const });
    }

    if (characterEnabled && modelTags.character.length > 0) {
      const pool = modelTags.character.filter(t => !isExcluded(t));
      const count = Math.min(characterCount, pool.length);
      const selected = shuffleArray(pool).slice(0, count);
      result.push(...selected.map(label => ({ label, category: 'character' as const })));
    }

    // When breast consolidation is on, inject the chosen size
    if (breastConsolidate) {
      result.push({ label: breastSize, category: 'general' as const });
    }

    if (generalEnabled && modelTags.general.length > 0) {
      // Exclude subject count tags when character is enabled (user picks manually)
      // Exclude breast tags when consolidation is enabled (user picks manually)
      const pool = modelTags.general.filter(t =>
        !isExcluded(t)
        && !(characterEnabled && classifyTag(t) === 0)
        && !(breastConsolidate && classifyTag(t) === 3)
      );
      const count = Math.min(generalCount, pool.length);

      // Bucket tags by priority group
      const buckets = new Map<number, string[]>();
      for (const tag of pool) {
        const p = classifyTag(tag);
        if (!buckets.has(p)) buckets.set(p, []);
        buckets.get(p)!.push(tag);
      }

      const picked = new Set<string>();

      // Pick 1 tag from each structured group that has tags
      for (const group of TAG_GROUPS) {
        const bucket = buckets.get(group.priority);
        if (bucket && bucket.length > 0) {
          const choice = bucket[Math.floor(Math.random() * bucket.length)];
          picked.add(choice);
        }
      }

      // Fill remaining slots from the full pool (avoiding duplicates)
      const remaining = count - picked.size;
      if (remaining > 0) {
        const leftovers = shuffleArray(pool.filter(t => !picked.has(t)));
        for (let i = 0; i < Math.min(remaining, leftovers.length); i++) {
          picked.add(leftovers[i]);
        }
      }

      // If we picked more from groups than generalCount, trim to count
      const selected = [...picked].slice(0, count);
      result.push(...selected.map(label => ({ label, category: 'general' as const })));
    }

    result.sort((a, b) => getTagPriority(a) - getTagPriority(b));
    setGeneratedTags(result);
  };

  const handleCopy = () => {
    const prompt = generatedTags.map(t => t.label.replace(/_/g, ' ')).join(', ');
    navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const getCategoryColor = (category: string) => {
    switch (category) {
      case 'character': return 'text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-400/10 border-purple-200 dark:border-purple-400/20';
      default: return 'text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-400/10 border-indigo-200 dark:border-indigo-400/20';
    }
  };

  return (
    <main className="max-w-3xl mx-auto px-4 py-8 pb-24">
      {/* Title */}
      <div className="flex items-center gap-3 mb-8">
        <div className="w-10 h-10 bg-indigo-600 dark:bg-indigo-500 rounded-xl flex items-center justify-center shadow-lg shadow-indigo-600/20 dark:shadow-indigo-500/20">
          <Dices className="w-5 h-5 text-white" />
        </div>
        <div>
          <h2 className="text-xl font-bold text-zinc-900 dark:text-zinc-100">Random Prompt Generator</h2>
          <p className="text-xs text-zinc-500 dark:text-zinc-400">Build structured prompts from the model's tag vocabulary</p>
        </div>
      </div>

      {/* Loading State */}
      {isLoading && (
        <div className="flex flex-col items-center justify-center py-16">
          <Loader2 className="w-8 h-8 text-indigo-500 animate-spin mb-4" />
          <p className="text-sm text-zinc-500">Loading tags for model...</p>
        </div>
      )}

      {/* Error State */}
      {error && (
        <div className="text-center py-12 border-2 border-dashed border-red-200 dark:border-red-900 rounded-3xl p-8">
          <h3 className="text-xl font-medium text-red-600 dark:text-red-400 mb-2">Failed to Load Tags</h3>
          <p className="text-sm text-zinc-500 mb-4">{error}</p>
          <button
            onClick={() => {
              setError(null);
              setIsLoading(true);
              fetch(`/api/tags?model=${encodeURIComponent(selectedModel)}`)
                .then(res => { if (!res.ok) throw new Error('Failed to fetch tags'); return res.json(); })
                .then((data: ModelTags) => { setModelTags(data); setGeneratedTags([]); })
                .catch(err => setError(err instanceof Error ? err.message : 'Failed to load tags'))
                .finally(() => setIsLoading(false));
            }}
            className="px-4 py-2 bg-red-500/10 text-red-600 dark:text-red-400 rounded-lg text-sm hover:bg-red-500/20 transition-colors"
          >
            Try Again
          </button>
        </div>
      )}

      {/* Controls */}
      {!isLoading && !error && modelTags && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-zinc-900/50 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm dark:shadow-none">
            <div className="flex items-center gap-3 mb-6">
              <div className="bg-indigo-500/10 p-2 rounded-lg">
                <SlidersHorizontal className="w-4 h-4 text-indigo-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">Generation Controls</p>
                <p className="text-[10px] text-zinc-400 dark:text-zinc-500">Configure which tag categories and how many to include.</p>
              </div>
            </div>

            <div className="space-y-5">
              {/* General Tags Control */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="bg-indigo-500/10 p-1.5 rounded-md">
                      <Layers className="w-3.5 h-3.5 text-indigo-500" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">General Tags</p>
                      <p className="text-[10px] text-zinc-400 dark:text-zinc-500">{modelTags.general.length.toLocaleString()} tags available</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setGeneralEnabled(!generalEnabled)}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${generalEnabled ? 'bg-indigo-600' : 'bg-zinc-200 dark:bg-zinc-700'}`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${generalEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
                {generalEnabled && (
                  <div className="ml-9 mt-2 flex items-center gap-3">
                    <input
                      type="range"
                      min={1}
                      max={Math.min(50, modelTags.general.length)}
                      value={generalCount}
                      onChange={(e) => setGeneralCount(Number(e.target.value))}
                      className="flex-1 h-2 bg-zinc-200 dark:bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
                    />
                    <input
                      type="number"
                      min={1}
                      max={Math.min(50, modelTags.general.length)}
                      value={generalCount}
                      onChange={(e) => {
                        const val = Math.max(1, Math.min(Math.min(50, modelTags.general.length), Number(e.target.value) || 1));
                        setGeneralCount(val);
                      }}
                      className="w-14 text-sm font-medium text-zinc-700 dark:text-zinc-200 text-center bg-zinc-50 dark:bg-zinc-800 border border-zinc-200 dark:border-zinc-700 rounded-lg px-2 py-1 focus:outline-none focus:ring-1 focus:ring-indigo-500/50"
                    />
                  </div>
                )}
              </div>

              {/* Character Tags Control */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="bg-purple-500/10 p-1.5 rounded-md">
                      <Users className="w-3.5 h-3.5 text-purple-500" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">Character Tags</p>
                      <p className="text-[10px] text-zinc-400 dark:text-zinc-500">{modelTags.character.length.toLocaleString()} tags available</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setCharacterEnabled(!characterEnabled)}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${characterEnabled ? 'bg-purple-500' : 'bg-zinc-200 dark:bg-zinc-700'}`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${characterEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
                {characterEnabled && (
                  <div className="ml-9 mt-2">
                    <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mb-2">Subject type</p>
                    <div className="flex flex-wrap gap-1.5">
                      {['1girl', '1boy', '1other', 'none'].map(opt => (
                        <button
                          key={opt}
                          onClick={() => setSubjectType(opt)}
                          className={`px-3 py-1 rounded-lg text-xs font-medium border transition-all ${
                            subjectType === opt
                              ? 'bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/50'
                              : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600'
                          }`}
                        >
                          {opt === 'none' ? 'None' : opt}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              {/* Breast Size Control */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-3">
                    <div className="bg-rose-500/10 p-1.5 rounded-md">
                      <Sliders className="w-3.5 h-3.5 text-rose-500" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">Consolidate Breasts</p>
                      <p className="text-[10px] text-zinc-400 dark:text-zinc-500">Lock breast size instead of random.</p>
                    </div>
                  </div>
                  <button
                    onClick={() => setBreastConsolidate(!breastConsolidate)}
                    className={`relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${breastConsolidate ? 'bg-rose-500' : 'bg-zinc-200 dark:bg-zinc-700'}`}
                  >
                    <span className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${breastConsolidate ? 'translate-x-5' : 'translate-x-0'}`} />
                  </button>
                </div>
                {breastConsolidate && (
                  <div className="ml-9 mt-2">
                    <p className="text-[10px] text-zinc-400 dark:text-zinc-500 mb-2">Size</p>
                    <div className="flex flex-wrap gap-1.5">
                      {['flat_chest', 'small_breasts', 'medium_breasts', 'large_breasts', 'huge_breasts', 'gigantic_breasts'].map(opt => (
                        <button
                          key={opt}
                          onClick={() => setBreastSize(opt)}
                          className={`px-3 py-1 rounded-lg text-xs font-medium border transition-all ${
                            breastSize === opt
                              ? 'bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/50'
                              : 'bg-zinc-50 dark:bg-zinc-800 text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:border-zinc-300 dark:hover:border-zinc-600'
                          }`}
                        >
                          {opt.replace(/_/g, ' ')}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Exclude Tags */}
            <div className="pt-5 border-t border-zinc-100 dark:border-zinc-800">
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-3">
                  <div className="bg-rose-500/10 p-1.5 rounded-md">
                    <Ban className="w-3.5 h-3.5 text-rose-500" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-zinc-700 dark:text-zinc-200">Exclude Tags</p>
                    <p className="text-[10px] text-zinc-400 dark:text-zinc-500">Tags matching these terms will never appear.</p>
                  </div>
                </div>
              </div>
              <textarea
                value={excludeTags}
                onChange={(e) => setExcludeTags(e.target.value)}
                placeholder="e.g. text, watermark, signature..."
                className="w-full h-20 bg-zinc-50 dark:bg-zinc-950 border border-zinc-200 dark:border-zinc-800 rounded-xl p-3 text-sm text-zinc-600 dark:text-zinc-300 placeholder:text-zinc-300 dark:placeholder:text-zinc-700 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 focus:border-indigo-500/50 resize-none transition-all shadow-inner"
              />
              <p className="mt-2 text-[10px] text-zinc-400 dark:text-zinc-500 italic">
                Comma-separated list of tags to exclude from generation.
              </p>
            </div>

            {/* Generate Button */}
            <button
              onClick={handleGenerate}
              disabled={!generalEnabled && !characterEnabled}
              className="w-full mt-6 flex items-center justify-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium rounded-xl shadow-lg shadow-indigo-500/20 transition-all"
            >
              <Dices className="w-5 h-5" />
              {generatedTags.length > 0 ? 'Re-roll' : 'Generate Prompt'}
            </button>
          </div>

          {/* Results */}
          {generatedTags.length > 0 && (
            <div className="bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-2xl p-6 shadow-sm dark:shadow-2xl dark:shadow-indigo-500/5 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex items-center justify-between mb-6">
                <h3 className="text-lg font-semibold flex items-center gap-2">
                  <TagIcon className="w-5 h-5 text-indigo-500 dark:text-indigo-400" />
                  Generated Prompt
                  <span className="ml-2 text-xs font-normal text-zinc-500 bg-zinc-100 dark:bg-zinc-800 px-2 py-0.5 rounded-full">
                    {generatedTags.length} tags
                  </span>
                </h3>
                <button
                  onClick={handleCopy}
                  className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                    copied
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/50'
                      : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-lg shadow-indigo-500/20'
                  }`}
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Copied' : 'Copy Tags'}
                </button>
              </div>

              {/* Tag Chips */}
              <div className="flex flex-wrap gap-2 mb-6">
                {generatedTags.map((tag, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center px-3 py-1.5 rounded-lg border text-sm font-medium hover:scale-105 transition-all cursor-default shadow-sm dark:shadow-none ${getCategoryColor(tag.category)}`}
                  >
                    <span className="mono">{tag.label.replace(/_/g, ' ')}</span>
                  </div>
                ))}
              </div>

              {/* Raw Prompt Text */}
              <div className="p-4 bg-zinc-50 dark:bg-zinc-950 rounded-xl border border-zinc-200 dark:border-zinc-800">
                <p className="text-sm mono text-zinc-700 dark:text-zinc-300 break-words leading-relaxed">
                  {generatedTags.map(t => t.label.replace(/_/g, ' ')).join(', ')}
                </p>
              </div>
            </div>
          )}
        </div>
      )}
    </main>
  );
};

export default PromptGenerator;
