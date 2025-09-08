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

  // 초기 분석 프롬프트 구성 시 YouTube 메타데이터를 미리 채워 넣음
  const initialFeatures: { [key: string]: string } = {};
  features.forEach(f => {
    let value = ""; // 기본값을 빈 문자열로 변경
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

  const featureText = features.map(f => {
    const initialValue = initialFeatures[`feature_${f.No}`];
    if (initialValue) {
      return `- ${f.Category} | ${f.Feature}: (이미 설정됨: ${initialValue})`;
    } else {
      return `- ${f.Category} | ${f.Feature}: (분석 필요)`;
    }
  }).join('\n');

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
    1. Analyze ONLY features marked as "(분석 필요)" - do NOT re-analyze features marked as "(이미 설정됨: ...)"
    2. Use only observable, measurable data
    3. When script analysis is required, extract specific elements like dialogue tone, pace, keywords, emotional indicators
    4. For visual elements, infer from title/description context when possible
    5. Provide concrete values, not vague assessments
    6. Use "판단 불가" only when truly impossible to determine
    7. Focus on features that need analysis, skip those already set with YouTube metadata

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

    parsedResult = { ...initialFeatures, ...parsedResult };

    let retryCount = 0;
    const maxRetries = 2;
    
    while (retryCount < maxRetries) {
      const undeterminedKeys = hasUndeterminedValues(parsedResult);
      
      if (undeterminedKeys.length === 0) {
        break;
      }
      
      console.log(`영상 "${video.title}"에서 ${undeterminedKeys.length}개의 "판단 불가" 항목 발견. 재시도 ${retryCount + 1}/${maxRetries}`);
      
      try {
        const retryResult = await retryAnalysisForUndetermined(
          video, 
          features, 
          youtube, 
          model, 
          parsedResult, 
          undeterminedKeys
        );
        parsedResult = { ...parsedResult, ...retryResult };
        retryCount++;
      } catch (retryError) {
        console.error(`재시도 ${retryCount + 1} 실패:`, retryError);
        break;
      }
    }

    const categorizedAnalysis: { [category: string]: { [feature: string]: string } } = {};
    
    features.forEach(feature => {
      const featureKey = `feature_${feature.No}`;
      // 초기값이 있으면 사용하고, 없으면 Gemini 분석 결과 사용, 둘 다 없으면 "분석 불가"
      let value = initialFeatures[featureKey] || parsedResult[featureKey] || "분석 불가";
      
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
      videos.map(async (video, index) => {
        // 진행률 업데이트를 위한 콜백 함수 (클라이언트에서 사용)
        // 이 부분은 실제 클라이언트와 서버 간의 실시간 통신이 필요합니다.
        // 현재는 단순히 서버 로그에만 남기도록 합니다.
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
