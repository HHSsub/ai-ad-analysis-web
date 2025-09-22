import { NextRequest, NextResponse } from 'next/server';

interface CollectionRequest {
  searchQueries?: string[];
  maxAdsPerQuery?: number;
  sources?: ('apify' | 'serpapi')[];
}

interface CollectionResponse {
  success: boolean;
  message: string;
  data?: {
    total_collected: number;
    new_ads: number;
    apify: number;
    serpapi: number;
    skipped_queries: number;
  };
  error?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<CollectionResponse>> {
  try {
    const body: CollectionRequest = await request.json();

    // 요청 검증
    const {
      searchQueries = [
        "advertisement commercial",
        "product promotion", 
        "brand commercial",
        "sponsored content"
      ],
      maxAdsPerQuery = 20,
      sources = ['apify', 'serpapi']
    } = body;

    // Python 수집 스크립트 실행
    const { spawn } = require('child_process');

    return new Promise((resolve) => {
      const pythonProcess = spawn('python3', [
        './scripts/youtube_ads_collector_with_db.py',
        '--queries', JSON.stringify(searchQueries),
        '--max-ads', maxAdsPerQuery.toString(),
        '--sources', JSON.stringify(sources)
      ]);

      let output = '';
      let errorOutput = '';

      pythonProcess.stdout.on('data', (data: Buffer) => {
        output += data.toString();
      });

      pythonProcess.stderr.on('data', (data: Buffer) => {
        errorOutput += data.toString();
      });

      pythonProcess.on('close', (code: number) => {
        if (code === 0) {
          try {
            // Python 스크립트 출력 파싱
            const results = JSON.parse(output.split('\n').find(line => line.startsWith('RESULT:')) || '{"total_collected": 0}');

            resolve(NextResponse.json({
              success: true,
              message: `수집 완료: ${results.total_collected}개 광고 수집됨`,
              data: results
            }));
          } catch (e) {
            resolve(NextResponse.json({
              success: false,
              message: '수집 결과 파싱 실패',
              error: String(e)
            }));
          }
        } else {
          resolve(NextResponse.json({
            success: false,
            message: '수집 스크립트 실행 실패',
            error: errorOutput
          }));
        }
      });

      // 타임아웃 설정 (5분)
      setTimeout(() => {
        pythonProcess.kill();
        resolve(NextResponse.json({
          success: false,
          message: '수집 타임아웃',
          error: 'Collection process timed out after 5 minutes'
        }));
      }, 300000);
    });

  } catch (error) {
    console.error('Collection API Error:', error);
    return NextResponse.json({
      success: false,
      message: '수집 요청 처리 실패',
      error: String(error)
    });
  }
}

export async function GET(): Promise<NextResponse> {
  try {
    // 현재 수집 상태 조회
    const { spawn } = require('child_process');

    return new Promise((resolve) => {
      const pythonProcess = spawn('python3', [
        './scripts/database_setup.py',
        'stats'
      ]);

      let output = '';

      pythonProcess.stdout.on('data', (data: Buffer) => {
        output += data.toString();
      });

      pythonProcess.on('close', (code: number) => {
        if (code === 0) {
          resolve(NextResponse.json({
            success: true,
            message: '상태 조회 완료',
            data: { status: output }
          }));
        } else {
          resolve(NextResponse.json({
            success: false,
            message: '상태 조회 실패'
          }));
        }
      });
    });

  } catch (error) {
    return NextResponse.json({
      success: false,
      message: '상태 조회 중 오류 발생',
      error: String(error)
    });
  }
}
