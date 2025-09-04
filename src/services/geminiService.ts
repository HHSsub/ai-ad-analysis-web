import { GoogleGenerativeAI } from '@google/generative-ai';
import { VIDEO_FEATURES } from '@/types/video';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// Gemini를 사용하여 영상 분석
export async function analyzeVideoWithGemini(videoUrl: string, existingFeatures: any = {}) {
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-pro-vision" });

    // 분석이 필요한 feature들 찾기
    const missingFeatures = VIDEO_FEATURES.filter(feature => {
      const key = `feature_${feature.no}`;
      return !existingFeatures[key] || existingFeatures[key] === null || existingFeatures[key] === '';
    });

    if (missingFeatures.length === 0) {
      return existingFeatures;
    }

    // Gemini에게 보낼 프롬프트 생성
    const prompt = `
다음 YouTube 영상을 분석하여 아래 항목들에 대한 정보를 JSON 형태로 제공해주세요.
영상 URL: ${videoUrl}

분석할 항목들:
${missingFeatures.map(f => `${f.no}. ${f.category} - ${f.item}`).join('\n')}

각 항목에 대해 구체적이고 객관적인 분석을 제공해주세요. 
값이 불분명하거나 해당 없는 경우 "N/A" 또는 적절한 기본값을 사용해주세요.

응답 형식:
{
  "feature_1": "분석 결과",
  "feature_2": "분석 결과",
  ...
}
`;

    const result = await model.generateContent(prompt);
    const response = await result.response;
    const text = response.text();

    // JSON 파싱 시도
    let analyzedFeatures = {};
    try {
      analyzedFeatures = JSON.parse(text);
    } catch (parseError) {
      // JSON 파싱 실패시 기본값으로 채우기
      console.warn('Gemini response parsing failed, using default values');
      analyzedFeatures = {};
      missingFeatures.forEach(feature => {
        analyzedFeatures[`feature_${feature.no}`] = getDefaultValueForFeature(feature);
      });
    }

    // 기존 features와 새로 분석된 features 병합
    return { ...existingFeatures, ...analyzedFeatures };

  } catch (error) {
    console.error('Gemini API Error:', error);
    
    // 에러 발생시 기본값으로 채우기
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

// feature별 기본값 생성
function getDefaultValueForFeature(feature: any): string {
  const category = feature.category;
  const item = feature.item;

  // 카테고리별 기본값 설정
  switch (category) {
    case '인물 분석':
      if (item.includes('유무') || item.includes('여부')) return '없음';
      if (item.includes('수')) return '1';
      if (item.includes('색상')) return '불명';
      return 'N/A';
      
    case '의상 분석':
      if (item.includes('유무') || item.includes('여부')) return '없음';
      if (item.includes('색상')) return '불명';
      return 'N/A';
      
    case '배경 분석':
      if (item === '실내/실외') return '실내';
      if (item.includes('유무') || item.includes('여부')) return '없음';
      if (item.includes('색상')) return '흰색';
      return 'N/A';
      
    case '제품 분석':
      if (item.includes('유무') || item.includes('여부')) return '없음';
      if (item.includes('수')) return '0';
      return 'N/A';
      
    case '연출/편집 분석':
      if (item.includes('여부')) return '없음';
      if (item.includes('비율')) return '50%';
      return 'N/A';
      
    case '사운드 분석':
      if (item.includes('유무') || item.includes('여부')) return '있음';
      return 'N/A';
      
    case '텍스트/자막 분석':
      if (item.includes('유무') || item.includes('여부')) return '없음';
      return 'N/A';
      
    case '스토리 구조 분석':
      if (item.includes('유무') || item.includes('여부')) return '있음';
      if (item.includes('수')) return '1';
      return 'N/A';
      
    case '유튜브 성과 분석':
      if (item.includes('유무') || item.includes('여부')) return '없음';
      return 'N/A';
      
    case '종합 분석':
      if (item === '산업') return '일반';
      if (item === '핵심 타겟 (Core Target Audience)') return '일반 대중';
      if (item === '영상 목적 (브랜딩 or 판매 전환)') return '브랜딩';
      return 'N/A';
      
    default:
      return 'N/A';
  }
}