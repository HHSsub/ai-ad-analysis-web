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
  Category: string;
  Feature: string;
  Description: string;
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
    { "Category 1": { "Feature 1.1": "Analyzed value" } }
  `;

  const result = await model.generateContent(prompt);
  const resultResponse = await result.response;
  const text = resultResponse.text();
  
  try {
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error(`Gemini 응답에서 JSON 형식을 찾을 수 없습니다. 응답: ${text}`);
    const jsonString = jsonMatch[0];
    const parsedResult = JSON.parse(jsonString);
    return { ...video, id: videoId, status: 'completed', analysis: parsedResult };
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
      model: "gemini-pro",
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
