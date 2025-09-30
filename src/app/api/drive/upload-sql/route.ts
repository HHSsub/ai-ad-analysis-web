// src/app/api/drive/upload-sql/route.ts - DB를 Drive에 업로드
import { NextRequest, NextResponse } from 'next/server';
import { getGlobalDriveManager } from '@/lib/google-drive';
import { getGlobalDB } from '@/lib/sql-database';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { format = 'csv' } = body;

    if (format !== 'csv') {
      return NextResponse.json({
        error: 'Unsupported format',
        message: 'Currently only CSV format is supported'
      }, { status: 400 });
    }

    console.log('📤 Drive 업로드 시작...');

    // DB 연결 상태 확인
    const db = getGlobalDB();
    if (!db.isHealthy()) {
      return NextResponse.json({
        error: 'Database connection failed',
        message: 'Cannot connect to database'
      }, { status: 500 });
    }

    // DB 통계 확인
    const stats = db.getStatistics();
    if (stats.completed === 0) {
      return NextResponse.json({
        error: 'No data to upload',
        message: 'No completed analysis found in database'
      }, { status: 400 });
    }

    console.log(`📊 업로드할 데이터: ${stats.completed}개 완료된 분석`);

    // Drive 매니저 초기화 및 업로드
    const driveManager = getGlobalDriveManager();
    const uploadUrl = await driveManager.uploadDatabaseCSV();

    if (!uploadUrl) {
      return NextResponse.json({
        error: 'Upload failed',
        message: 'Failed to upload CSV to Google Drive'
      }, { status: 500 });
    }

    // 업로드 성공 후 통계 다시 확인
    const finalStats = db.getStatistics();

    const response = {
      success: true,
      message: 'CSV uploaded to Google Drive successfully',
      uploadUrl,
      timestamp: new Date().toISOString(),
      stats: {
        total_videos: finalStats.total,
        completed_videos: finalStats.completed,
        failed_videos: finalStats.failed,
        pending_videos: finalStats.pending,
        features_per_video: 156
      }
    };

    console.log(`✅ Drive 업로드 완료: ${uploadUrl}`);
    return NextResponse.json(response);

  } catch (error: any) {
    console.error('❌ Drive 업로드 API 오류:', error);
    return NextResponse.json({
      error: 'Internal server error',
      message: error.message
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    // Drive 연결 상태 테스트
    const driveManager = getGlobalDriveManager();
    const accessible = await driveManager.testFolderAccess();

    const db = getGlobalDB();
    const stats = db.getStatistics();

    return NextResponse.json({
      drive_accessible: accessible,
      database_stats: stats,
      ready_for_upload: accessible && stats.completed > 0,
      message: accessible ? 
        'Google Drive is accessible and ready for upload' : 
        'Google Drive access failed - check folder permissions'
    });

  } catch (error: any) {
    console.error('❌ Drive 상태 확인 오류:', error);
    return NextResponse.json({
      error: 'Failed to check Drive status',
      message: error.message,
      drive_accessible: false,
      ready_for_upload: false
    }, { status: 500 });
  }
}
