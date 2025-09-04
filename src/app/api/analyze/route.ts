// 경로: src/app/api/analyze/route.ts

import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';
import fs from 'fs';
import path from 'path';

// Vercel 서버리스 함수 최대 실행 시간 설정
export const maxDuration = 300; // 5분

// Feature 타입 정의
interface Feature {
    'No.': string;
    '분석 범주': string;
    '세부 항목': string;
    'Value': string;
}

// Node.js fs 모듈로 CSV 파일을 읽고 파싱하는 함수 (Vercel 환경에서 안정적)
function getFeaturesFromCSV(): Feature[] {
    const csvFilePath = path.join(process.cwd(), 'src', 'data', 'output_features.csv');
    const fileContent = fs.readFileSync(csvFilePath, 'utf8');
    
    const lines = fileContent.trim().split('\n');
    // CSV 헤더 파싱 (따옴표로 묶인 경우도 고려)
    const headers = lines[0].split(',').map(h => h.trim().replace(/"/g, ''));
    
    return lines.slice(1).map(line => {
        // 간단한 CSV 파싱 (따옴표로 묶인 쉼표 무시 기능은 없음, 단순 분리)
        const values = line.split(',');
        const feature: any = {};
        headers.forEach((header, i) => {
            feature[header] = values[i] ? values[i].trim().replace(/"/g, '') : '';
        });
        return feature as Feature;
    });
}

// YouTube Data API 호출 함수
async function getYouTubeVideoDetails(videoId: string) {
    const apiKey = process.env.YOUTUBE_API_KEY;
    if (!apiKey) throw new Error("YOUTUBE_API_KEY is not set in .env.local");
    
    const url = `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&part=snippet,statistics,contentDetails&key=${apiKey}`;
    const response = await fetch(url );
    if (!response.ok) {
        console.error("YouTube API Error:", await response.text());
        return null;
    }
    const data = await response.json();
    if (!data.items || data.items.length === 0) return null;
    const { snippet, statistics, contentDetails } = data.items[0];
    return {
        title: snippet.title,
        viewCount: statistics.viewCount,
        likeCount: statistics.likeCount,
        commentCount: statistics.commentCount,
        duration: contentDetails.duration,
    };
}

// --- 3. 메인 API 핸들러 ---
export async function POST(request: NextRequest) {
    try {
        // 1. CSV 파일로부터 156개 피처 목록을 불러옵니다.
        const allFeatures = getFeaturesFromCSV();
        if (allFeatures.length < 156) {
            throw new Error("CSV file could not be read correctly or has less than 156 features.");
        }

        const { videoUrl } = await request.json();
        if (!videoUrl) {
            return NextResponse.json({ error: 'Video URL is required' }, { status: 400 });
        }

        const videoIdMatch = videoUrl.match(/(?:v=|\/)([0-9A-Za-z_-]{11}).*/);
        const videoId = videoIdMatch ? videoIdMatch[1] : null;
        if (!videoId) {
            return NextResponse.json({ error: 'Invalid YouTube URL' }, { status: 400 });
        }

        const youtubeData = await getYouTubeVideoDetails(videoId);
        if (!youtubeData) {
            return NextResponse.json({ error: 'Failed to get video details from YouTube.' }, { status: 500 });
        }

        // 3. Gemini 분석을 위한 프롬프트를 CSV 기반으로 생성합니다.
        const featureListText = allFeatures
            .map(f => `${f['No.']}. ${f['분석 범주']} - ${f['세부 항목']}`)
            .join('\n');

        const prompt = `
        You are a world-class, hyper-detailed advertising video analyst. Your mission is to analyze a YouTube video with extreme precision and fill out ALL 156 of the following feature analysis items based on the provided CSV structure.

        **Your Task:**
        1.  Thoroughly watch and analyze the entire video from the provided URL.
        2.  For EACH of the 156 features listed below, provide a detailed and accurate value.
        3.  **The output MUST be a single, valid JSON object.** The keys of the JSON object must be the feature "No." as a string (e.g., "1", "2", "156"). The values must be your analysis results.
        4.  **DO NOT OMIT ANY FEATURE.** If a feature is absolutely impossible to determine, and only in that case, use the string "분석 불가". Otherwise, provide your best possible expert estimation.

        **Video URL to Analyze:** ${videoUrl}
        **Basic Metadata (for context):** ${JSON.stringify(youtubeData)}

        **Output the final, complete JSON object below, containing all 156 features.**

        **Feature List to fill:**
        ${featureListText}
        `;

        // 4. Gemini API를 호출합니다.
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
        const result = await model.generateContent(prompt);
        const responseText = (await result.response).text();
        const jsonText = responseText.replace(/```json/g, '').replace(/```/g, '').trim();
        
        let geminiResult: Record<string, any>;
        try {
            geminiResult = JSON.parse(jsonText);
        } catch (e) {
            console.error("Failed to parse Gemini's JSON response:", e, "Raw response:", responseText);
            return NextResponse.json({ error: "Analysis failed: AI returned invalid data format." }, { status: 500 });
        }

        // 5. 최종 결과 생성: CSV 구조에 Gemini 결과와 YouTube 데이터를 채워 넣습니다.
        let missingCount = 0;
        const finalAnalysis = allFeatures.map(feature => {
            const featureNoStr = feature['No.'];
            let analyzedValue = geminiResult[featureNoStr];

            if (!analyzedValue || analyzedValue === "N/A" || analyzedValue === "분석 불가") {
                missingCount++;
                analyzedValue = "누락됨"; // AI가 값을 주지 않거나 분석 불가 판정한 경우
            }

            // YouTube API 값으로 덮어쓰기 (더 정확한 데이터)
            if (featureNoStr === '156') analyzedValue = youtubeData.duration;
            // (필요시 조회수, 좋아요 등 다른 항목도 여기에 추가)

            return { ...feature, Value: analyzedValue };
        });
        
        // 최종 응답 데이터에 missingCount 포함
        return NextResponse.json({ data: finalAnalysis, missingCount });

    } catch (error: any) {
        console.error('Critical API Route Error:', error);
        return NextResponse.json({ error: error.message || 'An internal server error occurred.' }, { status: 500 });
    }
}
