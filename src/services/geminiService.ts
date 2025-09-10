import { GoogleGenerativeAI } from '@google/generative-ai';
import { VIDEO_FEATURES } from '@/types/video';

// ✅ 환경변수 
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// Gemini를 사용하여 영상 분석
export async function analyzeVideoWithGemini(videoUrl: string, existingFeatures: any = {}) {
  try {
    // ✅ 모델 이름 수정: gemini-pro → gemini-2.5-flash
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

    // 분석이 필요한 feature들 찾기
    const missingFeatures = VIDEO_FEATURES.filter(feature => {
      const key = `feature_${feature.no}`;
      return !existingFeatures[key] || existingFeatures[key] === null || existingFeatures[key] === '';
    });

    if (missingFeatures.length === 0) {
      return existingFeatures;
    }

    // ✅ 현실적인 프롬프트로 수정 (Gemini는 YouTube URL을 직접 분석할 수 없음)
    const prompt = `
다음은 YouTube 영상 분석을 위한 항목들입니다.
영상 URL: ${videoUrl}

아래 항목들에 대해 일반적인 YouTube 영상 분석 기준으로 합리적인 기본값이나 분석 가이드를 JSON 형태로 제공해주세요:

분석할 항목들:
${missingFeatures.map(f => `${f.no}. ${f.category} - ${f.item}`).join('\n')}

각 항목에 대해:
- 해당 카테고리의 일반적인 특성을 고려한 적절한 기본값
- 영상 분석 시 고려해야 할 요소들
- 불분명한 경우 "N/A" 또는 중립적 기본값 사용

응답 형식 (JSON만):
{
  "feature_1": "분석 결과 또는 기본값",
  "feature_2": "분석 결과 또는 기본값"
}
`;

    // ✅ Python 스타일과 동일한 방식으로 수정
    const result = await model.generateContent(prompt);
    const response = result.response;
    const text = response.text();

    // JSON 파싱 시도
    let analyzedFeatures = {};
    try {
      analyzedFeatures = JSON.parse(text);
    } catch (parseError) {
      console.warn('Gemini response parsing failed, using default values');
      analyzedFeatures = {};
      missingFeatures.forEach(feature => {
        analyzedFeatures[`feature_${feature.no}`] = getDefaultValueForFeature(feature);
      });
    }

    return { ...existingFeatures, ...analyzedFeatures };

  } catch (error) {
    console.error('Gemini API Error:', error);

    // 에러 발생 시 기본값으로 채우기
    const defaultFeatures = { ...existingFeatures };
    VIDEO_FEATURES.forEach(feature => {
      const key = `feature_${feature.no}`;
      if (!defaultFeatures[key]) {
        defaultFeatures[key] = getDefaultValueForFeature(feature);
      }
    });

    return defaultFeatures;
  }
}

// 기본값 생성 함수 (없다면 추가 필요)
function getDefaultValueForFeature(feature) {
  // 카테고리별 기본값 설정
  switch (feature.category?.toLowerCase()) {
    case 'content':
      return 'N/A';
    case 'engagement':
      return '0';
    case 'quality':
      return 'medium';
    case 'duration':
      return '0';
    default:
      return 'N/A';
  }
}