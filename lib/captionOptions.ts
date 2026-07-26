import { CaptionExtraOption, CaptionModeOption } from '../types';

// Mirrors JoyCaption Beta One's own prompt templates:
// https://github.com/fpgaminer/joycaption#how-to-prompt-joycaption
export const CAPTION_MODES: CaptionModeOption[] = [
  { id: 'descriptive', label: 'Descriptive', description: 'Full natural-language description of the image (formal or casual tone).' },
  { id: 'straightforward', label: 'Straightforward', description: 'Concise, objective prose. Confident language, no hedging or mood words.' },
  { id: 'sd_prompt', label: 'SD-style Prompt', description: 'Mimics a real Stable Diffusion prompt: natural language mixed with booru-style tags.' },
  { id: 'midjourney', label: 'MidJourney', description: 'Written in the style of a MidJourney prompt.' },
  { id: 'social_media', label: 'Social Media', description: 'Caption styled the way a social post would be written.' },
];

// Curated subset of JoyCaption's official "extra options" most useful for
// anime diffusion prompt engineering (not the full model-card list).
export const CAPTION_EXTRA_OPTIONS: CaptionExtraOption[] = [
  { id: 'lighting', label: 'Lighting', instruction: 'Include information about lighting.' },
  { id: 'camera_angle', label: 'Camera angle', instruction: 'Include information about camera angle.' },
  { id: 'depth_of_field', label: 'Depth of field', instruction: 'Specify the depth of field and whether the background is in focus or blurred.' },
  { id: 'composition', label: 'Composition', instruction: "Include information on the image's composition style, such as leading lines, rule of thirds, or symmetry." },
  { id: 'watermark', label: 'Watermark check', instruction: 'Include information about whether there is a watermark or not.' },
  { id: 'rating', label: 'SFW / suggestive / NSFW', instruction: 'Include whether the image is sfw, suggestive, or nsfw.' },
  { id: 'no_ambiguous', label: 'No ambiguous language', instruction: 'Do NOT use any ambiguous language.' },
];
