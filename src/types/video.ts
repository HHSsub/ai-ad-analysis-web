// src/types/video.ts - 완전 교체
export interface VideoInput {
  title: string;
  url: string;
  note: string;
}

export type AnalysisStatus = 'welcome' | 'input' | 'loading' | 'completed' | 'failed';

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
  notes: string;
  status: 'completed' | 'failed';
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

// 156개 전체 특성 목록 (완전한 버전)
export const VIDEO_FEATURES: VideoFeature[] = [
  // 인물 분석 (1-20)
  { no: "1", category: "인물 분석", item: "성별 추정" },
  { no: "2", category: "인물 분석", item: "연령 추정" },
  { no: "3", category: "인물 분석", item: "인종 추정" },
  { no: "4", category: "인물 분석", item: "피부톤" },
  { no: "5", category: "인물 분석", item: "얼굴형" },
  { no: "6", category: "인물 분석", item: "헤어스타일" },
  { no: "7", category: "인물 분석", item: "의상 스타일" },
  { no: "8", category: "인물 분석", item: "액세서리" },
  { no: "9", category: "인물 분석", item: "메이크업 스타일" },
  { no: "10", category: "인물 분석", item: "체형" },
  { no: "11", category: "인물 분석", item: "포즈/제스처" },
  { no: "12", category: "인물 분석", item: "시선 방향" },
  { no: "13", category: "인물 분석", item: "인물 수" },
  { no: "14", category: "인물 분석", item: "인물 배치" },
  { no: "15", category: "인물 분석", item: "인물 간 관계" },
  { no: "16", category: "인물 분석", item: "직업/역할 추정" },
  { no: "17", category: "인물 분석", item: "활동 상태" },
  { no: "18", category: "인물 분석", item: "표정 변화" },
  { no: "19", category: "인물 분석", item: "신체 언어" },
  { no: "20", category: "인물 분석", item: "카메라 앵글 대비 인물 위치" },

  // 감정 분석 (21-35)
  { no: "21", category: "감정 분석", item: "주요 감정" },
  { no: "22", category: "감정 분석", item: "감정 강도" },
  { no: "23", category: "감정 분석", item: "감정 변화" },
  { no: "24", category: "감정 분석", item: "얼굴 표정" },
  { no: "25", category: "감정 분석", item: "목소리 톤" },
  { no: "26", category: "감정 분석", item: "분위기" },
  { no: "27", category: "감정 분석", item: "긴장도" },
  { no: "28", category: "감정 분석", item: "에너지 레벨" },
  { no: "29", category: "감정 분석", item: "진정성" },
  { no: "30", category: "감정 분석", item: "유머 요소" },
  { no: "31", category: "감정 분석", item: "감동 요소" },
  { no: "32", category: "감정 분석", item: "놀라움 요소" },
  { no: "33", category: "감정 분석", item: "공포/긴장 요소" },
  { no: "34", category: "감정 분석", item: "로맨스 요소" },
  { no: "35", category: "감정 분석", item: "감정 일관성" },

  // 시각적 요소 (36-60)
  { no: "36", category: "시각적 요소", item: "조명 스타일" },
  { no: "37", category: "시각적 요소", item: "색상 톤" },
  { no: "38", category: "시각적 요소", item: "색상 대비" },
  { no: "39", category: "시각적 요소", item: "배경 설정" },
  { no: "40", category: "시각적 요소", item: "배경 복잡도" },
  { no: "41", category: "시각적 요소", item: "공간감" },
  { no: "42", category: "시각적 요소", item: "구도" },
  { no: "43", category: "시각적 요소", item: "프레이밍" },
  { no: "44", category: "시각적 요소", item: "초점" },
  { no: "45", category: "시각적 요소", item: "블러 효과" },
  { no: "46", category: "시각적 요소", item: "필터 사용" },
  { no: "47", category: "시각적 요소", item: "그래픽 요소" },
  { no: "48", category: "시각적 요소", item: "애니메이션" },
  { no: "49", category: "시각적 요소", item: "특수 효과" },
  { no: "50", category: "시각적 요소", item: "화질" },
  { no: "51", category: "시각적 요소", item: "해상도" },
  { no: "52", category: "시각적 요소", item: "프레임레이트" },
  { no: "53", category: "시각적 요소", item: "종횡비" },
  { no: "54", category: "시각적 요소", item: "시각적 노이즈" },
  { no: "55", category: "시각적 요소", item: "색 보정" },
  { no: "56", category: "시각적 요소", item: "명암비" },
  { no: "57", category: "시각적 요소", item: "채도" },
  { no: "58", category: "시각적 요소", item: "밝기" },
  { no: "59", category: "시각적 요소", item: "비주얼 스타일 일관성" },
  { no: "60", category: "시각적 요소", item: "미학적 완성도" },

  // 오디오 분석 (61-80)
  { no: "61", category: "오디오 분석", item: "배경음악 장르" },
  { no: "62", category: "오디오 분석", item: "배경음악 템포" },
  { no: "63", category: "오디오 분석", item: "배경음악 볼륨" },
  { no: "64", category: "오디오 분석", item: "보이스오버 유무" },
  { no: "65", category: "오디오 분석", item: "내레이션 스타일" },
  { no: "66", category: "오디오 분석", item: "대화 유무" },
  { no: "67", category: "오디오 분석", item: "음성 명료도" },
  { no: "68", category: "오디오 분석", item: "억양/액센트" },
  { no: "69", category: "오디오 분석", item: "말하기 속도" },
  { no: "70", category: "오디오 분석", item: "효과음" },
  { no: "71", category: "오디오 분석", item: "주변 소음" },
  { no: "72", category: "오디오 분석", item: "오디오 품질" },
  { no: "73", category: "오디오 분석", item: "음향 믹싱" },
  { no: "74", category: "오디오 분석", item: "음악-영상 싱크" },
  { no: "75", category: "오디오 분석", item: "침묵 구간" },
  { no: "76", category: "오디오 분석", item: "사운드 레이어링" },
  { no: "77", category: "오디오 분석", item: "오디오 트랜지션" },
  { no: "78", category: "오디오 분석", item: "음향 효과 강도" },
  { no: "79", category: "오디오 분석", item: "오디오 일관성" },
  { no: "80", category: "오디오 분석", item: "음향 설득력" },

  // 브랜드 요소 (81-95)
  { no: "81", category: "브랜드 요소", item: "브랜드명 언급" },
  { no: "82", category: "브랜드 요소", item: "로고 노출" },
  { no: "83", category: "브랜드 요소", item: "로고 위치" },
  { no: "84", category: "브랜드 요소", item: "로고 크기" },
  { no: "85", category: "브랜드 요소", item: "제품 노출" },
  { no: "86", category: "브랜드 요소", item: "제품 사용 시연" },
  { no: "87", category: "브랜드 요소", item: "브랜드 색상 사용" },
  { no: "88", category: "브랜드 요소", item: "슬로건/태그라인" },
  { no: "89", category: "브랜드 요소", item: "브랜드 정체성" },
  { no: "90", category: "브랜드 요소", item: "가격 정보" },
  { no: "91", category: "브랜드 요소", item: "프로모션 정보" },
  { no: "92", category: "브랜드 요소", item: "연락처 정보" },
  { no: "93", category: "브랜드 요소", item: "웹사이트/URL" },
  { no: "94", category: "브랜드 요소", item: "소셜미디어 링크" },
  { no: "95", category: "브랜드 요소", item: "브랜딩 일관성" },

  // 촬영 기법 (96-110)
  { no: "96", category: "촬영 기법", item: "카메라 앵글" },
  { no: "97", category: "촬영 기법", item: "샷 크기" },
  { no: "98", category: "촬영 기법", item: "카메라 무브먼트" },
  { no: "99", category: "촬영 기법", item: "줌 사용" },
  { no: "100", category: "촬영 기법", item: "팬/틸트" },
  { no: "101", category: "촬영 기법", item: "트래킹샷" },
  { no: "102", category: "촬영 기법", item: "핸드헬드" },
  { no: "103", category: "촬영 기법", item: "스테디캠" },
  { no: "104", category: "촬영 기법", item: "드론 촬영" },
  { no: "105", category: "촬영 기법", item: "타임랩스" },
  { no: "106", category: "촬영 기법", item: "슬로우모션" },
  { no: "107", category: "촬영 기법", item: "포커스 전환" },
  { no: "108", category: "촬영 기법", item: "깊이감 표현" },
  { no: "109", category: "촬영 기법", item: "촬영 안정성" },
  { no: "110", category: "촬영 기법", item: "전문성 수준" },

  // 편집 기법 (111-125)
  { no: "111", category: "편집 기법", item: "편집 템포" },
  { no: "112", category: "편집 기법", item: "컷 빈도" },
  { no: "113", category: "편집 기법", item: "트랜지션 유형" },
  { no: "114", category: "편집 기법", item: "몽타주 사용" },
  { no: "115", category: "편집 기법", item: "점프컷" },
  { no: "116", category: "편집 기법", item: "크로스페이드" },
  { no: "117", category: "편집 기법", item: "와이프 효과" },
  { no: "118", category: "편집 기법", item: "화면 분할" },
  { no: "119", category: "편집 기법", item: "인서트 샷" },
  { no: "120", category: "편집 기법", item: "오버레이" },
  { no: "121", category: "편집 기법", item: "색상 전환" },
  { no: "122", category: "편집 기법", item: "리듬감" },
  { no: "123", category: "편집 기법", item: "시각적 연속성" },
  { no: "124", category: "편집 기법", item: "편집 복잡도" },
  { no: "125", category: "편집 기법", item: "편집 완성도" },

  // 텍스트/자막 (126-135)
  { no: "126", category: "텍스트/자막", item: "자막 유무" },
  { no: "127", category: "텍스트/자막", item: "자막 언어" },
  { no: "128", category: "텍스트/자막", item: "자막 스타일" },
  { no: "129", category: "텍스트/자막", item: "자막 위치" },
  { no: "130", category: "텍스트/자막", item: "자막 크기" },
  { no: "131", category: "텍스트/자막", item: "자막 색상" },
  { no: "132", category: "텍스트/자막", item: "텍스트 애니메이션" },
  { no: "133", category: "텍스트/자막", item: "키워드 강조" },
  { no: "134", category: "텍스트/자막", item: "가독성" },
  { no: "135", category: "텍스트/자막", item: "자막 타이밍" },

  // 콘텐츠 구조 (136-145)
  { no: "136", category: "콘텐츠 구조", item: "인트로 길이" },
  { no: "137", category: "콘텐츠 구조", item: "오프닝 훅" },
  { no: "138", category: "콘텐츠 구조", item: "내러티브 구조" },
  { no: "139", category: "콘텐츠 구조", item: "정보 전달 순서" },
  { no: "140", category: "콘텐츠 구조", item: "클라이맥스 위치" },
  { no: "141", category: "콘텐츠 구조", item: "엔딩 스타일" },
  { no: "142", category: "콘텐츠 구조", item: "CTA 위치" },
  { no: "143", category: "콘텐츠 구조", item: "CTA 명확성" },
  { no: "144", category: "콘텐츠 구조", item: "스토리 완결성" },
  { no: "145", category: "콘텐츠 구조", item: "페이싱" },

  // 종합 메타데이터 (146-156)
  { no: "146", category: "종합 메타데이터", item: "영상 길이" },
  { no: "147", category: "종합 메타데이터", item: "업로드 날짜" },
  { no: "148", category: "종합 메타데이터", item: "조회수" },
  { no: "149", category: "종합 메타데이터", item: "좋아요 수" },
  { no: "150", category: "종합 메타데이터", item: "댓글 수" },
  { no: "151", category: "종합 메타데이터", item: "공유 수" },
  { no: "152", category: "종합 메타데이터", item: "타겟 오디언스" },
  { no: "153", category: "종합 메타데이터", item: "산업/카테고리" },
  { no: "154", category: "종합 메타데이터", item: "콘텐츠 유형" },
  { no: "155", category: "종합 메타데이터", item: "제작 품질 등급" },
  { no: "156", category: "종합 메타데이터", item: "전반적 효과성" }
];

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
