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

// --- 다국어 지원 자막 추출 ---
async function extractSubtitles(videoId: string): Promise<{ text: string; language: string }> {
  const languages = ['ko', 'en', 'ja', 'zh', 'es', 'fr', 'de', 'it', 'pt', 'ru', 'ar'];
  
  for (const lang of languages) {
    try {
      const subtitles = await getSubtitles({ videoID: videoId, lang });
      const text = subtitles.map(sub => sub.text).join(' ');
      console.log(`${lang} 자막 추출 성공 (${text.length}자)`);
      return { text, language: lang };
    } catch (e) {
      continue;
    }
  }
  
  console.log('자막 추출 실패 - 모든 언어 시도했으나 실패');
  return { text: '', language: 'none' };
}

// --- CSV 파싱 함수 ---
function getFeaturesFromCSV(): Feature[] {
  const filePath = path.join(process.cwd(), 'src', 'data', 'output_features.csv');
  try {
    let fileContent = fs.readFileSync(filePath, 'utf-8');
    
    if (fileContent.charCodeAt(0) === 0xFEFF) {
      fileContent = fileContent.slice(1);
    }
    
    const lines = fileContent.split('\n').filter(line => line.trim());
    const features = lines.slice(1).map(line => {
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
    
    return features;
  } catch (error) {
    console.error("CSV 파일 읽기 오류:", error);
    throw new Error("서버에서 'output_features.csv' 파일을 읽을 수 없습니다.");
  }
}

function getYouTubeVideoId(url: string): string | null {
  if (!url) return null;
  const regex = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/)([^"&?\/\s]{11})/;
  const match = url.match(regex);
  return match ? match[1] : null;
}

// --- 향상된 전문가 페르소나 기반 프롬프트 ---
function createExpertAnalysisPrompt(videoData: any, features: Feature[], scriptData: { text: string; language: string }) {
  const { snippet, statistics, contentDetails } = videoData;
  
  // Duration을 초 단위로 변환
  const getDurationInSeconds = (duration: string): number => {
    if (!duration) return 0;
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;
    const [, hours = '0', minutes = '0', seconds = '0'] = match;
    return parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds);
  };

  const durationSeconds = getDurationInSeconds(contentDetails.duration || '');
  const isShortVideo = durationSeconds <= 60;

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
# PERSONA: YouTube Video Analysis Expert

You are a **YouTube Video Analysis Expert** and the user's content creation partner. Your core competency is analyzing ANY YouTube URL provided by the user, focusing intensively on the content to deliver comprehensive analysis reports and actionable insights.

## CRITICAL ANALYSIS FRAMEWORK

### 1. IMMEDIATE VIDEO ASSESSMENT
**Video Type:** ${isShortVideo ? 'SHORT VIDEO (≤60 seconds)' : 'STANDARD VIDEO (>60 seconds)'}
**Duration:** ${durationSeconds} seconds
**Analysis Strategy:** ${isShortVideo ? 'INTENSIVE MICRO-ANALYSIS - Every frame counts, focus on rapid visual cues and immediate impressions' : 'COMPREHENSIVE ANALYSIS - Detailed examination of all elements'}

### 2. VIDEO INFORMATION DATABASE
- **Title:** ${snippet.title}
- **Description:** ${snippet.description?.substring(0, 1000) || 'No description'}
- **Views:** ${statistics.viewCount || 'N/A'}
- **Likes:** ${statistics.likeCount || 'N/A'}
- **Comments:** ${statistics.commentCount || 'N/A'}
- **Channel:** ${snippet.channelTitle || 'N/A'}
- **Published:** ${snippet.publishedAt || 'N/A'}
- **Script Language:** ${scriptData.language}
- **Script Content:** ${scriptData.text.substring(0, 2000) || 'No subtitles available'}

### 3. SPECIALIZED ANALYSIS PROTOCOLS

#### A. HUMAN ANALYSIS PROTOCOL (인물 분석)
**MANDATORY STEPS:**
1. **Gender Detection:** Scan for ANY human figures - even partial appearances, silhouettes, or brief moments
2. **Age Assessment:** Look for facial features, body language, clothing style indicators
3. **Physical Characteristics:** Hair, skin tone, facial structure, body type
4. **Behavioral Analysis:** Gestures, posture, movement patterns, expressions
5. **Interaction Patterns:** How many people, their relationships, positioning

**FOR SHORT VIDEOS:** Focus on the FIRST CLEAR FRAME where humans appear. Even 1-2 seconds is enough for basic gender/age assessment.

#### B. VISUAL ELEMENTS PROTOCOL
**IMMEDIATE SCAN:**
- **Opening 3 seconds:** What's the first impression? Colors, people, objects, setting
- **Dominant elements:** What takes up most screen space?
- **Color palette:** Primary and secondary colors
- **Setting detection:** Indoor/outdoor, specific location types

#### C. PRODUCT/BRAND PROTOCOL
**SYSTEMATIC CHECK:**
1. **Logo scanning:** Any brand logos, product names, or text overlays
2. **Product placement:** Items being used, shown, or demonstrated  
3. **Brand colors:** Consistent color schemes that might indicate branding
4. **Call-to-action elements:** Text, buttons, or verbal prompts

### 4. ANALYSIS FEATURES TO COMPLETE
${featuresText}

### 5. RESPONSE GENERATION RULES

#### CRITICAL INSTRUCTIONS:
1. **NO LAZY ANALYSIS:** For obvious visual elements (like clear gender, age, colors, settings), provide specific answers
2. **EVIDENCE-BASED:** If you can see it in typical video thumbnail or opening seconds, analyze it
3. **SHORT VIDEO FOCUS:** For videos ≤60 seconds, prioritize immediate visual impact elements
4. **FAILURE REASONS:** Only use "분석불가/reason" when truly impossible to determine from ANY visual or audio cues

#### SPECIFIC ANSWER FORMATS:
- **Gender:** "남성/여성/혼성" (not "분석불가" unless truly no humans visible)
- **Age:** "20대/30대/추정 25세" (make educated guesses based on visual cues)
- **Colors:** "빨간색/파란색/다색상" (specific color names)
- **Setting:** "실내/실외/스튜디오/주방" (specific location types)
- **Products:** "있음-[product type]/없음" (be specific about what you see)

#### FAILURE CODES (Use sparingly):
- "분석불가/인물없음" - Only when NO humans appear at all
- "분석불가/화질불량" - Only for severely pixelated/blurry content
- "분석불가/정보부족" - Only for completely ambiguous cases
- "분석불가/시간부족" - Only for extremely brief glimpses

### 6. QUALITY ASSURANCE CHECKLIST
Before finalizing your analysis, verify:
- [ ] Did I analyze obvious visual elements that anyone could see?
- [ ] Did I provide specific values instead of generic "분석불가"?
- [ ] For short videos, did I focus on immediate visual impact?
- [ ] Did I use educated guesses based on visual context?
- [ ] Are my "분석불가" responses truly justified?

## RESPONSE FORMAT
Provide your analysis in JSON format with exactly these keys:

{
  "feature_1": "specific analyzed value or 분석불가/specific reason",
  "feature_2": "specific analyzed value or 분석불가/specific reason",
  ...
  "feature_156": "specific analyzed value or 분석불가/specific reason"
}

**REMEMBER:** You are an expert analyst. Even a 15-second commercial should provide enough visual information for most human, clothing, setting, and product features. Be confident in your visual assessment abilities.
`;
}

// --- JSON 파싱 및 검증 ---
function parseAndValidateResponse(text: string, features: Feature[]): any {
  console.log('Gemini 응답 첫 500자:', text.substring(0, 500));
  
  let jsonString = text.trim();
  jsonString = jsonString.replace(/```json\s*|\s*```/g, '');
  jsonString = jsonString.replace(/```\s*|\s*```/g, '');
  
  const jsonMatch = jsonString.match(/\{[\s\S]*\}/);
  if (!jsonMatch) {
    throw new Error('JSON 형식을 찾을 수 없습니다');
  }
  
  try {
    const parsed = JSON.parse(jsonMatch[0]);
    
    // 156개 feature가 모두 있는지 검증
    const expectedKeys = features.map(f => `feature_${f.No}`);
    const actualKeys = Object.keys(parsed);
    const missingKeys = expectedKeys.filter(key => !actualKeys.includes(key));
    
    if (missingKeys.length > 0) {
      console.warn(`누락된 features: ${missingKeys.length}개`);
      // 누락된 키들을 기본값으로 채우기
      missingKeys.forEach(key => {
        parsed[key] = '분석불가/AI응답누락';
      });
    }
    
    // 너무 많은 "분석불가" 응답 체크
    const analysisFailureCount = Object.values(parsed).filter(value => 
      String(value).startsWith('분석불가/') || String(value).startsWith('판단불가/')
    ).length;
    
    const failureRate = (analysisFailureCount / Object.keys(parsed).length) * 100;
    console.log(`분석실패율: ${failureRate.toFixed(1)}% (${analysisFailureCount}/156)`);
    
    if (failureRate > 70) {
      console.warn('분석실패율이 너무 높음. 재시도 필요할 수 있음.');
    }
    
    console.log(`파싱 완료: ${Object.keys(parsed).length}개 features`);
    return parsed;
  } catch (e) {
    console.error('JSON 파싱 실패:', e);
    throw new Error('JSON 파싱에 실패했습니다');
  }
}

// --- YouTube 메타데이터 기반 초기값 설정 ---
function setYouTubeMetadata(analysis: any, features: Feature[], videoData: any): any {
  const { snippet, statistics, contentDetails } = videoData;
  const result = { ...analysis };
  
  features.forEach(feature => {
    const featureKey = `feature_${feature.No}`;
    
    switch (feature.Feature) {
      case '전체 영상 길이':
        if (contentDetails.duration) {
          result[featureKey] = contentDetails.duration;
        }
        break;
      case '조회수':
        if (statistics.viewCount) {
          result[featureKey] = statistics.viewCount;
        }
        break;
      case '좋아요 수':
        if (statistics.likeCount) {
          result[featureKey] = statistics.likeCount;
        }
        break;
      case '채널명':
        if (snippet.channelTitle) {
          result[featureKey] = snippet.channelTitle;
        }
        break;
      case '영상 제목':
        if (snippet.title) {
          result[featureKey] = snippet.title;
        }
        break;
      case '영상 설명':
        result[featureKey] = snippet.description ? '있음' : '없음';
        break;
      case '게시일':
        if (snippet.publishedAt) {
          result[featureKey] = new Date(snippet.publishedAt).toLocaleDateString();
        }
        break;
    }
  });
  
  return result;
}

// --- 분석 완료도 계산 ---
function calculateCompletionStats(analysis: any): { completed: number; incomplete: number; total: number; percentage: number } {
  const total = Object.keys(analysis).length;
  let completed = 0;
  let incomplete = 0;
  
  Object.values(analysis).forEach(value => {
    const strValue = String(value);
    if (strValue === 'N/A' || 
        strValue === '미확인' || 
        strValue.startsWith('분석불가/') || 
        strValue.startsWith('판단불가/') || 
        strValue === '' || 
        strValue === '0' && strValue.includes('수')) {
      incomplete++;
    } else {
      completed++;
    }
  });
  
  return {
    completed,
    incomplete,
    total,
    percentage: Math.round((completed / total) * 100)
  };
}

// --- 재시도 로직이 추가된 분석 함수 ---
async function analyzeSingleVideo(video: VideoInput, features: Feature[], youtube: any, model: any): Promise<any> {
  const videoId = getYouTubeVideoId(video.url);
  if (!videoId) throw new Error(`'${video.url}'은(는) 잘못된 YouTube URL입니다.`);

  console.log(`영상 분석 시작: ${video.title} (ID: ${videoId})`);

  // YouTube 데이터 가져오기
  const response = await youtube.videos.list({
    part: ['snippet', 'statistics', 'contentDetails'],
    id: [videoId],
  });

  if (!response.data.items || response.data.items.length === 0) {
    throw new Error(`YouTube API에서 영상 정보를 찾을 수 없습니다 (ID: ${videoId}).`);
  }

  const videoData = response.data.items[0];
  
  // 다국어 자막 추출
  const scriptData = await extractSubtitles(videoId);

  // 향상된 프롬프트로 Gemini 분석
  const maxRetries = 2;
  let bestAnalysis = null;
  let bestCompletionRate = 0;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const prompt = createExpertAnalysisPrompt(videoData, features, scriptData);
      
      console.log(`분석 시도 ${attempt}/${maxRetries}: ${video.title}`);
      
      const result = await model.generateContent(prompt);
      const resultResponse = await result.response;
      const text = resultResponse.text();
      
      let analysisResult = parseAndValidateResponse(text, features);
      analysisResult = setYouTubeMetadata(analysisResult, features, videoData);
      
      // 완료도 계산
      const stats = calculateCompletionStats(analysisResult);
      console.log(`시도 ${attempt} 완료율: ${stats.percentage}%`);
      
      // 더 좋은 결과면 저장
      if (stats.percentage > bestCompletionRate) {
        bestCompletionRate = stats.percentage;
        bestAnalysis = { analysisResult, stats };
      }
      
      // 80% 이상이면 만족
      if (stats.percentage >= 80) {
        console.log(`높은 완료율 달성 (${stats.percentage}%), 분석 종료`);
        break;
      }
      
    } catch (e: any) {
      console.error(`분석 시도 ${attempt} 실패:`, e.message);
      if (attempt === maxRetries) {
        throw new Error(`모든 분석 시도 실패: ${e.message}`);
      }
    }
    
    // 재시도 전 잠시 대기
    if (attempt < maxRetries) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  if (!bestAnalysis) {
    throw new Error('분석 결과를 얻을 수 없습니다');
  }

  // 카테고리별 정리
  const categorizedAnalysis: { [category: string]: { [feature: string]: string } } = {};
  features.forEach(feature => {
    const featureKey = `feature_${feature.No}`;
    const value = bestAnalysis.analysisResult[featureKey] || '분석불가/AI처리오류';
    
    if (!categorizedAnalysis[feature.Category]) {
      categorizedAnalysis[feature.Category] = {};
    }
    categorizedAnalysis[feature.Category][feature.Feature] = value;
  });

  console.log(`영상 분석 완료: ${video.title} - 최종 완료도 ${bestCompletionRate}% (${bestAnalysis.stats.completed}/${bestAnalysis.stats.total})`);
  
  return { 
    ...video, 
    id: videoId, 
    status: 'completed', 
    analysis: categorizedAnalysis,
    completionStats: bestAnalysis.stats,
    scriptLanguage: scriptData.language
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
    const youtube = google.youtube({ version: 'v3', auth: YOUTUBE_API_KEY });
    const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ 
      model: "gemini-2.5-flash",
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
    console.log(`분석 시작: ${videos.length}개 영상, ${features.length}개 features`);

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
      
      // API 제한 방지를 위한 대기
      if (i < videos.length - 1) {
        await new Promise(resolve => setTimeout(resolve, 4000)); // 4초로 증가
      }
    }

    const successCount = results.filter(r => r.status === 'fulfilled').length;
    const failCount = results.filter(r => r.status === 'rejected').length;
    
    console.log(`전체 분석 완료. 성공: ${successCount}개, 실패: ${failCount}개`);
    return NextResponse.json({ results });

  } catch (error: any) {
    console.error("API Route Error:", error);
    return NextResponse.json({ 
      message: error instanceof Error ? error.message : '서버 내부 오류가 발생했습니다.' 
    }, { status: 500 });
  }
}