
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

export type AppView = 'tagger' | 'promptGenerator';

export interface ModelTags {
  general: string[];
  character: string[];
}

export enum AppState {
  IDLE = 'IDLE',
  UPLOADING = 'UPLOADING',
  INTERROGATING = 'INTERROGATING',
  RESULT = 'RESULT',
  ERROR = 'ERROR'
}
