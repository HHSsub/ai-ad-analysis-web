import { QuantitativeMetrics, QualitativeMetrics, HybridScore, AnalyzedVideo } from '@/types/video';

// ----------------------------------------------------------------------------------
// [오류 수정] './youtubeService'에 대한 의존성을 제거하기 위해 parseDuration 함수를 이 파일에 직접 추가합니다.
// ----------------------------------------------------------------------------------
// import { parseDuration } from './youtubeService'; // 오류의 원인이 되는 이 줄을 삭제합니다.

/**
 * ISO 8601 형식의 영상 길이(예: "PT1M30S")를 초 단위 숫자로 변환합니다.
 * @param duration ISO 8601 형식의 문자열
 * @returns 총 영상 길이 (초)
 */
function parseDuration(duration: string): number {
  if (!duration) return 0;
  const matches = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
  if (!matches) return 0;

  matches.shift(); // 전체 일치 항목 제거

  const [hours, minutes, seconds] = matches.map(val => {
    if (val) {
      return parseInt(val.slice(0, -1), 10);
    }
    return 0;
  });

  return (hours || 0) * 3600 + (minutes || 0) * 60 + (seconds || 0);
}
// ----------------------------------------------------------------------------------


// 정량 지표 계산
export function calculateQuantitativeMetrics(video: AnalyzedVideo): QuantitativeMetrics {
  const youtubeData = video.youtubeData;
  if (!youtubeData) {
    return {
      interestIndex: 0,
      retentionIndex: 0,
      growthIndex: 0,
      finalScore: 0
    };
  }

  // 관심도 지수 = (좋아요 비율 × 0.5) + (댓글 비율 × 0.3) + (하루 평균 조회수 / 채널 구독자 수 × 0.2)
  const likeRatio = youtubeData.viewCount > 0 ? youtubeData.likeCount / youtubeData.viewCount : 0;
  const commentRatio = youtubeData.viewCount > 0 ? youtubeData.commentCount / youtubeData.viewCount : 0;
  
  // 채널 구독자 수는 API에서 제공되지 않으므로 임시로 조회수의 1/10로 가정
  const estimatedSubscribers = youtubeData.viewCount / 10;
  const dailyViewRatio = estimatedSubscribers > 0 ? (youtubeData.viewCount / getDaysSincePublish(youtubeData.publishedAt)) / estimatedSubscribers : 0;
  
  const interestIndex = (likeRatio * 0.5) + (commentRatio * 0.3) + (dailyViewRatio * 0.2);

  // 유지력 지수 = (좋아요 비율 + 댓글 비율) × f(영상 길이)
  const duration = parseDuration(youtubeData.duration);
  let durationFactor = 1.0;
  if (duration <= 15) durationFactor = 1.0;
  else if (duration <= 60) durationFactor = 0.8;
  else durationFactor = 0.6;
  
  const retentionIndex = (likeRatio + commentRatio) * durationFactor;

  // 성장 지수 = 하루 평균 조회수 / 업로드 후 경과일^0.5
  const daysSincePublish = getDaysSincePublish(youtubeData.publishedAt);
  const dailyViews = daysSincePublish > 0 ? youtubeData.viewCount / daysSincePublish : 0;
  const growthIndex = dailyViews > 0 ? dailyViews / Math.pow(daysSincePublish, 0.5) : 0;

  // 최종 베스트 레퍼런스 점수 = (관심도 지수 × 0.4) + (유지력 지수 × 0.3) + (성장 지수 × 0.3)
  const finalScore = (interestIndex * 0.4) + (retentionIndex * 0.3) + (growthIndex * 0.3);

  return {
    interestIndex: Math.min(interestIndex * 100, 100), // 0-100 스케일로 정규화
    retentionIndex: Math.min(retentionIndex * 100, 100),
    growthIndex: Math.min(growthIndex / 1000, 100), // 적절히 스케일링
    finalScore: Math.min(finalScore * 100, 100)
  };
}

// 정성 지표 계산
export function calculateQualitativeMetrics(video: AnalyzedVideo): QualitativeMetrics {
  const features = video.features;
  
  // 오프닝 훅 지수 (OH) - 0~3초 내 프레임 변화량, 피사체 클로즈업, 자막 가독성 등
  const openingHookIndex = calculateOpeningHookScore(features);
  
  // 브랜드 전달 지수 (BD) - 브랜드명/로고 노출 시점 및 맥락
  const brandDeliveryIndex = calculateBrandDeliveryScore(features);
  
  // 스토리 구조 지수 (ST) - 기승전결 구조의 완성도
  const storyStructureIndex = calculateStoryStructureScore(features);
  
  // 시각적 완성도 (VA) - 영상의 미학적 품질
  const visualAestheticsIndex = calculateVisualAestheticsScore(features);
  
  // 음향 설득력 지수 (AU) - BGM, 보이스오버의 품질
  const audioPersuasionIndex = calculateAudioPersuasionScore(features);
  
  // 차별성/독창성 지수 (DX) - 동일 업종 대비 독창성
  const uniquenessIndex = calculateUniquenessScore(features);
  
  // 메시지-타겟 적합도 (MT) - 메시지와 타겟 페르소나 매칭
  const messageTargetFitIndex = calculateMessageTargetFitScore(features);
  
  // CTA 효율성 지수 (CT) - CTA의 명확성, 위치, 강도
  const ctaEfficiencyIndex = calculateCTAEfficiencyScore(features);
  
  // 최종 정성 스코어 계산
  const qualityScore = 
    (openingHookIndex * 0.18) +
    (brandDeliveryIndex * 0.16) +
    (storyStructureIndex * 0.16) +
    (visualAestheticsIndex * 0.16) +
    (audioPersuasionIndex * 0.12) +
    (uniquenessIndex * 0.12) +
    (messageTargetFitIndex * 0.06) +
    (ctaEfficiencyIndex * 0.04);

  return {
    openingHookIndex,
    brandDeliveryIndex,
    storyStructureIndex,
    visualAestheticsIndex,
    audioPersuasionIndex,
    uniquenessIndex,
    messageTargetFitIndex,
    ctaEfficiencyIndex,
    qualityScore
  };
}

// 하이브리드 점수 계산
export function calculateHybridScore(video: AnalyzedVideo): HybridScore {
  const quantitative = calculateQuantitativeMetrics(video);
  const qualitative = calculateQualitativeMetrics(video);
  
  // 정량(40%) + 정성(60%) 결합
  const final = (quantitative.finalScore * 0.4) + (qualitative.qualityScore * 0.6);
  
  return {
    quantitative,
    qualitative,
    final
  };
}

// 헬퍼 함수들
function getDaysSincePublish(publishedAt: string): number {
  if (!publishedAt) return 1;
  const publishDate = new Date(publishedAt);
  const now = new Date();
  const diffTime = Math.abs(now.getTime() - publishDate.getTime());
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  return Math.max(diffDays, 1); // 최소 1일
}

function calculateOpeningHookScore(features: any): number {
  if (!features) return 0;
  // 오프닝 관련 feature들을 기반으로 점수 계산
  const hasStrongOpening = features.feature_94 !== 'N/A'; // 오프닝 클립/로고 시작 타이밍
  const hasGoodVisuals = features.feature_96 !== 'N/A'; // 클로즈업/롱샷 비율
  const hasTextEffects = features.feature_118 === '있음'; // 키네틱 타이포 여부
  
  let score = 30; // 기본 점수
  if (hasStrongOpening) score += 25;
  if (hasGoodVisuals) score += 25;
  if (hasTextEffects) score += 20;
  
  return Math.min(score, 100);
}

function calculateBrandDeliveryScore(features: any): number {
  if (!features) return 0;
  const hasBrandLogo = features.feature_63 !== '없음'; // 브랜드명/로고 노출
  const hasConsistentBranding = features.feature_86 !== 'N/A'; // 브랜드 톤 일치
  const hasBrandProps = features.feature_66 !== '없음'; // 브랜드 소품 존재
  
  let score = 20;
  if (hasBrandLogo) score += 40;
  if (hasConsistentBranding) score += 25;
  if (hasBrandProps) score += 15;
  
  return Math.min(score, 100);
}

function calculateStoryStructureScore(features: any): number {
  if (!features) return 0;
  const hasStoryStructure = features.feature_124 !== '없음'; // 스토리 구조 존재 여부
  const hasIntroClimax = features.feature_123 !== '없음'; // 인트로/클라이맥스/결말 구성
  const hasGoodPacing = features.feature_135 !== 'N/A'; // 장면 전환 속도
  
  let score = 20;
  if (hasStoryStructure) score += 40;
  if (hasIntroClimax) score += 30;
  if (hasGoodPacing) score += 10;
  
  return Math.min(score, 100);
}

function calculateVisualAestheticsScore(features: any): number {
  if (!features) return 0;
  const hasGoodLighting = features.feature_87 !== 'N/A'; // 광원 위치, 역광, 그림자 활용
  const hasColorCorrection = features.feature_84 !== 'N/A'; // 필터 사용 및 색보정 톤
  const hasVisualConsistency = features.feature_97 !== '없음'; // 시각적 일관성
  
  let score = 25;
  if (hasGoodLighting) score += 25;
  if (hasColorCorrection) score += 25;
  if (hasVisualConsistency) score += 25;
  
  return Math.min(score, 100);
}

function calculateAudioPersuasionScore(features: any): number {
  if (!features) return 0;
  const hasBGM = features.feature_100 !== '없음'; // BGM 유무
  const hasGoodAudioSync = features.feature_104 !== '있음'; // 사운드 시점 연동 및 싱크 오류 여부
  const hasVoiceover = features.feature_103 !== '없음'; // 발화 유무
  
  let score = 20;
  if (hasBGM) score += 30;
  if (hasGoodAudioSync) score += 25;
  if (hasVoiceover) score += 25;
  
  return Math.min(score, 100);
}

function calculateUniquenessScore(features: any): number {
  if (!features) return 0;
  const hasEffects = features.feature_95 !== '없음'; // 이펙트 사용
  const hasUniqueStyle = features.feature_99 !== '없음'; // 서브컬처 스타일 요소
  const hasTrendyEditing = features.f_89 !== '없음'; // 시네마틱/틱톡식 편집 여부
  
  let score = 30;
  if (hasEffects) score += 25;
  if (hasUniqueStyle) score += 25;
  if (hasTrendyEditing) score += 20;
  
  return Math.min(score, 100);
}

function calculateMessageTargetFitScore(features: any): number {
  if (!features) return 0;
  const targetAudience = features.feature_154; // 핵심 타겟
  const industry = features.feature_153; // 산업
  const purpose = features.feature_155; // 영상 목적
  
  let score = 40;
  if (targetAudience && targetAudience !== 'N/A') score += 20;
  if (industry && industry !== 'N/A') score += 20;
  if (purpose && purpose !== 'N/A') score += 20;
  
  return Math.min(score, 100);
}

function calculateCTAEfficiencyScore(features: any): number {
  if (!features) return 0;
  const hasCTA = features.feature_116 !== '없음'; // CTA 문구
  const hasLinks = features.feature_122 !== '없음'; // 해시태그/링크 정보 노출
  const hasCallToAction = features.feature_149 !== '없음'; // 설명란 링크(CTA) 분석
  
  let score = 25;
  if (hasCTA) score += 35;
  if (hasLinks) score += 20;
  if (hasCallToAction) score += 20;
  
  return Math.min(score, 100);
}
