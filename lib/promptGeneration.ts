import { ModelTags } from '../types';

export interface GeneratedTag {
  label: string;
  category: 'general' | 'character';
}

export const shuffleArray = <T,>(arr: T[]): T[] => {
  const shuffled = [...arr];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
};

export const TAG_GROUPS = [
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

export const classifyTag = (tag: string): number => {
  for (const group of TAG_GROUPS) {
    if (group.test(tag)) return group.priority;
  }
  return 7;
};

export const getTagPriority = (tag: { label: string; category: 'general' | 'character' }): number => {
  if (tag.category === 'character') return 2.5;
  return classifyTag(tag.label);
};

export const sortByPriority = (tags: GeneratedTag[]): GeneratedTag[] =>
  [...tags].sort((a, b) => getTagPriority(a) - getTagPriority(b));

export const makeExcludeFilter = (raw: string, committedOnly = false) => {
  const parts = raw.split(',').map(t => t.trim().toLowerCase());
  // committedOnly: ignore the last segment (still being typed) unless raw ends with comma
  const list = committedOnly
    ? (raw.endsWith(',') ? parts : parts.slice(0, -1)).filter(t => t.length > 0)
    : parts.filter(t => t.length > 0);
  return (tag: string) =>
    list.some(ex => tag.toLowerCase().replace(/_/g, ' ').includes(ex) || tag.toLowerCase().includes(ex));
};

export interface GeneratePromptOptions {
  characterEnabled: boolean;
  characterOnlyMode: boolean;
  subjectType: string;
  breastConsolidate: boolean;
  breastSize: string;
  generalEnabled: boolean;
  generalCount: number;
  characterCount: number;
  excludeTags: string;
}

export const generatePrompt = (modelTags: ModelTags, options: GeneratePromptOptions): GeneratedTag[] => {
  const {
    characterEnabled, characterOnlyMode, subjectType,
    breastConsolidate, breastSize,
    generalEnabled, generalCount, characterCount, excludeTags,
  } = options;

  const isExcluded = makeExcludeFilter(excludeTags);
  const result: GeneratedTag[] = [];

  // When character is enabled, inject the user-chosen subject type instead of random
  if (characterEnabled && !characterOnlyMode && subjectType !== 'none') {
    result.push({ label: subjectType, category: 'general' });
  }

  if (characterEnabled && modelTags.character.length > 0) {
    const pool = modelTags.character.filter(t => !isExcluded(t));
    const count = Math.min(characterCount, pool.length);
    const selected = shuffleArray(pool).slice(0, count);
    result.push(...selected.map(label => ({ label, category: 'character' as const })));
  }

  // When breast consolidation is on, inject the chosen size
  if (breastConsolidate) {
    result.push({ label: breastSize, category: 'general' });
  }

  if (generalEnabled && modelTags.general.length > 0) {
    // Exclude subject count tags when character is enabled (user picks manually)
    // Exclude breast tags when consolidation is enabled (user picks manually)
    const pool = modelTags.general.filter(t =>
      !isExcluded(t)
      && !(characterEnabled && classifyTag(t) === 0)
      && !(breastConsolidate && classifyTag(t) === 3)
      && !(characterOnlyMode && classifyTag(t) === 6)
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

  return sortByPriority(result);
};
