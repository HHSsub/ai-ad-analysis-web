// /app/api/analyze/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import Youtube from 'youtube-v3-api';
import { getSubtitles } from 'youtube-captions-scraper';
import path from 'path';
import fs from 'fs'; // fs/promises 대신 fs 사용

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

interface AnalysisResult {
  [key: string]: string | number;
}

interface CategorizedFeatures {
  [category: string]: AnalysisResult;
}

// --- 환경 변수 확인 ---
const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

if (!YOUTUBE_API_KEY || !GEMINI_API_KEY) {
  // 서버 시작 시 에러를 던지는 대신, 요청 시 에러 응답을 반환
  console.error("API 키가 .env.local 파일에 설정되지 않았습니다.");
}

const youtube = new Youtube(YOUTUBE_API_KEY!);
const genAI = new GoogleGenerativeAI(GEMINI_API_KEY!);
const model = genAI.getGenerativeModel({ model: "gemini-pro" });

// --- 헬퍼 함수: CSV 파싱 (동기 방식으로 변경) ---
function getFeaturesFromCSV(): Feature[] {
  const filePath = path.join(process.cwd(), 'src', 'data', 'output_features.csv');
  try {
    const fileContent = fs.readFileSync(filePath, 'utf-8');
    const lines = fileContent.split('\n').slice(1); // 헤더 제외
    return lines.map(line => {
      const [Category, Feature, Description] = line.split(',').map(s => (s || '').trim());
      return { Category, Feature, Description };
    }).filter(f => f.Category && f.Feature);
  } catch (error) {
    console.error("CSV 파일 읽기 오류:", error);
    throw new Error("서버에서 output_features.csv 파일을 읽을 수 없습니다.");
  }
}

// --- 헬퍼 함수: 유튜브 영상 ID 추출 ---
function getYouTubeVideoId(url: string): string | null {
  if (!url) return null;
  const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
  const match = url.match(regex);
  return match ? match : null;
}

// --- 메인 분석 함수 ---
async function analyzeSingleVideo(video: VideoInput, features: Feature[]): Promise<any> {
  const videoId = getYouTubeVideoId(video.url);
  if (!videoId) {
    throw new Error(`잘못된 YouTube URL: ${video.url}`);
  }

  // 1. YouTube Data API로 메타데이터 추출
  const videoDetails = await youtube.videos.list({
    part: 'snippet,statistics,contentDetails',
    id: videoId,
  });

  if (!videoDetails.items || videoDetails.items.length === 0) {
    throw new Error(`YouTube API에서 영상 정보를 찾을 수 없음: ${videoId}`);
  }
  const snippet = videoDetails.items.snippet;
  const statistics = videoDetails.items.statistics;
  const contentDetails = videoDetails.items.contentDetails;

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
    You are an expert advertising video analyst. Based on the provided YouTube video information and script, analyze and provide values for each item in the 156 feature list.

    **Video Information:**
    - Title: ${snippet.title}
    - Description: ${snippet.description}
    - Script: """${script}"""

    **Analysis Feature List (156 items):**
    ${featureText}

    **Output Format:**
    You MUST provide the analysis result ONLY in the following JSON format. Each feature's value must be a string. If analysis is impossible for an item, enter "Analysis unavailable" as the value. Do NOT add any other explanations.

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
    const jsonString = jsonMatch;
    const parsedResult: CategorizedFeatures = JSON.parse(jsonString);
    
    // 156개 피처가 모두 채워졌는지 검증
    let missingCount = 0;
    features.forEach(feature => {
        if (!parsedResult[feature.Category] || !parsedResult[feature.Category][feature.Feature]) {
            missingCount++;
            // 누락된 피처를 결과에 추가
            if (!parsedResult[feature.Category]) parsedResult[feature.Category] = {};
            parsedResult[feature.Category][feature.Feature] = "누락됨";
        }
    });

    if (missingCount > 0) {
        throw new Error(`${missingCount}개의 피처가 누락되었습니다.`);
    }
    
    return {
      ...video,
      id: videoId,
      status: 'completed',
      analysis: parsedResult,
    };
  } catch (e: any) {
    // Gemini 파싱 실패 또는 피처 누락 시, 미완료로 처리
    throw new Error(`Gemini 결과 처리 실패: ${e.message}`);
  }
}

// --- API 라우트 핸들러 ---
export async function POST(req: NextRequest) {
  if (!YOUTUBE_API_KEY || !GEMINI_API_KEY) {
    return NextResponse.json({ message: '서버에 API 키가 설정되지 않았습니다.' }, { status: 500 });
  }
    
  try {
    const body = await req.json();
    const videos: VideoInput[] = body.videos.filter((v: VideoInput) => v.url); // URL이 있는 것만 필터링

    if (videos.length === 0) {
      return NextResponse.json({ message: '분석할 영상이 없습니다.' }, { status: 400 });
    }

    const features = getFeaturesFromCSV();

    const analysisPromises = videos.map(video => 
        analyzeSingleVideo(video, features)
            .then(result => ({ status: 'fulfilled', value: result }))
            .catch(error => ({ status: 'rejected', reason: { ...video, id: getYouTubeVideoId(video.url) || video.url, status: 'failed', error: error.message } }))
    );

    const results = await Promise.all(analysisPromises);

    return NextResponse.json({ results });

  } catch (error: any) {
    console.error("API Route Error:", error);
    return NextResponse.json({ message: error.message || '서버 내부 오류 발생' }, { status: 500 });
  }
}
