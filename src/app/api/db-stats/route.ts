// src/app/api/db-stats/route.ts - 정확한 DB 통계 조회
import { NextRequest, NextResponse } from 'next/server';
import { getGlobalDB } from '@/lib/sql-database';

export async function GET(request: NextRequest) {
  try {
    const db = getGlobalDB();
    
    // DB 연결 상태 확인
    if (!db.isHealthy()) {
      return NextResponse.json({
        error: 'Database connection failed',
        healthy: false
      }, { status: 500 });
    }

    // 기본 통계
    const basicStats = db.getStatistics();
    
    // 추가 상세 통계
    const detailedStats = db.db.prepare(`
      SELECT 
        status,
        COUNT(*) as count,
        AVG(CASE 
          WHEN view_count IS NOT NULL AND view_count > 0 
          THEN view_count 
          ELSE NULL 
        END) as avg_views,
        MAX(analyzed_at) as latest_analysis
      FROM video_analysis 
      GROUP BY status
    `).all();

    // 156개 특성 완성도 통계
    const featureStats = db.db.prepare(`
      SELECT 
        v.id,
        v.title,
        COUNT(f.id) as features_count,
        COUNT(CASE WHEN f.feature_value != 'N/A' AND f.feature_value != '' THEN 1 END) as completed_features
      FROM video_analysis v
      LEFT JOIN video_features f ON v.id = f.video_id
      WHERE v.status = 'completed'
      GROUP BY v.id
      ORDER BY completed_features DESC
      LIMIT 10
    `).all();

    // 오늘/최근 7일 분석 통계
    const recentStats = db.db.prepare(`
      SELECT 
        DATE(analyzed_at) as analysis_date,
        COUNT(*) as daily_count,
        COUNT(CASE WHEN status = 'completed' THEN 1 END) as success_count,
        COUNT(CASE WHEN status = 'failed' THEN 1 END) as failed_count
      FROM video_analysis 
      WHERE analyzed_at >= date('now', '-7 days')
      GROUP BY DATE(analyzed_at)
      ORDER BY analysis_date DESC
    `).all();

    // 에러 분석
    const errorStats = db.db.prepare(`
      SELECT 
        error_message,
        COUNT(*) as count
      FROM analysis_queue 
      WHERE status = 'failed' 
        AND error_message IS NOT NULL
      GROUP BY error_message
      ORDER BY count DESC
      LIMIT 5
    `).all();

    const response = {
      healthy: true,
      timestamp: new Date().toISOString(),
      basic: basicStats,
      detailed: detailedStats,
      features: featureStats,
      recent: recentStats,
      errors: errorStats,
      summary: {
        total_videos: basicStats.total,
        completion_rate: basicStats.total > 0 ? 
          Math.round((basicStats.completed / basicStats.total) * 100) : 0,
        failure_rate: basicStats.total > 0 ? 
          Math.round((basicStats.failed / basicStats.total) * 100) : 0,
        pending_videos: basicStats.pending
      }
    };

    console.log(`📊 DB 통계 조회 완료: ${basicStats.total}개 총 영상, ${basicStats.completed}개 완료, ${basicStats.failed}개 실패, ${basicStats.pending}개 대기`);

    return NextResponse.json(response);

  } catch (error: any) {
    console.error('❌ DB 통계 조회 실패:', error);
    return NextResponse.json({
      error: 'Failed to fetch database statistics',
      message: error.message,
      healthy: false
    }, { status: 500 });
  }
}
