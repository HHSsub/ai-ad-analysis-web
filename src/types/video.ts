// src/types/video.ts

export interface VideoInput {
  title: string;
  url: string;
  note: string;
}

// ✅ 'analyzing', 'incomplete' 추가 (에러 수정)
export type AnalysisStatus = 'welcome' | 'input' | 'loading' | 'analyzing' | 'completed' | 'incomplete' | 'failed';

export interface YouTubeMetadata {
  viewCount: number;
  likeCount: number;
  commentCount: number;
  duration: string;
  channelTitle: string;
  publishedAt: string;
  description: string;
  tags: string[];
  categoryId: string;
}

export interface CompletionStats {
  completed: number;
  incomplete: number;
  total: number;
  percentage: number;
}

export interface AnalysisResult {
  id: string;
  title: string;
  url: string;
  notes: string; // ✅ 'note'가 아닌 'notes' (에러 수정)
  status: AnalysisStatus;
  analysis?: { [category: string]: { [feature: string]: string } };
  features?: { [key: string]: any };
  completionStats?: CompletionStats;
  scriptLanguage?: string;
  youtubeData?: YouTubeMetadata;
  error?: string;
}

export interface QuantitativeMetrics {
  interestIndex: number;
  retentionIndex: number;
  growthIndex: number;
  finalScore: number;
}

export interface QualitativeMetrics {
  openingHookIndex: number;
  brandDeliveryIndex: number;
  storyStructureIndex: number;
  visualAestheticsIndex: number;
  audioPersuasionIndex: number;
  uniquenessIndex: number;
  messageTargetFitIndex: number;
  ctaEfficiencyIndex: number;
  qualityScore: number;
}

export interface HybridScore {
  quantitative: QuantitativeMetrics;
  qualitative: QualitativeMetrics;
  final: number;
}

export interface AnalysisProgress {
  total: number;
  completed: number;
  current: string;
  stage: 'youtube' | 'gemini' | 'complete';
  videos: AnalysisResult[];
}

export interface VideoFeature {
  no: string;
  category: string;
  item: string;
}

export interface AnalyzedVideo extends AnalysisResult {
  features: { [key: string]: any };
  hybridScore?: HybridScore;
  createdAt: string;
  updatedAt?: string;
}

// ⚠️ VIDEO_FEATURES 하드코딩 제거 - CSV에서 로드하도록 변경
// 기존 코드에서 VIDEO_FEATURES를 사용하는 곳은 loadFeaturesFromCSV()로 대체

export interface VideoStoreState {
  videos: VideoInput[];
  analysisStatus: AnalysisStatus;
  results: (AnalysisResult | { status: 'rejected'; reason: any })[];
  selectedVideo: AnalysisResult | null;
  error: string | null;
  progress: AnalysisProgress | null;
}

export interface VideoStoreActions {
  setVideos: (videos: VideoInput[]) => void;
  setAnalysisStatus: (status: AnalysisStatus) => void;
  setResults: (results: any[]) => void;
  setSelectedVideo: (video: AnalysisResult | null) => void;
  setError: (error: string | null) => void;
  setProgress: (progress: AnalysisProgress | null) => void;
  addResult: (result: AnalysisResult) => void;
  updateResult: (id: string, updates: Partial<AnalysisResult>) => void;
  clearAll: () => void;
}
