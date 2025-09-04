// /src/app/api/analyze/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Youtube from 'youtube-v3-api';
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
  Category: string;
  Feature: string;
  Description: string;
}

interface CategorizedFeatures {
  [category: string]: { [feature: string]: string };
}

// --- 환경 변수 및 API 클라이언트 초기화 ---
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

let youtube: Youtube;
let genAI: GoogleGenerativeAI;

if (YOUTUBE_API_KEY && GEMINI_API_KEY) {
  youtube = new Youtube(YOUTUBE_API_KEY);
  genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
}

// --- 헬퍼 함수: CSV 파싱 ---
function getFeaturesFromCSV(): Feature[] {
  const filePath = path.join(process.cwd(), 'src', 'data', 'output_features.csv');
  try {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const lines = fileContent.split('\n').slice(1);
    return lines.map(line => {
      const [Category, Feature, Description] = line.split(',').map(s => (s || '').trim().replace(/"/g, ''));
      return { Category, Feature, Description };
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

// --- 메인 분석 함수 ---
async function analyzeSingleVideo(video: VideoInput, features: Feature[], model: any): Promise<any> {
  const videoId = getYouTubeVideoId(video.url);
  if (!videoId) {
    throw new Error(`'${video.url}'은(는) 잘못된 YouTube URL입니다.`);
  }

  // 1. YouTube Data API로 메타데이터 추출
  const videoDetails = await youtube.videos.list({
    part: 'snippet,statistics,contentDetails',
    id: videoId,
  });

  if (!videoDetails.items || videoDetails.items.length === 0) {
    throw new Error(`YouTube API에서 영상 정보를 찾을 수 없습니다 (ID: ${videoId}).`);
  }
  const snippet = videoDetails.items[0].snippet;

  // 2. 스크립트(자막) 추출
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

  // 3. Gemini 분석을 위한 프롬프트 생성
  const featureText = features.map(f => `- ${f.Category} | ${f.Feature}: ${f.Description}`).join('\n');
  const prompt = `
    You are an expert advertising video analyst. Based on the provided YouTube video information and script, analyze and provide values for each item in the feature list.

    **Video Information:**
    - Title: ${snippet.title}
    - Description: ${snippet.description}
    - Script: """${script}"""

    **Analysis Feature List:**
    ${featureText}

    **Output Format:**
    You MUST provide the analysis result ONLY in the following JSON format. Each feature's value must be a string. If analysis is impossible for an item, enter "분석 불가" as the value. Do NOT add any other explanations or markdown formatting.

    {
      "Category 1": {
        "Feature 1.1": "Analyzed value",
        "Feature 1.2": "Analyzed value"
      },
      "Category 2": {
        "Feature 2.1": "Analyzed value"
      },
      ...
    }
  `;

  // 4. Gemini API 호출
  const result = await model.generateContent(prompt);
  const response = await result.response;
  const text = response.text();
  
  // 5. 결과 파싱 및 반환
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error("Gemini 응답에서 JSON 형식을 찾을 수 없습니다.");
    }
    const jsonString = jsonMatch[0];
    const parsedResult: CategorizedFeatures = JSON.parse(jsonString);
    
    // 일부 피처 누락 검증 및 처리
    let missingCount = 0;
    features.forEach(feature => {
      if (!parsedResult[feature.Category] || typeof parsedResult[feature.Category][feature.Feature] === 'undefined') {
        missingCount++;
        if (!parsedResult[feature.Category]) parsedResult[feature.Category] = {};
        parsedResult[feature.Category][feature.Feature] = "누락됨";
      }
    });

    if (missingCount > 50) { // 임계값 설정 (너무 많은 피처가 누락되면 분석 실패로 간주)
        throw new Error(`분석 실패: ${missingCount}개의 피처가 누락되었습니다. Gemini 응답을 확인하세요.`);
    }
    
    return {
      ...video,
      id: videoId,
      status: 'completed',
      analysis: parsedResult,
    };
  } catch (e: any) {
    throw new Error(`Gemini 결과 처리 실패: ${e.message}. 원본 응답: ${text}`);
  }
}

// --- API 라우트 핸들러 ---
export async function POST(req: NextRequest) {
  if (!YOUTUBE_API_KEY || !GEMINI_API_KEY) {
    return NextResponse.json({ message: '서버에 API 키가 설정되지 않았습니다.' }, { status: 500 });
  }
    
  try {
    const model = genAI.getGenerativeModel({ model: "gemini-pro" });
    const body = await req.json();
    const videos: VideoInput[] = body.videos.filter((v: VideoInput) => v.url && v.url.trim() !== '');

    if (videos.length === 0) {
      return NextResponse.json({ message: '분석할 영상이 없습니다.' }, { status: 400 });
    }

    const features = getFeaturesFromCSV();

    const analysisResults = await Promise.allSettled(
      videos.map(video => analyzeSingleVideo(video, features, model))
    );

    const finalResults = analysisResults.map((result, index) => {
      if (result.status === 'fulfilled') {
        return { status: 'fulfilled', value: result.value };
      } else {
        return { 
          status: 'rejected', 
          reason: { 
            ...videos[index], 
            id: getYouTubeVideoId(videos[index].url) || videos[index].url, 
            status: 'failed', 
            error: result.reason.message 
          } 
        };
      }
    });

    return NextResponse.json({ results: finalResults });

  } catch (error: any) {
    console.error("API Route Error:", error);
    return NextResponse.json({ message: error.message || '서버 내부 오류가 발생했습니다.' }, { status: 500 });
  }
}
