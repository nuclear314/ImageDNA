import { CaptionExtraOption, CaptionModeOption, CaptionModelId, CaptionModelOption, CaptionQuantization } from '../types';

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

// Windows-only (KoboldCpp/GGUF backend) — ignored by the transformers backend
// (Docker/dev), which only ever has one caption model. IDs must match the keys
// of joycaptioner_kobold.py's KOBOLD_CAPTION_MODELS catalog.
export const KOBOLD_CAPTION_MODELS: CaptionModelOption[] = [
  { id: 'joycaption-beta-one', name: 'JoyCaption Beta One', description: 'General-purpose descriptive captioning (default)' },
  { id: 'nsfwvision-v5', name: 'NSFWVision v5 (Qwen3.5 9B)', description: 'NSFW-oriented captioning' },
];

// Windows standalone backend (KoboldCpp/GGUF) only. Each caption model's own
// quant set — these are NOT interchangeable across models (e.g. nsfwvision-v5
// has no Q6_K quant, only up to Q8_0), so the selector must show only the
// options that are real for whichever model is currently selected, never a
// shared list. Must mirror joycaptioner_kobold.py's KOBOLD_CAPTION_MODELS
// quant_filenames keys exactly.
export const KOBOLD_QUANT_OPTIONS_BY_MODEL: Record<CaptionModelId, { id: CaptionQuantization; name: string; description: string }[]> = {
  'joycaption-beta-one': [
    { id: 'Q4_K_M', name: 'Q4_K_M (recommended)', description: '~5-6GB VRAM. Fastest, small quality trade-off.' },
    { id: 'Q5_K_M', name: 'Q5_K_M', description: '~6-7GB VRAM. Better quality, slightly slower.' },
    { id: 'Q6_K', name: 'Q6_K', description: '~8-9GB VRAM. Best quality, needs more VRAM.' },
  ],
  'nsfwvision-v5': [
    { id: 'Q4_K_M', name: 'Q4_K_M (recommended)', description: '~5-6GB VRAM. Fastest, small quality trade-off.' },
    { id: 'Q5_K_M', name: 'Q5_K_M', description: '~6-7GB VRAM. Better quality, slightly slower.' },
    { id: 'Q8_0', name: 'Q8_0', description: '~9-10GB VRAM. Best quality, needs more VRAM.' },
  ],
};
