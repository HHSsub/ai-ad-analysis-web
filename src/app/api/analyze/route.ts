import { NextRequest, NextResponse } from 'next/server';
import { getVideoMetadata, extractVideoId, getVideoComments } from '@/services/youtubeService';
import { analyzeVideoWithGemini } from '@/services/geminiService';
import { VideoInput, AnalyzedVideo, VIDEO_FEATURES } from '@/types/video';

// 전역 변수로 분석 진행상황 저장 (실제 운영에서는 Redis 등 사용 권장)
global.analysisProgress = global.analysisProgress || {
  total: 0,
  completed: 0,
  current: '',
  stage: 'complete' as const,
  videos: []
};

export async function POST(request: NextRequest) {
  try {
    const { videos }: { videos: VideoInput[] } = await request.json();
    
    if (!videos || videos.length === 0) {
      return NextResponse.json({ error: 'No videos provided' }, { status: 400 });
    }

    // 분석 초기화
    global.analysisProgress = {
      total: videos.length,
      completed: 0,
      current: '',
      stage: 'youtube',
      videos: []
    };

    // 백그라운드에서 분석 시작 (await 없이)
    analyzeVideosInBackground(videos);

    return NextResponse.json({ 
      message: 'Analysis started',
      total: videos.length 
    });

  } catch (error) {
    console.error('Analysis API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

async function analyzeVideosInBackground(videos: VideoInput[]) {
  for (let i = 0; i < videos.length; i++) {
    const video = videos[i];
    
    try {
      global.analysisProgress!.current = video.title;
      global.analysisProgress!.stage = 'youtube';

      // 1. YouTube 비디오 ID 추출
      const videoId = extractVideoId(video.url);
      if (!videoId) {
        throw new Error('Invalid YouTube URL');
      }

      // 2. YouTube 메타데이터 수집
      const youtubeData = await getVideoMetadata(videoId);
      
      // 3. 초기 AnalyzedVideo 객체 생성
      const analyzedVideo: AnalyzedVideo = {
        id: `video_${Date.now()}_${i}`,
        title: video.title,
        url: video.url,
        note: video.note,
        status: 'analyzing',
        createdAt: new Date().toISOString(),
        youtubeData,
        features: initializeFeatures(youtubeData)
      };

      global.analysisProgress!.videos.push(analyzedVideo);

      // 4. Gemini를 사용한 상세 분석
      global.analysisProgress!.stage = 'gemini';
      
      try {
        const enhancedFeatures = await analyzeVideoWithGemini(video.url, analyzedVideo.features);
        analyzedVideo.features = enhancedFeatures;
        analyzedVideo.status = 'completed';
      } catch (geminiError) {
        console.error('Gemini analysis error:', geminiError);
        analyzedVideo.status = 'incomplete';
        analyzedVideo.error = 'AI 분석 부분 실패';
      }

      // 5. 진행률 업데이트
      global.analysisProgress!.completed = i + 1;
      
      // 완료된 비디오 업데이트
      const videoIndex = global.analysisProgress!.videos.findIndex(v => v.id === analyzedVideo.id);
      if (videoIndex !== -1) {
        global.analysisProgress!.videos[videoIndex] = analyzedVideo;
      }

    } catch (error) {
      console.error(`Error analyzing video ${i}:`, error);
      
      const failedVideo: AnalyzedVideo = {
        id: `video_${Date.now()}_${i}`,
        title: video.title,
        url: video.url,
        note: video.note,
        status: 'failed',
        error: error instanceof Error ? error.message : '알 수 없는 오류',
        createdAt: new Date().toISOString(),
        features: {}
      };

      global.analysisProgress!.videos.push(failedVideo);
      global.analysisProgress!.completed = i + 1;
    }
  }

  global.analysisProgress!.stage = 'complete';
  global.analysisProgress!.current = '';
}

// YouTube 데이터를 기반으로 기본 features 초기화
function initializeFeatures(youtubeData: any): any {
  const features: any = {};
  
  // 156개 feature를 기본값으로 초기화
  VIDEO_FEATURES.forEach(feature => {
    const key = `feature_${feature.no}`;
    features[key] = getInitialFeatureValue(feature, youtubeData);
  });

  return features;
}

function getInitialFeatureValue(feature: any, youtubeData: any): string {
  const { no, category, item } = feature;

  // YouTube 데이터에서 직접 매핑 가능한 항목들
  switch (no) {
    case 153: // 산업
      return getCategoryFromId(youtubeData.categoryId) || 'N/A';
    case 156: // 전체 영상 길이
      return youtubeData.duration || 'N/A';
    case 22: // 인물 수 (기본값 1로 설정)
      return '1';
    case 41: // 실내/실외 (기본값)
      return '실내';
    default:
      return 'N/A';
  }
}

function getCategoryFromId(categoryId: string): string {
  const categories: Record<string, string> = {
    '1': '영화 & 애니메이션',
    '2': '자동차 & 교통',
    '10': '음악',
    '15': '애완동물 & 동물',
    '17': '스포츠',
    '19': '여행 & 이벤트',
    '20': '게임',
    '22': '사람 & 블로그',
    '23': '코미디',
    '24': '엔터테인먼트',
    '25': '뉴스 & 정치',
    '26': '하우투 & 스타일',
    '27': '교육',
    '28': '과학 & 기술'
  };
  
  return categories[categoryId] || '기타';
}