
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

export enum AppState {
  IDLE = 'IDLE',
  UPLOADING = 'UPLOADING',
  INTERROGATING = 'INTERROGATING',
  RESULT = 'RESULT',
  ERROR = 'ERROR'
}
