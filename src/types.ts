export interface CompanyInfo {
  name: string;
  address?: string;
  description?: string;
}

export interface SearchResultItem {
  title: string;
  url: string;
  snippet?: string;
}

export interface PageContent extends SearchResultItem {
  content: string;
}

export interface ScoredUrl {
  url: string;
  score: number;
  reason?: string;
}

export interface GeminiScoreResponse {
  urls: ScoredUrl[];
}
