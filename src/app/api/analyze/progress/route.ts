import { NextRequest, NextResponse } from 'next/server';

// 전역 변수를 직접 참조하도록 수정
declare global {
  var analysisProgress: {
    total: number;
    completed: number;
    current: string;
    stage: 'youtube' | 'gemini' | 'complete';
    videos: any[];
  } | undefined;
}

export async function GET(request: NextRequest) {
  try {
    // global 객체에서 직접 가져오기
    const progress = global.analysisProgress || {
      total: 0,
      completed: 0,
      current: '',
      stage: 'complete' as const,
      videos: []
    };

    console.log(`📊 Progress API 호출 - 완료: ${progress.completed}/${progress.total}, 단계: ${progress.stage}`);

    // 성공/실패 통계 계산
    const videos = progress.videos || [];
    const successCount = videos.filter((v: any) => 
      v.status === 'completed' && (v.completionStats?.percentage || 0) > 5
    ).length;
    const failureCount = videos.filter((v: any) => 
      v.status === 'failed' || (v.completionStats?.percentage || 0) <= 5
    ).length;

    return NextResponse.json({
      progress: {
        ...progress,
        statistics: {
          success: successCount,
          failure: failureCount,
          processing: progress.total - progress.completed
        }
      },
      videos: progress.videos
    });

  } catch (error) {
    console.error('Progress API error:', error);
    return NextResponse.json({ 
      error: 'Internal server error',
      progress: {
        total: 0,
        completed: 0,
        current: '',
        stage: 'complete',
        videos: [],
        statistics: {
          success: 0,
          failure: 0,
          processing: 0
        }
      }
    }, { status: 500 });
  }
}
