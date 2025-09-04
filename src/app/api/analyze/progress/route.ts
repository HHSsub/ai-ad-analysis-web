import { NextResponse } from 'next/server';

// 이 변수는 analyze/route.ts와 공유되어야 합니다.
// 실제 구현에서는 Redis나 데이터베이스를 사용하는 것이 좋습니다.
declare global {
  var analysisProgress: {
    total: number;
    completed: number;
    current: string;
    stage: 'youtube' | 'gemini' | 'complete';
    videos: any[];
  } | undefined;
}

export async function GET() {
  try {
    // 전역 변수에서 진행상황 가져오기
    const progress = global.analysisProgress || {
      total: 0,
      completed: 0,
      current: '',
      stage: 'complete' as const,
      videos: []
    };

    return NextResponse.json({
      progress,
      videos: progress.videos
    });

  } catch (error) {
    console.error('Progress API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}