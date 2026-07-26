
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
export type CaptionQuantization = '4bit' | '8bit' | 'bf16';
export type CaptionStatus = 'idle' | 'loading' | 'downloading' | 'error' | 'done';

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
  available: boolean;
  cuda: boolean;
}
