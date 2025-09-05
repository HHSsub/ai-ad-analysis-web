// /src/app/api/analyze/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
// [수정됨] 공식 'googleapis' 라이브러리로 교체
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
    if (analysis[key] === "판단 불가" || analysis[key] === "판단불가") {
      undeterminedKeys.push(key);
    }
  });
  return undeterminedKeys;
}

// --- 재분석 함수 ---
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

  // YouTube API 호출
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

  // "판단 불가" 항목만 필터링
  const undeterminedFeatures = features.filter(f => {
    const featureKey = `feature_${f.No}`;
    return undeterminedKeys.includes(featureKey);
  });

  const featureText = undeterminedFeatures.map(f => `- ${f.Category} | ${f.Feature}: (이전 분석에서 "판단 불가"였던 항목)`).join('\n');
  
  const prompt = `
    You are a world-class advertising data analyst and Video Diagnostician. You are performing a RETRY ANALYSIS for specific features that were previously marked as "판단 불가" (undetermined).

    [RETRY ANALYSIS MISSION]
    Focus ONLY on the features listed below that were previously undetermined. Use all available information more creatively and make educated inferences where possible. Avoid "판단 불가" unless absolutely impossible to determine.

    [Core Performance Principles]
    Objectivity: Base answers on quantifiable or clearly observed facts. Make reasonable inferences from available data.
    Creativity: Use title, description, and script context to make educated guesses about visual and audio elements.
    Completeness: Try to provide specific values rather than "판단 불가" whenever possible.

    **Video Information:**
    - Title: ${snippet.title}
    - Description: ${snippet.description}
    - Script: """${script}"""
    - Views: ${statistics.viewCount || 'N/A'}
    - Likes: ${statistics.likeCount || 'N/A'}
    - Duration: ${contentDetails.duration || 'N/A'}

    **Features to Re-analyze (Previously "판단 불가"):**
    ${featureText}

    **Critical Instructions for Retry:**
    1. Use creative inference from title/description/script to estimate visual elements
    2. Make educated guesses based on video context and genre
    3. Provide specific, concrete values whenever possible
    4. Only use "판단 불가" if truly impossible to infer
    5. Consider typical patterns for this type of content

    **Output Format:**
    응답 형식 (JSON만):
    {
      "feature_1": "재분석 결과",
      "feature_2": "재분석 결과"
    }
    You MUST provide the retry analysis result ONLY in the following JSON format. Each feature's value must be a string. Try to avoid "판단 불가" in this retry attempt.
  `;

  const result = await model.generateContent(prompt);
  const resultResponse = await result.response;
  const text = resultResponse.text();
  
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error(`Gemini 재분석 응답에서 JSON 형식을 찾을 수 없습니다. 응답: ${text}`);
    const jsonString = jsonMatch[0];
    const retryResult = JSON.parse(jsonString);
    
    // 기존 분석 결과와 재분석 결과 병합
    const updatedAnalysis = { ...existingAnalysis, ...retryResult };
    return updatedAnalysis;
  } catch (e: any) {
    throw new Error(`Gemini 재분석 결과 처리 실패: ${e.message}.`);
  }
}

// --- 메인 분석 함수 ---
async function analyzeSingleVideo(video: VideoInput, features: Feature[], youtube: any, model: any): Promise<any> {
  const videoId = getYouTubeVideoId(video.url);
  if (!videoId) throw new Error(`'${video.url}'은(는) 잘못된 YouTube URL입니다.`);

  // [수정됨] 'googleapis'를 사용한 올바른 API 호출 방식
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

  const featureText = features.map(f => `- ${f.Category} | ${f.Feature}: ${f.Value || '분석 필요'}`).join('\n');
  const prompt = `
    You are a world-class advertising data analyst and Video Diagnostician. Your sole mission is to dissect the input advertising video (YouTube URL) frame by frame, and synthesize audio, text, structure, and performance data to convert it into highly detailed and objective data according to the given 156 analysis items.

    [Core Performance Principles]
    Objectivity: Subjective impressions or evaluations are absolutely forbidden. All answers must be based on quantifiable or clearly observed facts. Instead of expressions like "beautiful" or "sad", describe specifically such as "warm tone colors used" or "slow tempo piano background music used".

    Accuracy: All items must be analyzed without omission. If information is insufficient or judgment is impossible, specify "판단 불가" for that value.

    Structure Compliance: The output must be in the specified JSON format. Do not add any conversation or explanation outside the JSON structure.

    Based on the provided YouTube video information and script, analyze and provide values for each item in the feature list with extreme precision and objectivity.

    **Video Information:**
    - Title: ${snippet.title}
    - Description: ${snippet.description}
    - Script: """${script}"""
    - Views: ${statistics.viewCount || 'N/A'}
    - Likes: ${statistics.likeCount || 'N/A'}
    - Duration: ${contentDetails.duration || 'N/A'}

    **Analysis Feature List (156 items):**
    ${featureText}

    **Critical Instructions:**
    1. Analyze every single feature systematically
    2. Use only observable, measurable data
    3. When script analysis is required, extract specific elements like dialogue tone, pace, keywords, emotional indicators
    4. For visual elements, infer from title/description context when possible
    5. Provide concrete values, not vague assessments
    6. Use "판단 불가" only when truly impossible to determine

    **Output Format:**
    응답 형식 (JSON만):
    {
      "feature_1": "분석 결과 또는 기본값",
      "feature_2": "분석 결과 또는 기본값"
    }
    You MUST provide the analysis result ONLY in the following JSON format. Each feature's value must be a string. If analysis is impossible for an item, enter "판단 불가" as the value. Do NOT add any other explanations or markdown formatting.
  `;

  const result = await model.generateContent(prompt);
  const resultResponse = await result.response;
  const text = resultResponse.text();
  
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error(`Gemini 응답에서 JSON 형식을 찾을 수 없습니다. 응답: ${text}`);
    const jsonString = jsonMatch[0];
    let parsedResult = JSON.parse(jsonString);

    // "판단 불가" 항목 확인 및 재시도 로직
    let retryCount = 0;
    const maxRetries = 2;
    
    while (retryCount < maxRetries) {
      const undeterminedKeys = hasUndeterminedValues(parsedResult);
      
      if (undeterminedKeys.length === 0) {
        // "판단 불가" 항목이 없으면 분석 완료
        break;
      }
      
      console.log(`영상 "${video.title}"에서 ${undeterminedKeys.length}개의 "판단 불가" 항목 발견. 재시도 ${retryCount + 1}/${maxRetries}`);
      
      try {
        parsedResult = await retryAnalysisForUndetermined(
          video, 
          features, 
          youtube, 
          model, 
          parsedResult, 
          undeterminedKeys
        );
        retryCount++;
      } catch (retryError) {
        console.error(`재시도 ${retryCount + 1} 실패:`, retryError);
        break;
      }
    }

    // 카테고리별로 분석 결과 정리
    const categorizedAnalysis: { [category: string]: { [feature: string]: string } } = {};
    
    features.forEach(feature => {
      const featureKey = `feature_${feature.No}`;
      const value = parsedResult[featureKey] || "분석 불가";
      
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
  } catch (e: any) {
    throw new Error(`Gemini 결과 처리 실패: ${e.message}.`);
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
    // [수정됨] 'googleapis'를 사용한 올바른 API 클라이언트 생성
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

    const analysisResults = await Promise.allSettled(
      videos.map(video => analyzeSingleVideo(video, features, youtube, model))
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
    // [수정됨] 더 구체적인 에러 메시지 반환
    const errorMessage = error instanceof Error ? error.message : '서버 내부 오류가 발생했습니다.';
    return NextResponse.json({ message: errorMessage }, { status: 500 });
  }
}
