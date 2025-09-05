import { GoogleGenerativeAI } from '@google/generative-ai';
import { VIDEO_FEATURES } from '@/types/video';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// Gemini를 사용하여 영상 분석
export async function analyzeVideoWithGemini(videoUrl: string, existingFeatures: any = {}) {
  try {
    // ✅ 모델 이름 교체
    const model = genAI.getGenerativeModel({ model: "gemini-2.5-pro" });

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
      console.warn('Gemini response parsing failed, using default values');
      analyzedFeatures = {};
      missingFeatures.forEach(feature => {
        analyzedFeatures[`feature_${feature.no}`] = getDefaultValueForFeature(feature);
      });
    }

    return { ...existingFeatures, ...analyzedFeatures };

  } catch (error) {
    console.error('Gemini API Error:', error);

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
