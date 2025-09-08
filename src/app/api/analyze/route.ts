// /src/app/api/analyze/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { google } from 'googleapis';
import { getSubtitles } from 'youtube-captions-scraper';
import path from 'path';
import fs from 'fs';

// --- 타입 정의 ---
interface VideoInput {
  title: string;
  url: string;
  notes: string;
}

interface Feature {
  No: string;
  Category: string;
  Feature: string;
  Value: string;
}

// --- 헬퍼 함수: CSV 파싱 (BOM 제거) ---
function getFeaturesFromCSV(): Feature[] {
  const filePath = path.join(process.cwd(), 'src', 'data', 'output_features.csv');
  try {
    let fileContent = fs.readFileSync(filePath, 'utf-8');
    if (fileContent.charCodeAt(0) === 0xFEFF) {
      fileContent = fileContent.slice(1);
    }
    const lines = fileContent.split('\n').slice(1);
    return lines.map(line => {
      const [No, Category, Feature, Value] = line.split(',').map(s => (s || '').trim().replace(/"/g, ''));
      return { No, Category, Feature, Value };
    }).filter(f => f.Category && f.Feature);
  } catch (error) {
    console.error("CSV 파일 읽기 오류:", error);
    throw new Error("서버에서 'output_features.csv' 파일을 읽을 수 없습니다.");
  }
}

// --- 헬퍼 함수: 유튜브 영상 ID 추출 ---
function getYouTubeVideoId(url: string): string | null {
  if (!url) return null;
  const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

// --- "판단 불가" 항목 확인 함수 ---
function hasUndeterminedValues(analysis: any): string[] {
  const undeterminedKeys: string[] = [];
  Object.keys(analysis).forEach(key => {
    if (analysis[key] === "판단 불가" || analysis[key] === "판단불가" || analysis[key] === "분석 필요" || !analysis[key] || analysis[key].trim() === '') {
      undeterminedKeys.push(key);
    }
  });
  return undeterminedKeys;
}

// --- 기본값 생성 함수 ---
function getDefaultValueForFeature(feature: Feature): string {
  // 카테고리별 기본값 설정
  switch (feature.Category?.toLowerCase()) {
    case '인물 분석':
      return 'N/A';
    case '의상 분석':
      return 'N/A';
    case '배경 분석':
      return 'N/A';
    case '오디오 분석':
      return 'N/A';
    case '텍스트 분석':
      return 'N/A';
    case '영상 기술':
      return 'N/A';
    case '성과 지표':
      return '0';
    case '시간 분석':
      return '0';
    default:
      return 'N/A';
  }
}

// --- 재분석 함수 (개선된 버전) ---
async function retryAnalysisForUndetermined(
  video: VideoInput, 
  features: Feature[], 
  youtube: any, 
  model: any, 
  existingAnalysis: any,
  undeterminedKeys: string[]
): Promise<any> {
  const videoId = getYouTubeVideoId(video.url);
  if (!videoId) throw new Error(`'${video.url}'은(는) 잘못된 YouTube URL입니다.`);

  const response = await youtube.videos.list({
    part: ['snippet', 'statistics', 'contentDetails'],
    id: [videoId],
  });

  if (!response.data.items || response.data.items.length === 0) {
    throw new Error(`YouTube API에서 영상 정보를 찾을 수 없습니다 (ID: ${videoId}).`);
  }
  const videoDetails = response.data.items[0];
  const snippet = videoDetails.snippet;
  const statistics = videoDetails.statistics;
  const contentDetails = videoDetails.contentDetails;

  if (!snippet || !statistics || !contentDetails) {
    throw new Error(`YouTube API에서 영상의 전체 정보를 가져오지 못했습니다 (ID: ${videoId}).`);
  }

  let script = '';
  try {
    const subtitles = await getSubtitles({ videoID: videoId, lang: 'ko' });
    script = subtitles.map(sub => sub.text).join(' ');
  } catch (e) {
    try {
      const subtitles = await getSubtitles({ videoID: videoId, lang: 'en' });
      script = subtitles.map(sub => sub.text).join(' ');
    } catch (e2) {
      script = "스크립트를 추출할 수 없습니다.";
    }
  }

  const undeterminedFeatures = features.filter(f => {
    const featureKey = `feature_${f.No}`;
    return undeterminedKeys.includes(featureKey);
  });

  // 재분석에서는 더 간단하고 구체적인 프롬프트 사용
  const featureText = undeterminedFeatures.map(f => `${f.No}. ${f.Category} - ${f.Feature}`).join('\n');
  
  const prompt = `
다음 YouTube 영상을 분석하여 지정된 항목들에 대해 구체적인 값을 제공해주세요.

영상 정보:
- 제목: ${snippet.title}
- 설명: ${snippet.description?.substring(0, 500) || 'N/A'}
- 스크립트: ${script.substring(0, 1000) || 'N/A'}
- 조회수: ${statistics.viewCount || 'N/A'}
- 좋아요: ${statistics.likeCount || 'N/A'}
- 길이: ${contentDetails.duration || 'N/A'}

분석할 항목들:
${featureText}

각 항목에 대해 다음 중 하나로 응답해주세요:
- 구체적인 값 (예: "남성", "20-30대", "검은색" 등)
- 추정값 (예: "추정 25세", "약 5분" 등)
- 불가능한 경우에만 "N/A"

JSON 형식으로만 응답해주세요:
{
  "feature_1": "값",
  "feature_2": "값"
}
  `;

  try {
    const result = await model.generateContent(prompt);
    const resultResponse = await result.response;
    const text = resultResponse.text();
    
    console.log('Gemini 재분석 응답:', text);
    
    // JSON 추출 개선
    let jsonString = text.trim();
    
    // 마크다운 코드 블록 제거
    if (jsonString.startsWith('```json')) {
      jsonString = jsonString.replace(/```json\s*/, '').replace(/\s*```$/, '');
    } else if (jsonString.startsWith('```')) {
      jsonString = jsonString.replace(/```\s*/, '').replace(/\s*```$/, '');
    }
    
    // JSON 객체 추출
    const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      console.warn('JSON 형식을 찾을 수 없음, 기본값 사용');
      const defaultResult: any = {};
      undeterminedFeatures.forEach(feature => {
        defaultResult[`feature_${feature.No}`] = getDefaultValueForFeature(feature);
      });
      return defaultResult;
    }
    
    const retryResult = JSON.parse(jsonMatch[0]);
    return retryResult;
    
  } catch (e: any) {
    console.error('재분석 실패:', e.message);
    // 에러 발생 시 기본값으로 채우기
    const defaultResult: any = {};
    undeterminedFeatures.forEach(feature => {
      defaultResult[`feature_${feature.No}`] = getDefaultValueForFeature(feature);
    });
    return defaultResult;
  }
}

// --- 메인 분석 함수 (개선된 버전) ---
async function analyzeSingleVideo(video: VideoInput, features: Feature[], youtube: any, model: any): Promise<any> {
  const videoId = getYouTubeVideoId(video.url);
  if (!videoId) throw new Error(`'${video.url}'은(는) 잘못된 YouTube URL입니다.`);

  const response = await youtube.videos.list({
    part: ['snippet', 'statistics', 'contentDetails'],
    id: [videoId],
  });

  if (!response.data.items || response.data.items.length === 0) {
    throw new Error(`YouTube API에서 영상 정보를 찾을 수 없습니다 (ID: ${videoId}).`);
  }
  const videoDetails = response.data.items[0];
  const snippet = videoDetails.snippet;
  const statistics = videoDetails.statistics;
  const contentDetails = videoDetails.contentDetails;

  if (!snippet || !statistics || !contentDetails) {
    throw new Error(`YouTube API에서 영상의 전체 정보를 가져오지 못했습니다 (ID: ${videoId}).`);
  }

  let script = '';
  try {
    const subtitles = await getSubtitles({ videoID: videoId, lang: 'ko' });
    script = subtitles.map(sub => sub.text).join(' ');
  } catch (e) {
    try {
      const subtitles = await getSubtitles({ videoID: videoId, lang: 'en' });
      script = subtitles.map(sub => sub.text).join(' ');
    } catch (e2) {
      script = "스크립트를 추출할 수 없습니다.";
    }
  }

  // YouTube 메타데이터를 기반으로 초기값 설정
  const initialFeatures: { [key: string]: string } = {};
  features.forEach(f => {
    let value = "";
    // YouTube 메타데이터를 기반으로 초기값 설정
    switch (f.Feature) {
      case "전체 영상 길이":
        value = contentDetails.duration || '';
        break;
      case "조회수":
        value = statistics.viewCount || '';
        break;
      case "좋아요 수":
        value = statistics.likeCount || '';
        break;
      case "채널명":
        value = snippet.channelTitle || '';
        break;
      case "영상 제목":
        value = snippet.title || '';
        break;
      case "영상 설명":
        value = snippet.description || '';
        break;
      case "게시일":
        value = snippet.publishedAt ? new Date(snippet.publishedAt).toLocaleDateString() : '';
        break;
      case "카테고리":
        value = videoDetails.snippet?.categoryId || ''; 
        break;
    }
    // 빈 값이 아닌 경우에만 초기값으로 설정
    if (value) {
      initialFeatures[`feature_${f.No}`] = value;
    }
  });

  // 분석이 필요한 feature들만 필터링
  const needAnalysisFeatures = features.filter(f => {
    const featureKey = `feature_${f.No}`;
    return !initialFeatures[featureKey];
  });

  console.log(`영상 "${video.title}": ${needAnalysisFeatures.length}개 항목 분석 필요`);

  if (needAnalysisFeatures.length === 0) {
    // 모든 feature가 이미 설정된 경우
    const categorizedAnalysis: { [category: string]: { [feature: string]: string } } = {};
    features.forEach(feature => {
      const featureKey = `feature_${feature.No}`;
      const value = initialFeatures[featureKey] || "N/A";
      
      if (!categorizedAnalysis[feature.Category]) {
        categorizedAnalysis[feature.Category] = {};
      }
      categorizedAnalysis[feature.Category][feature.Feature] = value;
    });

    return { 
      ...video, 
      id: videoId, 
      status: 'completed', 
      analysis: categorizedAnalysis 
    };
  }

  // 분석이 필요한 feature들을 배치로 나누어 처리 (한 번에 너무 많이 요청하지 않도록)
  const batchSize = 30; // 한 번에 30개씩 처리
  const batches = [];
  for (let i = 0; i < needAnalysisFeatures.length; i += batchSize) {
    batches.push(needAnalysisFeatures.slice(i, i + batchSize));
  }

  let allAnalysisResults: any = { ...initialFeatures };

  for (let batchIndex = 0; batchIndex < batches.length; batchIndex++) {
    const batch = batches[batchIndex];
    console.log(`배치 ${batchIndex + 1}/${batches.length} 처리 중 (${batch.length}개 항목)`);

    const featureText = batch.map(f => `${f.No}. ${f.Category} - ${f.Feature}`).join('\n');

    const prompt = `
다음 YouTube 영상을 분석하여 지정된 항목들에 대해 구체적인 값을 제공해주세요.

영상 정보:
- 제목: ${snippet.title}
- 설명: ${snippet.description?.substring(0, 500) || 'N/A'}
- 스크립트: ${script.substring(0, 1500) || 'N/A'}
- 조회수: ${statistics.viewCount || 'N/A'}
- 좋아요: ${statistics.likeCount || 'N/A'}
- 길이: ${contentDetails.duration || 'N/A'}

분석할 항목들:
${featureText}

각 항목에 대해 다음 중 하나로 응답해주세요:
- 구체적인 값 (예: "남성", "20-30대", "검은색", "밝은 톤" 등)
- 추정값 (예: "추정 25세", "약 5분", "실내로 추정" 등)
- 불가능한 경우에만 "N/A"

JSON 형식으로만 응답해주세요:
{
  "feature_1": "값",
  "feature_2": "값"
}
    `;

    try {
      const result = await model.generateContent(prompt);
      const resultResponse = await result.response;
      const text = resultResponse.text();
      
      console.log(`배치 ${batchIndex + 1} Gemini 응답:`, text.substring(0, 200) + '...');
      
      // JSON 추출 개선
      let jsonString = text.trim();
      
      // 마크다운 코드 블록 제거
      if (jsonString.startsWith('```json')) {
        jsonString = jsonString.replace(/```json\s*/, '').replace(/\s*```$/, '');
      } else if (jsonString.startsWith('```')) {
        jsonString = jsonString.replace(/```\s*/, '').replace(/\s*```$/, '');
      }
      
      // JSON 객체 추출
      const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        console.warn(`배치 ${batchIndex + 1}: JSON 형식을 찾을 수 없음, 기본값 사용`);
        batch.forEach(feature => {
          allAnalysisResults[`feature_${feature.No}`] = getDefaultValueForFeature(feature);
        });
        continue;
      }
      
      const batchResult = JSON.parse(jsonMatch[0]);
      allAnalysisResults = { ...allAnalysisResults, ...batchResult };
      
    } catch (e: any) {
      console.error(`배치 ${batchIndex + 1} 분석 실패:`, e.message);
      // 에러 발생 시 기본값으로 채우기
      batch.forEach(feature => {
        allAnalysisResults[`feature_${feature.No}`] = getDefaultValueForFeature(feature);
      });
    }

    // 배치 간 잠시 대기 (API 제한 방지)
    if (batchIndex < batches.length - 1) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  // 재분석 시도 (판단 불가 항목들에 대해)
  let retryCount = 0;
  const maxRetries = 1; // 재시도 횟수 줄임
  
  while (retryCount < maxRetries) {
    const undeterminedKeys = hasUndeterminedValues(allAnalysisResults);
    
    if (undeterminedKeys.length === 0) {
      break;
    }
    
    console.log(`영상 "${video.title}"에서 ${undeterminedKeys.length}개의 미분석 항목 발견. 재시도 ${retryCount + 1}/${maxRetries}`);
    
    try {
      const retryResult = await retryAnalysisForUndetermined(
        video, 
        features, 
        youtube, 
        model, 
        allAnalysisResults, 
        undeterminedKeys
      );
      allAnalysisResults = { ...allAnalysisResults, ...retryResult };
      retryCount++;
    } catch (retryError) {
      console.error(`재시도 ${retryCount + 1} 실패:`, retryError);
      break;
    }
  }

  // 최종 결과 정리
  const categorizedAnalysis: { [category: string]: { [feature: string]: string } } = {};
  
  features.forEach(feature => {
    const featureKey = `feature_${feature.No}`;
    let value = allAnalysisResults[featureKey] || getDefaultValueForFeature(feature);
    
    if (!categorizedAnalysis[feature.Category]) {
      categorizedAnalysis[feature.Category] = {};
    }
    categorizedAnalysis[feature.Category][feature.Feature] = value;
  });

  return { 
    ...video, 
    id: videoId, 
    status: 'completed', 
    analysis: categorizedAnalysis 
  };
}

// --- API 라우트 핸들러 ---
export async function POST(req: NextRequest) {
  const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

  if (!YOUTUBE_API_KEY || !GEMINI_API_KEY) {
    return NextResponse.json({ message: '서버에 API 키가 설정되지 않았습니다.' }, { status: 500 });
  }
  
  try {
    const youtube = google.youtube({
      version: 'v3',
      auth: YOUTUBE_API_KEY
    });
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ 
      model: "gemini-1.5-flash",
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
      ]
    });
    
    const body = await req.json();
    const videos: VideoInput[] = body.videos.filter((v: VideoInput) => v.url && v.url.trim() !== '');

    if (videos.length === 0) return NextResponse.json({ message: '분석할 영상이 없습니다.' }, { status: 400 });

    const features = getFeaturesFromCSV();
    console.log(`총 ${features.length}개의 feature 로드됨`);

    const analysisResults = await Promise.allSettled(
      videos.map(async (video, index) => {
        console.log(`[Progress] Analyzing video ${index + 1} of ${videos.length}: ${video.title}`);
        return analyzeSingleVideo(video, features, youtube, model);
      })
    );

    const finalResults = analysisResults.map((result, index) => {
      if (result.status === 'fulfilled') return { status: 'fulfilled', value: result.value };
      return { 
        status: 'rejected', 
        reason: { 
          ...videos[index], 
          id: getYouTubeVideoId(videos[index].url) || videos[index].url, 
          status: 'failed', 
          error: result.reason.message 
        } 
      };
    });

    return NextResponse.json({ results: finalResults });

  } catch (error: any) {
    console.error("API Route Error:", error);
    const errorMessage = error instanceof Error ? error.message : '서버 내부 오류가 발생했습니다.';
    return NextResponse.json({ message: errorMessage }, { status: 500 });
  }
}
