
export interface Tag {
  label: string;
  confidence: number;
  category: 'general' | 'character' | 'rating' | 'meta';
}

export interface InterrogationResult {
  tags: Tag[];
  rawPrompt: string;
  rating: string;
}

export type AppView = 'tagger' | 'promptGenerator' | 'exifExtractor' | 'bulk';

export interface ModelTags {
  general: string[];
  character: string[];
}

export type BulkItemStatus = 'queued' | 'processing' | 'done' | 'error';

export interface BulkItem {
  id: string;
  file: File;
  previewUrl: string;
  status: BulkItemStatus;
  rawTags?: Tag[];
  error?: string;
}

export enum AppState {
  IDLE = 'IDLE',
  UPLOADING = 'UPLOADING',
  INTERROGATING = 'INTERROGATING',
  RESULT = 'RESULT',
  ERROR = 'ERROR'
}

// Step 2: natural-language composition via JoyCaption, grounded in the WD14 tags from step 1.
export type CaptionMode = 'descriptive' | 'straightforward' | 'sd_prompt' | 'midjourney' | 'social_media';
export type CaptionTone = 'casual' | 'formal';
export type CaptionQuantization = '4bit' | '8bit' | 'bf16' | 'Q4_K_M' | 'Q5_K_M' | 'Q6_K' | 'Q8_0';
export type CaptionStatus = 'idle' | 'loading' | 'downloading' | 'error' | 'done';

// Windows-only: which GGUF vision-caption model KoboldCpp should load. Ignored by
// the transformers backend (Docker/dev), which only ever has one model.
export type CaptionModelId = 'joycaption-beta-one' | 'nsfwvision-v5';

// kobold backend only: whether server.py spawns/manages a local KoboldCpp
// subprocess (default) or talks HTTP to an already-running instance elsewhere.
// Ignored by the transformers backend, which has no such concept.
export type CaptionConnectionMode = 'local' | 'remote';

export interface CaptionModelOption {
  id: CaptionModelId;
  name: string;
  description: string;
}

export interface CaptionExtraOption {
  id: string;
  label: string;
  instruction: string;
}

export interface CaptionModeOption {
  id: CaptionMode;
  label: string;
  description: string;
}

// Hardware/dependency check backing the header's caption-speed indicator —
// distinct from CaptionStatus, which tracks an in-flight compose/load.
export interface CaptionCapability {
  backend: 'kobold' | 'transformers';
  available: boolean;
  cuda: boolean;
  gpu_vendor: 'nvidia' | 'amd' | 'none';
}
