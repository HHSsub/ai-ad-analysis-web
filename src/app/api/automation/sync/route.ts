import { NextRequest, NextResponse } from 'next/server';

interface SyncRequest {
  batchSize?: number;
  mode?: 'immediate' | 'scheduled';
}

interface SyncResponse {
  success: boolean;
  message: string;
  data?: {
    sent: number;
    success: number;
    failed: number;
  };
  error?: string;
}

export async function POST(request: NextRequest): Promise<NextResponse<SyncResponse>> {
  try {
    const body: SyncRequest = await request.json();

    const {
      batchSize = 10,
      mode = 'immediate'
    } = body;

    // web_service_connector.py 실행
    const { spawn } = require('child_process');

    return new Promise((resolve) => {
      const pythonProcess = spawn('python3', [
        './scripts/web_service_connector.py',
        '--mode', mode,
        '--batch-size', batchSize.toString(),
        '--web-url', process.env.NEXTAUTH_URL || 'http://localhost:3000'
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
            const results = JSON.parse(output.split('\n').find(line => line.startsWith('SYNC_RESULT:')) || '{"sent": 0}');

            resolve(NextResponse.json({
              success: true,
              message: `동기화 완료: ${results.sent}개 전송됨`,
              data: results
            }));
          } catch (e) {
            resolve(NextResponse.json({
              success: false,
              message: '동기화 결과 파싱 실패',
              error: String(e)
            }));
          }
        } else {
          resolve(NextResponse.json({
            success: false,
            message: '동기화 실행 실패',
            error: errorOutput
          }));
        }
      });
    });

  } catch (error) {
    console.error('Sync API Error:', error);
    return NextResponse.json({
      success: false,
      message: '동기화 요청 처리 실패',
      error: String(error)
    });
  }
}
