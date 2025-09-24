// /src/app/api/analyze/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI, HarmCategory, HarmBlockThreshold } from '@google/generative-ai';
import { google } from 'googleapis';
import { getSubtitles } from 'youtube-captions-scraper';
import path from 'path';
import fs from 'fs';

// 과부하 완화/리밋, 자막 폴백, 썸네일 멀티모달 헬퍼 추가
import { callGeminiWithTransientRetry } from '@/lib/ai/gemini-rate-limit';
import { getSubtitlesWithFallback } from '@/lib/youtube/subtitle-fallback';
import { getThumbnailUrls, fetchInlineImageParts } from '@/lib/youtube/thumbnails';
import { globalDriveUploader } from '@/lib/google-drive';

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

  // 기존 경로: youtube-captions-scraper
  for (const lang of languages) {
    try {
      const subtitles = await getSubtitles({ videoID: videoId, lang });
      const text = subtitles.map(sub => sub.text).join(' ');
      if (text && text.trim().length > 30) {
        console.log(`${lang} 자막 추출 성공 (${text.length}자)`);
        return { text, language: lang };
      }
    } catch (e) {
      continue;
    }
  }

  // 폴백: timedtext 
  try {
    const fb = await getSubtitlesWithFallback(videoId);
    if (fb.text && fb.text.trim().length > 0) {
      console.log(`timedtext 폴백 성공(${fb.language}) (${fb.text.length}자)`);
      return fb;
    }
  } catch (e) {
    console.log('timedtext 폴백 실패:', (e as any)?.message || e);
  }

  console.log('자막 추출 실패 - 모든 경로 시도했으나 실패');
  return { text: '', language: 'none' };
}

// --- CSV 파싱 함수 (TypeError 해결) ---
function getFeaturesFromCSV(): Feature[] {
  const filePath = path.join(process.cwd(), 'src', 'data', 'output_features.csv');
  
  try {
    // 파일 존재 확인
    if (!fs.existsSync(filePath)) {
      throw new Error(`CSV 파일이 존재하지 않습니다: ${filePath}`);
    }

    // 파일 읽기
    let fileContent = fs.readFileSync(filePath, 'utf-8');
    
    // null/undefined 체크
    if (!fileContent || fileContent.length === 0) {
      throw new Error('CSV 파일이 비어있거나 읽을 수 없습니다');
    }

    // BOM 제거
    if (fileContent.charCodeAt(0) === 0xFEFF) {
      fileContent = fileContent.slice(1);
    }
    
    // 빈 라인 필터링 (에러 발생 지점 수정)
    const lines = fileContent.split('\n').filter(line => line && line.trim().length > 0);
    
    if (lines.length < 2) {
      throw new Error('CSV 파일에 충분한 데이터가 없습니다');
    }
    
    const features = lines.slice(1).map((line, index) => {
      try {
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
        
        if (columns.length < 4) {
          console.warn(`Line ${index + 2}: 충분한 컬럼이 없습니다`);
          return null;
        }
        
        const [No, Category, Feature, Value] = columns.map(s => 
          s ? s.replace(/^"|"$/g, '').trim() : ''
        );
        
        if (!No || !Category || !Feature) {
          console.warn(`Line ${index + 2}: 필수 필드 누락`);
          return null;
        }
        
        return { No, Category, Feature, Value: Value || '' };
      } catch (lineError) {
        console.error(`Line ${index + 2} 파싱 오류:`, lineError);
        return null;
      }
    }).filter((f): f is Feature => f !== null);
    
    if (features.length === 0) {
      throw new Error('유효한 feature를 찾을 수 없습니다');
    }
    
    console.log(`CSV 로딩 완료: ${features.length}개 features`);
    return features;
    
  } catch (error) {
    console.error("CSV 파일 읽기 오류:", error);
    throw new Error(`CSV 파일 처리 실패: ${error instanceof Error ? error.message : String(error)}`);
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

You are a **YouTube Video Analysis Expert** and the user's content creation partner. Your core competency is analyzing ANY YouTube URL provided by the user, focusing intensively on the content to extract concrete, verifiable signals that map to the requested features.

## CRITICAL ANALYSIS FRAMEWORK

### 1. IMMEDIATE VIDEO ASSESSMENT
**Video Type:** ${isShortVideo ? 'SHORT VIDEO (≤60 seconds)' : 'STANDARD VIDEO (>60 seconds)'}
**Duration:** ${durationSeconds} seconds
**Analysis Strategy:** ${isShortVideo ? 'Focus on immediate visual impact, thumbnail analysis, and title/description inference for missing elements' : 'Comprehensive content analysis with script and visual elements'}

### 2. VIDEO DATA AVAILABLE
**Title:** ${snippet.title || 'N/A'}
**Channel:** ${snippet.channelTitle || 'N/A'}
**Description:** ${snippet.description?.substring(0, 200) || 'N/A'}...
**Views:** ${statistics?.viewCount || 'N/A'}
**Duration:** ${contentDetails?.duration || 'N/A'}
**Script Language:** ${scriptData.language !== 'none' ? scriptData.language : 'No subtitles'}
**Script Content:** ${scriptData.text ? scriptData.text.substring(0, 300) + '...' : 'No script available'}

### 3. ANALYSIS FEATURES TO COMPLETE
${featuresText}

### 4. RESPONSE GENERATION RULES

#### CRITICAL INSTRUCTIONS:
1. **NO LAZY ANALYSIS:** For obvious visual elements, provide specific answers
2. **EVIDENCE-BASED:** If you can see it in typical video thumbnail or opening seconds, analyze it
3. **SHORT VIDEO FOCUS:** For videos ≤60 seconds, prioritize immediate visual impact
4. **FAILURE REASONS:** Only use "분석불가/reason" when truly impossible to determine

#### SPECIFIC ANSWER FORMATS:
- **Gender:** "남성/여성/혼성" (not "분석불가" unless truly no humans visible)
- **Age:** "20대/30대/추정 25세" (make educated guesses based on visual cues)
- **Colors:** "빨간색/파란색/다색상" (specific color names)
- **Setting:** "실내/실외/스튜디오/주방" (specific location types)
- **Products:** "있음-[product type]/없음" (be specific about what you see)

## RESPONSE FORMAT
Provide your analysis in JSON format with exactly these keys:

{
  "feature_1": "specific analyzed value or 분석불가/specific reason",
  "feature_2": "specific analyzed value or 분석불가/specific reason",
  ...
  "feature_156": "specific analyzed value or 분석불가/specific reason"
}
`.trim();
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
    
    const analysisFailureCount = Object.values(parsed).filter(value => 
      String(value).startsWith('분석불가/') || String(value).startsWith('판단불가/')
    ).length;
    
    const failureRate = (analysisFailureCount / Object.keys(parsed).length) * 100;
    console.log(`분석실패율: ${failureRate.toFixed(1)}% (${analysisFailureCount}/156)`);
    
    if (failureRate > 70) {
      console.warn('분석실패율이 너무 높음. 재시도 필요할 수 있음.');
    }
    
    return parsed;
  } catch (parseError) {
    console.error('JSON 파싱 실패:', parseError);
    console.log('파싱 시도한 텍스트:', jsonMatch[0].substring(0, 200));
    throw new Error('Gemini 응답을 JSON으로 변환할 수 없습니다');
  }
}

// --- 유튜브 메타데이터 기반 추론 ---
function inferFeaturesFromYouTubeMetadata(videoData: any, features: Feature[]): any {
  const { snippet, statistics } = videoData;
  const result: any = {};
  
  features.forEach(feature => {
    const featureKey = `feature_${feature.No}`;
    
    switch (feature.Feature) {
      case '영상 제목':
        result[featureKey] = snippet.title || 'N/A';
        break;
      case '채널명':
        result[featureKey] = snippet.channelTitle || 'N/A';
        break;
      case '조회수':
        result[featureKey] = statistics?.viewCount ? parseInt(statistics.viewCount).toLocaleString() : 'N/A';
        break;
      case '좋아요 수':
        result[featureKey] = statistics?.likeCount ? parseInt(statistics.likeCount).toLocaleString() : 'N/A';
        break;
      case '댓글 수':
        result[featureKey] = statistics?.commentCount ? parseInt(statistics.commentCount).toLocaleString() : 'N/A';
        break;
      case '광고 여부':
        result[featureKey] = snippet.title?.includes('광고') || snippet.description?.includes('광고') || 
                           snippet.title?.includes('AD') || snippet.description?.includes('sponsored') ? 
                           '있음' : '없음';
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

// --- 유튜브 메타 폴백 오브젝트 생성 ---
function buildFallbackVideoData(input: VideoInput) {
  return {
    snippet: {
      title: input.title || '(untitled)',
      description: '',
      channelTitle: 'N/A',
      publishedAt: '',
    },
    statistics: {
      viewCount: '',
      likeCount: '',
      commentCount: '',
    },
    contentDetails: {
      duration: '',
    },
  };
}

// --- 재시도 로직이 추가된 분석 함수 ---
async function analyzeSingleVideo(video: VideoInput, features: Feature[], youtube: any | null, model: any): Promise<any> {
  const videoId = getYouTubeVideoId(video.url);
  if (!videoId) throw new Error(`'${video.url}'은(는) 잘못된 YouTube URL입니다.`);

  console.log(`영상 분석 시작: ${video.title} (ID: ${videoId})`);

  // YouTube 데이터 가져오기 (선택적)
  let videoData: any | null = null;
  if (youtube) {
    try {
      const response = await youtube.videos.list({
        part: ['snippet', 'statistics', 'contentDetails'],
        id: [videoId],
      });

      if (response.data.items && response.data.items.length > 0) {
        videoData = response.data.items[0];
        console.log('YouTube API 데이터 로드 성공');
      } else {
        console.log('YouTube API에서 영상 정보를 찾을 수 없음');
      }
    } catch (apiError) {
      console.log('YouTube API 오류 (메타데이터 없이 진행):', (apiError as any)?.message);
    }
  }

  // 폴백: 입력 데이터 기반 메타데이터 생성
  if (!videoData) {
    videoData = buildFallbackVideoData(video);
    console.log('폴백 메타데이터 사용');
  }

  // 자막 추출
  const scriptData = await extractSubtitles(videoId);

  // YouTube 메타데이터 기반 추론 (기본 추론)
  const baseInferences = inferFeaturesFromYouTubeMetadata(videoData, features);

  // Gemini AI 분석 (고급 분석)
  let analysisResults = {};
  try {
    const prompt = createExpertAnalysisPrompt(videoData, features, scriptData);
    console.log(`Gemini AI 분석 시작... (프롬프트 길이: ${prompt.length}자)`);
    
    const geminiResponse = await callGeminiWithTransientRetry(
      model,
      prompt,
      { maxRetries: 2, baseDelay: 1000 }
    );
    
    if (geminiResponse && geminiResponse.trim().length > 0) {
      analysisResults = parseAndValidateResponse(geminiResponse, features);
      console.log('Gemini AI 분석 완료');
    } else {
      throw new Error('Gemini AI가 빈 응답을 반환했습니다');
    }
  } catch (geminiError) {
    console.error('Gemini AI 분석 실패:', (geminiError as any)?.message);
    console.log('YouTube 메타데이터만으로 분석 진행');
    
    // Gemini 실패시 기본 추론 결과만 사용
    features.forEach(feature => {
      const featureKey = `feature_${feature.No}`;
      if (!baseInferences[featureKey]) {
        analysisResults[featureKey] = '분석불가/AI분석실패';
      }
    });
  }

  // 기본 추론과 AI 분석 결과 병합
  const finalAnalysis = { ...baseInferences, ...analysisResults };

  // 카테고리별로 분석 결과 재구성
  const categorizedAnalysis: { [category: string]: { [feature: string]: string } } = {};
  features.forEach(feature => {
    const featureKey = `feature_${feature.No}`;
    if (!categorizedAnalysis[feature.Category]) {
      categorizedAnalysis[feature.Category] = {};
    }
    categorizedAnalysis[feature.Category][feature.Feature] = finalAnalysis[featureKey] || 'N/A';
  });

  // 완료도 통계 계산
  const completionStats = calculateCompletionStats(finalAnalysis);

  return {
    id: videoId,
    title: video.title,
    url: video.url,
    notes: video.notes,
    status: 'completed',
    analysis: categorizedAnalysis,
    features: finalAnalysis, // 플랫 구조 유지 (호환성)
    completionStats,
    scriptLanguage: scriptData.language,
  };
}

// --- 메인 POST 핸들러 ---
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { videos } = body;

    if (!videos || !Array.isArray(videos) || videos.length === 0) {
      return NextResponse.json({ 
        message: '분석할 영상 목록이 필요합니다.' 
      }, { status: 400 });
    }

    const features = getFeaturesFromCSV();
    console.log(`분석 시작: ${videos.length}개 영상, ${features.length}개 features`);

    // YouTube API 초기화 (선택적)
    let youtube = null;
    const youtubeApiKey = process.env.YOUTUBE_API_KEY;
    if (youtubeApiKey) {
      youtube = google.youtube({ version: 'v3', auth: youtubeApiKey });
      console.log('YouTube API 초기화 완료');
    } else {
      console.log('YouTube API 키 없음 - 메타데이터 없이 진행');
    }

    // Gemini AI 초기화
    const geminiApiKey = process.env.GEMINI_API_KEY;
    if (!geminiApiKey) {
      throw new Error('GEMINI_API_KEY 환경변수가 설정되지 않았습니다.');
    }
    
    const genAI = new GoogleGenerativeAI(geminiApiKey);
    const model = genAI.getGenerativeModel({ 
      model: 'gemini-2.5-flash',
      safetySettings: [
        { category: HarmCategory.HARM_CATEGORY_HATE_SPEECH, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_DANGEROUS_CONTENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_HARASSMENT, threshold: HarmBlockThreshold.BLOCK_NONE },
        { category: HarmCategory.HARM_CATEGORY_SEXUALLY_EXPLICIT, threshold: HarmBlockThreshold.BLOCK_NONE },
      ],
      generationConfig: { temperature: 0.1, maxOutputTokens: 8000 }
    });

    const results: any[] = [];
    for (let i = 0; i < videos.length; i++) {
      const video = videos[i];
      console.log(`[${i + 1}/${videos.length}] 분석 중: ${video.title}`);
      
      try {
        const result = await analyzeSingleVideo(video, features, youtube, model);
        results.push({ status: 'fulfilled', value: result });
        
        // 분석 성공시 즉시 Google Drive에 업로드
        try {
          console.log(`🚀 Google Drive 즉시 업로드 시작: ${result.title}`);
          const uploadResult = await globalDriveUploader.uploadImmediately(result);
          
          if (uploadResult.success) {
            console.log(`✅ Drive 업로드 성공: ${result.title}`);
            if (uploadResult.overwritten) {
              console.log(`🔄 기존 파일 덮어쓰기 완료: ${result.title}`);
            }
            if (uploadResult.webViewLink) {
              console.log(`🔗 Drive 링크: ${uploadResult.webViewLink}`);
            }
          } else {
            console.error(`❌ Drive 업로드 실패: ${result.title}`);
          }
        } catch (driveError: any) {
          console.error(`❌ Drive 업로드 중 예외 발생: ${result.title}`, driveError.message);
        }
        
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
        await new Promise(resolve => setTimeout(resolve, 4000));
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
