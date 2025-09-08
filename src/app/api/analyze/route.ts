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

// --- 헬퍼 함수: CSV 파싱 (개선된 버전) ---
function getFeaturesFromCSV(): Feature[] {
  const filePath = path.join(process.cwd(), 'src', 'data', 'output_features.csv');
  try {
    let fileContent = fs.readFileSync(filePath, 'utf-8');
    
    // BOM 제거
    if (fileContent.charCodeAt(0) === 0xFEFF) {
      fileContent = fileContent.slice(1);
    }
    
    const lines = fileContent.split('\n').filter(line => line.trim());
    
    // 헤더 스킵하고 데이터 파싱
    const features = lines.slice(1).map(line => {
      // CSV 파싱 개선: 따옴표 안의 쉼표 처리
      const columns = [];
      let current = '';
      let inQuotes = false;
      
      for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
          inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
          columns.push(current.trim());
          current = '';
        } else {
          current += char;
        }
      }
      columns.push(current.trim());
      
      const [No, Category, Feature, Value] = columns.map(s => s.replace(/"/g, '').trim());
      return { No, Category, Feature, Value };
    }).filter(f => f.No && f.Category && f.Feature && f.No !== '');
    
    console.log(`CSV에서 ${features.length}개 feature 로드됨`);
    return features;
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

// --- 개선된 프롬프트 생성 함수 ---
function createAnalysisPrompt(videoData: any, features: Feature[], script: string) {
  const { snippet, statistics, contentDetails } = videoData;
  
  // Feature를 카테고리별로 그룹화
  const categorizedFeatures = features.reduce((acc, feature) => {
    if (!acc[feature.Category]) {
      acc[feature.Category] = [];
    }
    acc[feature.Category].push(`${feature.No}. ${feature.Feature}`);
    return acc;
  }, {} as Record<string, string[]>);

  const featuresText = Object.entries(categorizedFeatures)
    .map(([category, items]) => `${category}:\n${items.join('\n')}`)
    .join('\n\n');

  return `
다음 YouTube 광고 영상을 156가지 세부 특징으로 분석해주세요.

=== 영상 정보 ===
제목: ${snippet.title}
설명: ${snippet.description?.substring(0, 800) || 'N/A'}
조회수: ${statistics.viewCount || 'N/A'}
좋아요: ${statistics.likeCount || 'N/A'}
댓글수: ${statistics.commentCount || 'N/A'}
길이: ${contentDetails.duration || 'N/A'}
게시일: ${snippet.publishedAt || 'N/A'}
채널: ${snippet.channelTitle || 'N/A'}

=== 스크립트/자막 ===
${script.substring(0, 2000) || '스크립트 없음'}

=== 분석할 특징들 ===
${featuresText}

=== 분석 지침 ===
1. 각 특징에 대해 구체적이고 정확한 값을 제공하세요
2. "N/A", "판단불가", "분석불가" 등은 정말 불가능한 경우에만 사용하세요
3. 추정이나 예측이 가능한 경우 "추정 [값]" 형태로 답변하세요
4. 색상, 수량, 감정 등은 구체적으로 명시하세요
5. 존재 여부는 "있음/없음" 또는 "예/아니오"로 답변하세요

다음 JSON 형식으로만 응답하세요:
{
  "feature_1": "분석된 값",
  "feature_2": "분석된 값",
  ...
  "feature_156": "분석된 값"
}

각 feature_숫자는 위 특징 목록의 번호와 정확히 일치해야 합니다.
`;
}

// --- JSON 응답 파싱 개선 함수 ---
function parseGeminiResponse(text: string): any {
  console.log('Gemini 원본 응답:', text.substring(0, 500) + '...');
  
  let jsonString = text.trim();
  
  // 마크다운 코드 블록 제거
  jsonString = jsonString.replace(/```json\s*|\s*```/g, '');
  jsonString = jsonString.replace(/```\s*|\s*```/g, '');
  
  // JSON 객체 찾기
  const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('JSON 형식을 찾을 수 없습니다');
  }
  
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    console.log('파싱된 feature 개수:', Object.keys(parsed).length);
    return parsed;
  } catch (e) {
    console.error('JSON 파싱 실패:', e);
    throw new Error('JSON 파싱에 실패했습니다');
  }
}

// --- 기본값 채우기 함수 ---
function fillDefaultValues(analysis: any, features: Feature[], videoData: any): any {
  const { snippet, statistics, contentDetails } = videoData;
  const result = { ...analysis };
  
  features.forEach(feature => {
    const featureKey = `feature_${feature.No}`;
    
    // 이미 값이 있으면 스킵
    if (result[featureKey] && result[featureKey] !== 'N/A') {
      return;
    }
    
    // YouTube 메타데이터에서 직접 추출 가능한 것들
    switch (feature.Feature) {
      case '전체 영상 길이':
        result[featureKey] = contentDetails.duration || 'N/A';
        break;
      case '조회수':
        result[featureKey] = statistics.viewCount || '0';
        break;
      case '좋아요 수':
        result[featureKey] = statistics.likeCount || '0';
        break;
      case '채널명':
        result[featureKey] = snippet.channelTitle || 'N/A';
        break;
      case '영상 제목':
        result[featureKey] = snippet.title || 'N/A';
        break;
      case '영상 설명':
        result[featureKey] = snippet.description ? '있음' : '없음';
        break;
      case '게시일':
        result[featureKey] = snippet.publishedAt ? new Date(snippet.publishedAt).toLocaleDateString() : 'N/A';
        break;
      default:
        // 카테고리별 기본값
        if (!result[featureKey] || result[featureKey] === 'N/A') {
          result[featureKey] = getDefaultForCategory(feature.Category);
        }
        break;
    }
  });
  
  return result;
}

function getDefaultForCategory(category: string): string {
  const defaults: Record<string, string> = {
    '인물 분석': '미확인',
    '의상 분석': '미확인',
    '배경 분석': '미확인',
    '제품 분석': '없음',
    '연출/편집 분석': '일반',
    '사운드 분석': '있음',
    '텍스트/자막 분석': '없음',
    '스토리 구조 분석': '일반',
    '유튜브 성과 분석': '미분석',
    '종합 분석': '미분류'
  };
  return defaults[category] || 'N/A';
}

// --- 메인 분석 함수 ---
async function analyzeSingleVideo(video: VideoInput, features: Feature[], youtube: any, model: any): Promise<any> {
  const videoId = getYouTubeVideoId(video.url);
  if (!videoId) throw new Error(`'${video.url}'은(는) 잘못된 YouTube URL입니다.`);

  console.log(`영상 분석 시작: ${video.title} (ID: ${videoId})`);

  const response = await youtube.videos.list({
    part: ['snippet', 'statistics', 'contentDetails'],
    id: [videoId],
  });

  if (!response.data.items || response.data.items.length === 0) {
    throw new Error(`YouTube API에서 영상 정보를 찾을 수 없습니다 (ID: ${videoId}).`);
  }

  const videoData = response.data.items[0];
  const snippet = videoData.snippet;
  const statistics = videoData.statistics;
  const contentDetails = videoData.contentDetails;

  // 자막 추출
  let script = '';
  try {
    const subtitles = await getSubtitles({ videoID: videoId, lang: 'ko' });
    script = subtitles.map(sub => sub.text).join(' ');
    console.log('한국어 자막 추출 성공');
  } catch (e) {
    try {
      const subtitles = await getSubtitles({ videoID: videoId, lang: 'en' });
      script = subtitles.map(sub => sub.text).join(' ');
      console.log('영어 자막 추출 성공');
    } catch (e2) {
      script = "자막을 추출할 수 없습니다.";
      console.log('자막 추출 실패');
    }
  }

  // Gemini 분석 요청
  const prompt = createAnalysisPrompt(videoData, features, script);
  console.log('Gemini 분석 요청 중...');

  try {
    const result = await model.generateContent(prompt);
    const resultResponse = await result.response;
    const text = resultResponse.text();
    
    const analysisResult = parseGeminiResponse(text);
    const finalResult = fillDefaultValues(analysisResult, features, videoData);
    
    // 결과를 카테고리별로 정리
    const categorizedAnalysis: { [category: string]: { [feature: string]: string } } = {};
    features.forEach(feature => {
      const featureKey = `feature_${feature.No}`;
      const value = finalResult[featureKey] || 'N/A';
      
      if (!categorizedAnalysis[feature.Category]) {
        categorizedAnalysis[feature.Category] = {};
      }
      categorizedAnalysis[feature.Category][feature.Feature] = value;
    });

    console.log(`영상 분석 완료: ${video.title}`);
    return { 
      ...video, 
      id: videoId, 
      status: 'completed', 
      analysis: categorizedAnalysis 
    };

  } catch (e: any) {
    console.error('Gemini 분석 실패:', e.message);
    
    // 실패 시 기본값으로만 채우기
    const defaultAnalysis = fillDefaultValues({}, features, videoData);
    const categorizedAnalysis: { [category: string]: { [feature: string]: string } } = {};
    
    features.forEach(feature => {
      const featureKey = `feature_${feature.No}`;
      const value = defaultAnalysis[featureKey] || 'N/A';
      
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

    if (videos.length === 0) {
      return NextResponse.json({ message: '분석할 영상이 없습니다.' }, { status: 400 });
    }

    const features = getFeaturesFromCSV();
    console.log(`총 ${features.length}개의 feature 로드됨`);

    // 순차적으로 분석 (동시성 문제 방지)
    const results = [];
    for (let i = 0; i < videos.length; i++) {
      const video = videos[i];
      console.log(`[${i + 1}/${videos.length}] 분석 중: ${video.title}`);
      
      try {
        const result = await analyzeSingleVideo(video, features, youtube, model);
        results.push({ status: 'fulfilled', value: result });
      } catch (error: any) {
        console.error(`영상 분석 실패: ${video.title}`, error.message);
        results.push({ 
          status: 'rejected', 
          reason: { 
            ...video, 
            id: getYouTubeVideoId(video.url) || video.url, 
            status: 'failed', 
            error: error.message 
          } 
        });
      }
      
      // API 호출 간 잠시 대기 (rate limit 방지)
      if (i < videos.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }

    console.log(`전체 분석 완료. 성공: ${results.filter(r => r.status === 'fulfilled').length}, 실패: ${results.filter(r => r.status === 'rejected').length}`);
    
    return NextResponse.json({ results });

  } catch (error: any) {
    console.error("API Route Error:", error);
    const errorMessage = error instanceof Error ? error.message : '서버 내부 오류가 발생했습니다.';
    return NextResponse.json({ message: errorMessage }, { status: 500 });
  }
}