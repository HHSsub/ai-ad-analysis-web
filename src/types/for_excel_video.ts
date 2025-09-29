// 더 이상 사용하지 않는 코드임 (this code is not available for now)
// 기본 비디오 입력 인터페이스
export interface VideoInput {
  title: string;
  url: string;
  note: string;
}

// 분석 상태 타입
export type AnalysisStatus = 'welcome' | 'input' | 'loading' | 'completed' | 'failed';

// YouTube 메타데이터 인터페이스
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

// 완료도 통계
export interface CompletionStats {
  completed: number;
  incomplete: number;
  total: number;
  percentage: number;
}

// 분석 결과 인터페이스
export interface AnalysisResult {
  id: string;
  title: string;
  url: string;
  notes: string;
  status: 'completed' | 'failed';
  analysis?: { [category: string]: { [feature: string]: string } };
  completionStats?: CompletionStats;
  scriptLanguage?: string;
  youtubeData?: YouTubeMetadata;
  error?: string;
}

// 정량적 지표
export interface QuantitativeMetrics {
  interestIndex: number;
  retentionIndex: number;
  growthIndex: number;
  finalScore: number;
}

// 정성적 지표
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

// 하이브리드 점수
export interface HybridScore {
  quantitative: QuantitativeMetrics;
  qualitative: QualitativeMetrics;
  final: number;
}

// 분석 진행 상황
export interface AnalysisProgress {
  total: number;
  completed: number;
  current: string;
  stage: 'youtube' | 'gemini' | 'complete';
  videos: AnalysisResult[];
}

// 156개 비디오 특성 항목
export interface VideoFeature {
  no: string;
  category: string;
  item: string;
}

// 분석된 비디오 (전체 정보 포함)
export interface AnalyzedVideo extends AnalysisResult {
  features: { [key: string]: any };
  hybridScore?: HybridScore;
  createdAt: string;
  updatedAt?: string;
}

// 156개 특성 목록 (실제로는 CSV에서 로드)
export const VIDEO_FEATURES: VideoFeature[] = [
  { no: "1", category: "인물 분석", item: "성별 추정" },
  { no: "2", category: "인물 분석", item: "연령 추정" },
  { no: "3", category: "인물 분석", item: "인종 추정" },
  { no: "4", category: "인물 분석", item: "피부톤" },
  { no: "5", category: "인물 분석", item: "얼굴형" },
  // ... 실제로는 156개 모든 항목이 포함되어야 함
  { no: "156", category: "종합 분석", item: "전체 영상 길이" }
];

// Store 상태 인터페이스
export interface VideoStoreState {
  videos: VideoInput[];
  analysisStatus: AnalysisStatus;
  results: (AnalysisResult | { status: 'rejected'; reason: any })[];
  selectedVideo: AnalysisResult | null;
  error: string | null;
  progress: AnalysisProgress | null;
}

// Store 액션 인터페이스
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
