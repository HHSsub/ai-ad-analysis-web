// src/app/api/db-stats/route.ts - 신규 생성
import { NextRequest, NextResponse } from 'next/server';
import { getGlobalDB } from '@/lib/sql-database';

export async function GET(request: NextRequest) {
  try {
    const db = getGlobalDB();
    const stats = db.getStatistics();

    return NextResponse.json(stats);
  } catch (error: any) {
    console.error('❌ DB 통계 조회 실패:', error.message);
    return NextResponse.json(
      { 
        total: 0, 
        pending: 0, 
        completed: 0, 
        failed: 0,
        error: error.message 
      },
      { status: 500 }
    );
  }
}
