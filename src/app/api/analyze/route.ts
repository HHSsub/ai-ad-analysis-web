// src/app/api/analyze/route.ts - 전체 요청 기준 실패 카운트 수정
import { NextRequest, NextResponse } from 'next/server';
import { google } from 'googleapis';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { getSubtitles } from 'youtube-captions-scraper';
import { getGlobalDB } from '@/lib/sql-database';
import { VIDEO_FEATURES } from '@/types/video';
import { calculateHybridScore } from '@/services/metricsService';
import fs from 'fs';
import path from 'path';

// CSV에서 특성 로드
interface Feature {
  No: string;
  Category: string;
  Feature: string;
  Value: string;
}

function getFeaturesFromCSV(): Feature[] {
  try {
    const csvPath = path.join(process.cwd(), 'public', 'youtube_ad_features.csv');
    const csvContent = fs.readFileSync(csvPath, 'utf-8');
    const lines = csvContent.split('\n').filter(line => line.trim());
    
    const features: Feature[] = [];
    for (let i = 1; i < lines.length; i++) {
      const cols = parseCsvLine(lines[i]);
      if (cols.length >= 3) {
        features.push({
          No: cols[0],
          Category: cols[1],
          Feature: cols[2],
          Value: cols[3] || ''
        });
      }
    }
    
    console.log(`✅ CSV 로드: ${features.length}개 특성`);
    return features;
  } catch {
    console.log('⚠️ CSV 폴백: VIDEO_FEATURES 사용');
    return VIDEO_FEATURES.map(f => ({
      No: f.no,
      Category: f.category,
      Feature: f.item,
      Value: ''
    }));
  }
}

function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current);
  return result.map(col => col.trim());
}

// YouTube API
function getYouTubeVideoId(url: string): string | null {
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/
  ];
  
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// Gemini API 키 로드
function getGeminiApiKeys(): string[] {
  const keys = process.env.GEMINI_API_KEY || '';
  return keys.split(',').map(k => k.trim()).filter(k => k.length > 0);
}

// Gemini API 호출 (폴백 포함)
async function callGeminiWithFallback(prompt: string, apiKeys: string[]): Promise<any> {
  if (apiKeys.length === 0) {
    throw new Error('No Gemini API keys available');
  }

  let lastError: any = null;
  
  for (const apiKey of apiKeys) {
    try {
      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
      
      const result = await model.generateContent({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 8000,
        },
      });
      
      const responseText = result.response?.text() || '{}';
      return JSON.parse(responseText);
    } catch (error: any) {
      lastError = error;
      console.log(`⚠️ API 키 실패 (${apiKey.substring(0, 10)}...): ${error.message}`);
      
      // 403 Forbidden이나 할당량 초과 오류면 다음 키로
      if (error.message?.includes('403') || 
          error.message?.includes('quota') ||
          error.message?.includes('RESOURCE_EXHAUSTED')) {
        continue;
      }
      // 다른 오류는 즉시 throw
      throw error;
    }
  }
  
  // 모든 키 실패
  throw new Error(`All Gemini API keys failed. Last error: ${lastError?.message || 'Unknown'}`);
}

// Gemini 프롬프트 생성
function buildGeminiPrompt(videoData: any, scriptData: any, features: Feature[]): string {
  const title = videoData.snippet?.title || '';
  const description = videoData.snippet?.description || '';
  const script = scriptData.script;
  
  let prompt = `아래 YouTube 영상을 분석하여 156가지 특성을 JSON으로 반환하세요.\n\n`;
  prompt += `제목: ${title}\n`;
  prompt += `설명: ${description}\n`;
  prompt += `자막: ${script}\n\n`;
  prompt += `다음 특성들을 분석하고 JSON 형식으로 반환하세요:\n`;
  
  features.forEach(f => {
    prompt += `"feature_${f.No}": "${f.Feature}" (카테고리: ${f.Category})\n`;
  });
  
  prompt += `\n응답은 반드시 다음 JSON 형식이어야 합니다:\n`;
  prompt += `{ "feature_1": "값1", "feature_2": "값2", ... "feature_156": "값156" }\n`;
  prompt += `분석 불가능한 항목은 "분석불가"로 표시하세요.`;
  
  return prompt;
}

// 자막 추출
async function extractSubtitles(videoId: string): Promise<{ script: string; language: string }> {
  try {
    const captions = await getSubtitles({ videoID: videoId, lang: 'ko' });
    const script = captions.map(c => c.text).join(' ');
    return { script, language: 'ko' };
  } catch {
    try {
      const captions = await getSubtitles({ videoID: videoId, lang: 'en' });
      const script = captions.map(c => c.text).join(' ');
      return { script, language: 'en' };
    } catch {
      return { script: '', language: 'none' };
    }
  }
}

// YouTube 메타데이터 기반 추론
function inferFeaturesFromYouTubeMetadata(videoData: any, features: Feature[]): any {
  const result: any = {};
  const snippet = videoData.snippet;
  const statistics = videoData.statistics;
  const contentDetails = videoData.contentDetails;
  
  features.forEach(feature => {
    const featureKey = `feature_${feature.No}`;
    
    if (feature.Feature.includes('조회수')) {
      result[featureKey] = statistics?.viewCount ? 
        parseInt(statistics.viewCount).toLocaleString() : '0';
    } else if (feature.Feature.includes('좋아요')) {
      result[featureKey] = statistics?.likeCount ? 
        parseInt(statistics.likeCount).toLocaleString() : '0';
    } else if (feature.Feature.includes('댓글')) {
      result[featureKey] = statistics?.commentCount ? 
        parseInt(statistics.commentCount).toLocaleString() : '0';
    } else if (feature.Feature.includes('영상 길이') || feature.Feature.includes('전체 영상 길이')) {
      if (contentDetails?.duration) {
        const match = contentDetails.duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
        if (match) {
          const [, h = '0', m = '0', s = '0'] = match;
          result[featureKey] = `${h}시간 ${m}분 ${s}초`;
        }
      }
    } else if (feature.Feature.includes('업로드')) {
      result[featureKey] = snippet?.publishedAt || 'N/A';
    }
  });
  
  return result;
}

// 완료도 계산
function calculateCompletionStats(analysis: any) {
  let completed = 0;
  let incomplete = 0;
  const total = 156;

  Object.keys(analysis).forEach(key => {
    const value = String(analysis[key] || '');
    if (value.includes('분석불가') || value === 'N/A' || value === '') {
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

// 단일 영상 분석
async function analyzeSingleVideo(
  video: any, 
  features: Feature[], 
  youtube: any | null, 
  apiKeys: string[]
): Promise<any> {
  const videoId = getYouTubeVideoId(video.url);
  if (!videoId) throw new Error(`Invalid YouTube URL: ${video.url}`);

  console.log(`🎬 분석 시작: ${video.title}`);

  // YouTube 메타데이터 수집
  let videoData: any = null;
  if (youtube) {
    try {
      const response = await youtube.videos.list({
        part: ['snippet', 'statistics', 'contentDetails'],
        id: [videoId],
      });
      if (response.data.items && response.data.items.length > 0) {
        videoData = response.data.items[0];
      }
    } catch (error: any) {
      console.log('⚠️ YouTube API 오류:', error.message);
    }
  }

  if (!videoData) {
    videoData = {
      snippet: { title: video.title, description: '', channelTitle: 'N/A', publishedAt: '' },
      statistics: { viewCount: '', likeCount: '', commentCount: '' },
      contentDetails: { duration: '' }
    };
  }

  // 자막 추출
  const scriptData = await extractSubtitles(videoId);

  // YouTube 메타데이터 기반 추론
  const baseInferences = inferFeaturesFromYouTubeMetadata(videoData, features);
  console.log(`📊 메타데이터로 ${Object.keys(baseInferences).length}개 채움`);

  // Gemini AI 분석
  let geminiAnalysis: any = {};
  let geminiErrorReason: string | null = null;

  if (apiKeys.length > 0) {
    try {
      const prompt = buildGeminiPrompt(videoData, scriptData, features);
      geminiAnalysis = await callGeminiWithFallback(prompt, apiKeys);
      console.log(`✅ Gemini 분석 완료: ${Object.keys(geminiAnalysis).length}개`);
    } catch (error: any) {
      geminiErrorReason = error.message;
      console.log('⚠️ Gemini 분석 실패:', error.message);
    }
  }

  // 결과 병합
  const finalAnalysis: any = {};
  features.forEach(feature => {
    const key = `feature_${feature.No}`;
    finalAnalysis[key] = geminiAnalysis[key] || baseInferences[key] || 'N/A';
  });

  // 카테고리별 정리
  const categorizedAnalysis: any = {};
  features.forEach(feature => {
    if (!categorizedAnalysis[feature.Category]) {
      categorizedAnalysis[feature.Category] = {};
    }
    categorizedAnalysis[feature.Category][feature.Feature] = finalAnalysis[`feature_${feature.No}`];
  });

  const completionStats = calculateCompletionStats(finalAnalysis);

  return {
    id: videoId,
    title: video.title,
    url: video.url,
    notes: video.note || '',
    status: completionStats.percentage > 5 ? 'completed' : 'failed',
    analysis: categorizedAnalysis,
    features: finalAnalysis,
    completionStats,
    scriptLanguage: scriptData.language,
    geminiStatus: geminiErrorReason,
    youtubeData: {
      viewCount: parseInt(videoData.statistics?.viewCount || '0'),
      likeCount: parseInt(videoData.statistics?.likeCount || '0'),
      commentCount: parseInt(videoData.statistics?.commentCount || '0'),
      duration: videoData.contentDetails?.duration || '',
      channelTitle: videoData.snippet?.channelTitle || '',
      publishedAt: videoData.snippet?.publishedAt || '',
      description: videoData.snippet?.description || '',
      tags: [],
      categoryId: ''
    }
  };
}

// 전역 진행 상황 초기화
declare global {
  var analysisProgress: {
    total: number;
    completed: number;
    current: string;
    stage: 'youtube' | 'gemini' | 'complete';
    videos: any[];
  } | undefined;
}

// 메인 POST 핸들러
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
    console.log(`🎯 분석 시작: ${videos.length}개 영상, ${features.length}개 특성`);

    // 전역 진행 상황 초기화
    global.analysisProgress = {
      total: videos.length,
      completed: 0,
      current: '',
      stage: 'youtube',
      videos: []
    };

    // YouTube API 초기화
    let youtube = null;
    const youtubeApiKey = process.env.YOUTUBE_API_KEY;
    if (youtubeApiKey) {
      youtube = google.youtube({ version: 'v3', auth: youtubeApiKey });
      console.log('✅ YouTube API 초기화');
    }

    // Gemini API 키 로드
    const geminiApiKeys = getGeminiApiKeys();

    // SQL DB 초기화
    const db = getGlobalDB();

    const results: any[] = [];

    // 각 영상 순차 처리
    for (let i = 0; i < videos.length; i++) {
      const video = videos[i];
      
      // 진행 상황 업데이트
      global.analysisProgress.current = video.title;
      global.analysisProgress.completed = i;
      
      try {
        // 영상 분석
        const result = await analyzeSingleVideo(video, features, youtube, geminiApiKeys);
        
        // 하이브리드 점수 계산
        const hybridScore = calculateHybridScore({
          ...result,
          createdAt: new Date().toISOString()
        });
        result.hybridScore = hybridScore;

        // SQL DB에 저장
        db.saveAnalysisResult({
          ...result,
          createdAt: new Date().toISOString()
        });

        // 결과 배열에 추가
        results.push(result);
        
        // 전역 진행 상황에도 추가
        global.analysisProgress.videos.push(result);
        
        console.log(`✅ 영상 ${i + 1}/${videos.length} 완료: ${video.title}`);
        
        // API 호출 간 딜레이
        if (i < videos.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (error: any) {
        console.error(`❌ 영상 분석 실패 [${video.title}]:`, error.message);
        
        const videoId = getYouTubeVideoId(video.url);
        
        // 실패한 영상도 반드시 results에 추가 (CRITICAL)
        const failedResult = {
          id: videoId || `failed_${i}`,
          title: video.title,
          url: video.url,
          notes: video.note || '',
          status: 'failed',
          error: error.message,
          completionStats: {
            completed: 0,
            incomplete: 156,
            total: 156,
            percentage: 0
          }
        };
        
        results.push(failedResult);
        
        // 전역 진행 상황에도 실패 항목 추가
        global.analysisProgress.videos.push(failedResult);
        
        // DB에도 실패 기록
        if (videoId) {
          db.markAnalysisFailed(videoId, error.message);
        }
      }
    }

    // 진행 상황 완료 표시
    global.analysisProgress.completed = videos.length;
    global.analysisProgress.stage = 'complete';

    console.log(`🎉 전체 분석 완료: ${results.length}개`);

    // 성공/실패 통계
    const successCount = results.filter(r => r.status === 'completed').length;
    const failureCount = results.filter(r => r.status === 'failed').length;

    return NextResponse.json({
      message: '분석이 완료되었습니다.',
      results,
      stats: {
        total: videos.length,
        success: successCount,
        failure: failureCount,
        ...db.getStatistics()
      }
    });

  } catch (error: any) {
    console.error('❌ API 오류:', error);
    
    // 전역 진행 상황 초기화
    if (global.analysisProgress) {
      global.analysisProgress.stage = 'complete';
    }
    
    return NextResponse.json(
      { 
        message: '분석 중 오류가 발생했습니다.', 
        error: error.message 
      },
      { status: 500 }
    );
  }
}
