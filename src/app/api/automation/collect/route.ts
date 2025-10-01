import { NextRequest, NextResponse } from 'next/server';
import { PythonExecutor } from '@/lib/python-executor';

export async function POST(request: NextRequest) {
  try {
    const { maxAds = 20, searchQueries } = await request.json();
    console.log(`🚀 Python 광고 수집 시작 - 최대 ${maxAds}개`);
    
    const executor = new PythonExecutor();
    const result = await executor.executeCollector({ maxAds, searchQueries });
    
    if (result.success) {
      // DB에서 최신 통계 가져오기
      const stats = await executor.getStats();
      
      return NextResponse.json({
        success: true,
        message: `광고 수집 완료! 새로운 데이터를 확인하세요.`,
        data: {
          output: result.output,
          stats
        }
      });
    } else {
      console.error('Python 수집 실패:', result.error);
      return NextResponse.json({
        success: false,
        message: `수집 실패: ${result.error}`,
        error: result.error
      }, { status: 500 });
    }
  } catch (error) {
    console.error('수집 API 에러:', error);
    return NextResponse.json({
      success: false,
      message: '수집 중 예상치 못한 오류가 발생했습니다.',
      error: error instanceof Error ? error.message : '알 수 없는 오류'
    }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    // URL에서 limit 파라미터 읽기
    const searchParams = request.nextUrl.searchParams;
    const limit = parseInt(searchParams.get('limit') || '10', 10);
    
    console.log(`📊 광고 데이터 조회 요청 - limit: ${limit}개`);
    
    const executor = new PythonExecutor();
    const stats = await executor.getStats();
    const recentAds = await executor.readDatabase();
    
    return NextResponse.json({
      success: true,
      data: {
        stats,
        recentAds: recentAds.slice(0, limit) // limit 파라미터 사용
      }
    });
  } catch (error) {
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '상태 조회 실패'
    }, { status: 500 });
  }
}
