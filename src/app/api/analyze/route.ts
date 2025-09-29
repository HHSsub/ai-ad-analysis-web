// src/app/api/analyze/route.ts - 전면 수정
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
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&\n?#]+)/,
    /youtube\.com\/shorts\/([^&\n?#]+)/
  ];
  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match) return match[1];
  }
  return null;
}

// 자막 추출
async function extractSubtitles(videoId: string) {
  try {
    const captions = await getSubtitles({ videoID: videoId, lang: 'ko' });
    const fullText = captions.map((c: any) => c.text).join(' ');
    return { language: 'ko', text: fullText };
  } catch {
    try {
      const captions = await getSubtitles({ videoID: videoId, lang: 'en' });
      const fullText = captions.map((c: any) => c.text).join(' ');
      return { language: 'en', text: fullText };
    } catch {
      return { language: 'none', text: '' };
    }
  }
}

// Gemini API 키 로드
function getGeminiApiKeys(): string[] {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return [];
  return key.split(',').map(k => k.trim()).filter(Boolean);
}

// Gemini 프롬프트 생성
function buildGeminiPrompt(videoData: any, scriptData: any, features: Feature[]): string {
  const { snippet, statistics, contentDetails } = videoData;
  
  const getDurationInSeconds = (duration: string): number => {
    const match = duration.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    if (!match) return 0;
    const [, hours = '0', minutes = '0', seconds = '0'] = match;
    return parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseInt(seconds);
  };

  const durationSeconds = getDurationInSeconds(contentDetails?.duration || '');
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
# YouTube Video Analysis Expert

**Video Type:** ${isShortVideo ? 'SHORT (≤60s)' : 'STANDARD (>60s)'}
**Duration:** ${durationSeconds}s
**Title:** ${snippet?.title || 'N/A'}
**Channel:** ${snippet?.channelTitle || 'N/A'}
**Views:** ${statistics?.viewCount || 'N/A'}
**Script:** ${scriptData.text ? scriptData.text.substring(0, 300) + '...' : 'No script'}

## Analysis Features (156):
${featuresText}

## Instructions:
1. Provide specific, evidence-based analysis
2. For short videos, focus on immediate visual impact
3. Use "분석불가/reason" only when truly impossible
4. Make educated guesses based on visual/audio cues

## Response Format (JSON):
{
  "feature_1": "analyzed value or 분석불가/reason",
  "feature_2": "analyzed value or 분석불가/reason",
  ...
  "feature_156": "analyzed value or 분석불가/reason"
}`.trim();
}

// Gemini AI 호출
async function callGeminiWithFallback(prompt: string, apiKeys: string[], retries: number = 3): Promise<any> {
  let lastError: any = null;

  for (let attempt = 0; attempt < retries; attempt++) {
    for (const apiKey of apiKeys) {
      try {
        const genAI = new GoogleGenerativeAI(apiKey);
        const model = genAI.getGenerativeModel({ model: 'gemini-1.5-pro' });
        
        const result = await model.generateContent(prompt);
        const responseText = result.response.text();
        
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          return JSON.parse(jsonMatch[0]);
        }
        
        console.warn(`⚠️ JSON 파싱 실패 (키 ${apiKey.substring(0, 8)}...)`);
      } catch (error: any) {
        lastError = error;
        console.warn(`⚠️ Gemini 호출 실패 (${attempt + 1}/${retries}):`, error.message);
      }
    }
    
    if (attempt < retries - 1) {
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  throw lastError || new Error('All Gemini API attempts failed');
}

// YouTube 메타데이터 기반 추론
function inferFeaturesFromYouTubeMetadata(videoData: any, features: Feature[]): any {
  const { snippet, statistics, contentDetails } = videoData;
  const result: any = {};
  
  features.forEach(feature => {
    const featureKey = `feature_${feature.No}`;
    
    if (feature.Feature.includes('영상 제목') || feature.Feature.includes('제목')) {
      result[featureKey] = snippet?.title || 'N/A';
    } else if (feature.Feature.includes('채널')) {
      result[featureKey] = snippet?.channelTitle || 'N/A';
    } else if (feature.Feature.includes('조회수')) {
      result[featureKey] = statistics?.viewCount ? parseInt(statistics.viewCount).toLocaleString() : '0';
    } else if (feature.Feature.includes('좋아요')) {
      result[featureKey] = statistics?.likeCount ? parseInt(statistics.likeCount).toLocaleString() : '0';
    } else if (feature.Feature.includes('댓글')) {
      result[featureKey] = statistics?.commentCount ? parseInt(statistics.commentCount).toLocaleString() : '0';
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
async function analyzeSingleVideo(video: any, features: Feature[], youtube: any | null, apiKeys: string[]): Promise<any> {
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
    } catch (error) {
      console.log('⚠️ YouTube API 오류');
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

// 메인 POST 핸들러
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { videos } = body;

    if (!videos || !Array.isArray(videos) || videos.length === 0) {
      return NextResponse.json({ message: '분석할 영상 목록이 필요합니다.' }, { status: 400 });
    }

    const features = getFeaturesFromCSV();
    console.log(`🎯 분석 시작: ${videos.length}개 영상, ${features.length}개 특성`);

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

    for (let i = 0; i < videos.length; i++) {
      const video = videos[i];
      
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

        results.push(result);
        console.log(`✅ 영상 ${i + 1}/${videos.length} 완료: ${video.title}`);
        
        if (i < videos.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 2000));
        }
      } catch (error: any) {
        console.error(`❌ 영상 분석 실패 [${video.title}]:`, error.message);
        
        const videoId = getYouTubeVideoId(video.url);
        if (videoId) {
          db.markAnalysisFailed(videoId, error.message);
        }
        
        results.push({
          status: 'rejected',
          reason: error.message,
          url: video.url
        });
      }
    }

    console.log(`🎉 전체 분석 완료: ${results.length}개`);

    return NextResponse.json({
      message: '분석이 완료되었습니다.',
      results,
      stats: db.getStatistics()
    });

  } catch (error: any) {
    console.error('❌ API 오류:', error);
    return NextResponse.json(
      { message: '분석 중 오류가 발생했습니다.', error: error.message },
      { status: 500 }
    );
  }
}
